/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Client, Farm, Plot, SamplingPoint, Project, PlotPeriod } from './types';
import { 
  INITIAL_CLIENTS, INITIAL_FARMS, INITIAL_PLOTS, 
  INITIAL_SAMPLING_POINTS, INITIAL_PROJECTS 
} from './initialData';
import ClientManager from './components/ClientManager';
import MapContainer from './components/MapContainer';
import LabResultsManager from './components/LabResultsManager';
import AIPanel from './components/AIPanel';
import FertilityAndMaps from './components/FertilityAndMaps';
import { downloadGISZip } from './utils/fileExporter';
import { 
  Sprout, Database, Layers, CheckSquare, Download, 
  Briefcase, Landmark, Compass, HelpCircle, Clock, Check, CloudLightning, Calendar
} from 'lucide-react';

import { 
  collection, onSnapshot, doc, setDoc, writeBatch, getDocs, getDocFromServer, deleteDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { calculatePolygonArea } from './utils/kriging';

function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = (obj as any)[key];
        if (val !== undefined) {
          cleaned[key] = removeUndefined(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
}

export default function App() {
  // App Core State (Initially fallback to local static but quickly override with Firebase)
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [farms, setFarms] = useState<Farm[]>(INITIAL_FARMS);
  const [plots, setPlots] = useState<Plot[]>(INITIAL_PLOTS);
  const [plotPeriods, setPlotPeriods] = useState<PlotPeriod[]>([]);
  const [samplingPoints, setSamplingPoints] = useState<SamplingPoint[]>(INITIAL_SAMPLING_POINTS);
  const [projects, setProjects] = useState<Project[]>([]);

  // Active Workspace
  const [activePlotId, setActivePlotId] = useState<string>('plot-1');
  const [activeMonthYear, setActiveMonthYear] = useState<string>('05/2026');
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'field_station' | 'lab_results' | 'ai_panel' | 'fertility_maps'>('clients');
  const [globalDesiredV2, setGlobalDesiredV2] = useState<number>(70);
  const [globalPrnt, setGlobalPrnt] = useState<number>(80);

  // Db Status Counters
  const [dbStatus, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [timestamp, setTimestamp] = useState<string>('');

  // Synchronize dynamic UTC time indicator
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimestamp(now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR') + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Connection Health Check & Auto-Seeding if empty
  useEffect(() => {
    let active = true;

    async function checkAndSeed() {
      try {
        setDbStatus('connecting');
        // Simple connection diagnostic fetch
        await getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});

        // Fetch clients count to evaluate if we should seed default demonstration data
        const clientsSnap = await getDocs(collection(db, 'clients'));
        if (clientsSnap.empty) {
          console.log('Banco de Dados vazio! Semeando os registros iniciais do GeoSolo Pro no Firestore...');
          const batch = writeBatch(db);

          INITIAL_CLIENTS.forEach(cli => {
            batch.set(doc(db, 'clients', cli.id), removeUndefined(cli));
          });
          INITIAL_FARMS.forEach(f => {
            batch.set(doc(db, 'farms', f.id), removeUndefined(f));
          });
          INITIAL_PLOTS.forEach(p => {
            batch.set(doc(db, 'plots', p.id), removeUndefined(p));
          });
          INITIAL_SAMPLING_POINTS.forEach(pt => {
            batch.set(doc(db, 'samplingPoints', pt.id), removeUndefined(pt));
          });
          INITIAL_PROJECTS.forEach(proj => {
            batch.set(doc(db, 'projects', proj.id), removeUndefined(proj));
          });

          // Seed default plot periods (months/years) for the initial plots
          const defaultPeriods: PlotPeriod[] = [
            {
              id: 'period-1',
              plotId: 'plot-1',
              monthYear: '05/2026',
              cropType: 'Soja',
              notes: 'Amostragem Principal de Outono',
              creationDate: '2026-05-18T18:00:00Z'
            },
            {
              id: 'period-2',
              plotId: 'plot-2',
              monthYear: '05/2026',
              cropType: 'Milho',
              notes: 'Safrinha e cobertura',
              creationDate: '2026-05-18T18:00:00Z'
            }
          ];
          defaultPeriods.forEach(p => {
            batch.set(doc(db, 'plotPeriods', p.id), removeUndefined(p));
          });

          await batch.commit();
          console.log('Seeding concluído com sucesso!');
        }

        if (active) {
          setDbStatus('connected');
        }
      } catch (error) {
        console.error('Erro de conexão ao Firestore ou durante seeding:', error);
        if (active) {
          setDbStatus('error');
        }
      }
    }

    checkAndSeed();
    return () => {
      active = false;
    };
  }, []);

  // 2. Real-time Firebase Firestore OnSnapshot Observers
  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const list: Client[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Client);
      });
      if (list.length > 0) {
        setClients(list);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    const unsubFarms = onSnapshot(collection(db, 'farms'), (snapshot) => {
      const list: Farm[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Farm);
      });
      if (list.length > 0) {
        setFarms(list);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'farms');
    });

    const unsubPlots = onSnapshot(collection(db, 'plots'), (snapshot) => {
      const list: Plot[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Plot);
      });
      if (list.length > 0) {
        setPlots(list);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'plots');
    });

    const unsubSamplingPoints = onSnapshot(collection(db, 'samplingPoints'), (snapshot) => {
      const list: SamplingPoint[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as SamplingPoint);
      });
      setSamplingPoints(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'samplingPoints');
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const list: Project[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Project);
      });
      setProjects(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    const unsubPlotPeriods = onSnapshot(collection(db, 'plotPeriods'), (snapshot) => {
      const list: PlotPeriod[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as PlotPeriod);
      });
      setPlotPeriods(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'plotPeriods');
    });

    return () => {
      unsubClients();
      unsubFarms();
      unsubPlots();
      unsubSamplingPoints();
      unsubProjects();
      unsubPlotPeriods();
    };
  }, []);

  // Camadas de solo & Subamostras
  const [soilLayers, setSoilLayers] = useState<string[]>(['0-20cm', '20-40cm', '40-60cm']);
  const [activeSoilLayer, setActiveSoilLayer] = useState<string>('0-20cm');

  const activePlot = plots.find((p) => p.id === activePlotId) || plots[0];
  const activeFarm = farms.find((f) => f.id === activePlot?.farmId) || farms[0];
  const activeClient = clients.find((c) => c.id === activeFarm?.clientId) || clients[0];

  // Corrige discrepâncias de área salvas anteriormente por fórmulas antigas e aproximadas do KML
  useEffect(() => {
    if (activePlot && activePlot.boundaryPoints && activePlot.boundaryPoints.length >= 3) {
      const prcArea = parseFloat((calculatePolygonArea(activePlot.boundaryPoints) / 10000).toFixed(1));
      if (Math.abs(activePlot.areaHectares - prcArea) > 0.05) {
        const correctPlot = {
          ...activePlot,
          areaHectares: prcArea
        };
        setDoc(doc(db, 'plots', activePlot.id), removeUndefined(correctPlot))
          .catch((err) => console.error("Erro ao sincronizar correção automática de área do talhão:", err));
      }
    }
  }, [activePlot]);

  const rawActivePoints = useMemo(() => {
    return samplingPoints.filter((p) => p.plotId === activePlotId && (p.monthYear === activeMonthYear || (!p.monthYear && activeMonthYear === '05/2026')));
  }, [samplingPoints, activePlotId, activeMonthYear]);

  const activePoints = useMemo(() => {
    return rawActivePoints.map(p => {
      let subs = p.subsamples || [];
      if (subs.length === 0) {
        // Inicializa furos padrões de demonstração com degradação realística por profundidade
        subs = soilLayers.map(layer => {
          if (layer === '0-20cm') {
            return {
              id: `sub-0-20-${p.id}`,
              depth: '0-20cm',
              isCollected: p.isCollected,
              collectionDate: p.collectionDate,
              collectedBy: p.collectedBy,
              results: p.results
            };
          }
          const isCollected = p.isCollected && !!p.results;
          const multi = layer === '20-40cm' ? 0.75 : 0.5;
          return {
            id: `sub-${layer}-${p.id}`,
            depth: layer,
            isCollected,
            collectionDate: p.collectionDate,
            collectedBy: p.collectedBy,
            results: p.results ? {
              pH: parseFloat(Math.min(6.5, Math.max(4.0, p.results.pH - (layer === '20-40cm' ? 0.3 : 0.5))).toFixed(2)),
              MO: parseFloat((p.results.MO * multi).toFixed(1)),
              P: parseFloat(Math.max(1, p.results.P * multi * 0.8).toFixed(1)),
              K: parseFloat(Math.max(0.5, p.results.K * multi).toFixed(1)),
              Ca: parseFloat(Math.max(5, p.results.Ca * multi).toFixed(1)),
              Mg: parseFloat(Math.max(2, p.results.Mg * multi).toFixed(1)),
              Al: parseFloat(Math.max(0, p.results.Al * (2.0 - multi)).toFixed(1))
            } : undefined
          };
        });
      }

      // Garante que se existe uma nova camada adicionada pelo usuário, ela seja exposta no array de subsamples
      soilLayers.forEach(layer => {
        const hasLayer = subs.some(s => s.depth === layer);
        if (!hasLayer) {
          subs.push({
            id: `sub-${layer}-${p.id}`,
            depth: layer,
            isCollected: false
          });
        }
      });

      const activeSub = subs.find(s => s.depth === activeSoilLayer);
      return {
        ...p,
        subsamples: subs,
        isCollected: activeSub ? activeSub.isCollected : false,
        collectionDate: activeSub?.collectionDate || p.collectionDate,
        collectedBy: activeSub?.collectedBy || p.collectedBy,
        results: activeSub?.results
      };
    });
  }, [rawActivePoints, activeSoilLayer, soilLayers]);

  // 3. Write-through handles to synchronize all creation, updates, and deletes
  const handleAddClient = async (name: string, docNum: string, phone: string, email: string) => {
    const newCli: Client = {
      id: `cli-${Date.now()}`,
      name,
      document: docNum,
      phone,
      email,
    };
    try {
      await setDoc(doc(db, 'clients', newCli.id), removeUndefined(newCli));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clients/${newCli.id}`);
    }
  };

  const handleAddFarm = async (clientId: string, name: string, city: string, state: string, area: number) => {
    const newFarm: Farm = {
      id: `farm-${Date.now()}`,
      clientId,
      name,
      city,
      state,
      areaHectares: area,
    };
    try {
      await setDoc(doc(db, 'farms', newFarm.id), removeUndefined(newFarm));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${newFarm.id}`);
    }
  };

  const handleAddPlot = async (farmId: string, name: string, area: number, crop: string) => {
    const baseLat = activePlot?.boundaryPoints?.[0]?.lat || -21.17;
    const baseLng = activePlot?.boundaryPoints?.[0]?.lng || -47.81;

    const newPlot: Plot = {
      id: `plot-${Date.now()}`,
      farmId,
      name,
      areaHectares: area,
      cropType: crop,
      boundaryPoints: [
        { lat: baseLat + 0.005, lng: baseLng - 0.005 },
        { lat: baseLat + 0.005, lng: baseLng + 0.005 },
        { lat: baseLat - 0.005, lng: baseLng + 0.005 },
        { lat: baseLat - 0.005, lng: baseLng - 0.005 },
        { lat: baseLat + 0.005, lng: baseLng - 0.005 }
      ]
    };

    setActivePlotId(newPlot.id);
    setActiveMonthYear('05/2026');

    const initialPeriod: PlotPeriod = {
      id: `period-${Date.now()}`,
      plotId: newPlot.id,
      monthYear: '05/2026',
      cropType: crop,
      notes: 'Período inicial do talhão',
      creationDate: new Date().toISOString()
    };

    const initialPoints: SamplingPoint[] = [
      { id: `pt-n1-${Date.now()}`, plotId: newPlot.id, monthYear: '05/2026', pointNumber: 1, lat: baseLat + 0.002, lng: baseLng - 0.002, isCollected: false },
      { id: `pt-n2-${Date.now()}`, plotId: newPlot.id, monthYear: '05/2026', pointNumber: 2, lat: baseLat + 0.002, lng: baseLng + 0.002, isCollected: false },
      { id: `pt-n3-${Date.now()}`, plotId: newPlot.id, monthYear: '05/2026', pointNumber: 3, lat: baseLat - 0.002, lng: baseLng + 0.002, isCollected: false },
      { id: `pt-n4-${Date.now()}`, plotId: newPlot.id, monthYear: '05/2026', pointNumber: 4, lat: baseLat - 0.002, lng: baseLng - 0.002, isCollected: false }
    ];

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'plots', newPlot.id), removeUndefined(newPlot));
      batch.set(doc(db, 'plotPeriods', initialPeriod.id), removeUndefined(initialPeriod));
      initialPoints.forEach((pt) => {
        batch.set(doc(db, 'samplingPoints', pt.id), removeUndefined(pt));
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plots/${newPlot.id}`);
    }
  };

  const handleEditClient = async (id: string, name: string, docNum: string, phone: string, email: string) => {
    try {
      const ref = doc(db, 'clients', id);
      await setDoc(ref, removeUndefined({ id, name, document: docNum, phone, email }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clients/${id}`);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    }
  };

  const handleEditFarm = async (id: string, name: string, city: string, state: string, area: number) => {
    try {
      const farmObj = farms.find(f => f.id === id);
      if (!farmObj) return;
      const ref = doc(db, 'farms', id);
      await setDoc(ref, removeUndefined({ ...farmObj, name, city, state, areaHectares: area }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${id}`);
    }
  };

  const handleDeleteFarm = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'farms', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${id}`);
    }
  };

  const handleEditPlot = async (id: string, name: string, area: number, crop: string) => {
    try {
      const plotObj = plots.find(p => p.id === id);
      if (!plotObj) return;
      const ref = doc(db, 'plots', id);
      await setDoc(ref, removeUndefined({ ...plotObj, name, areaHectares: area, cropType: crop }), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plots/${id}`);
    }
  };

  const handleDeletePlot = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'plots', id));
      const plotPoints = samplingPoints.filter(p => p.plotId === id);
      if (plotPoints.length > 0) {
        const batch = writeBatch(db);
        plotPoints.forEach((p) => {
          batch.delete(doc(db, 'samplingPoints', p.id));
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `plots/${id}`);
    }
  };

  const handleAddPlotPeriod = async (plotId: string, monthYear: string, cropType: string, notes?: string) => {
    const newPeriod: PlotPeriod = {
      id: `period-${Date.now()}`,
      plotId,
      monthYear,
      cropType,
      notes: notes || '',
      creationDate: new Date().toISOString()
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'plotPeriods', newPeriod.id), removeUndefined(newPeriod));

      // Auto-generate 4 initial points inside the plot boundary for this specific month/year
      const plotObj = plots.find(p => p.id === plotId);
      if (plotObj && plotObj.boundaryPoints && plotObj.boundaryPoints.length > 0) {
        const baseLat = plotObj.boundaryPoints[0].lat;
        const baseLng = plotObj.boundaryPoints[0].lng;
        const initialPoints: SamplingPoint[] = [
          { id: `pt-p1-${Date.now()}`, plotId, monthYear, pointNumber: 1, lat: baseLat + 0.002, lng: baseLng - 0.002, isCollected: false },
          { id: `pt-p2-${Date.now()}`, plotId, monthYear, pointNumber: 2, lat: baseLat + 0.002, lng: baseLng + 0.002, isCollected: false },
          { id: `pt-p3-${Date.now() + 1}`, plotId, monthYear, pointNumber: 3, lat: baseLat - 0.002, lng: baseLng + 0.002, isCollected: false },
          { id: `pt-p4-${Date.now() + 2}`, plotId, monthYear, pointNumber: 4, lat: baseLat - 0.002, lng: baseLng - 0.002, isCollected: false }
        ];
        initialPoints.forEach((pt) => {
          batch.set(doc(db, 'samplingPoints', pt.id), removeUndefined(pt));
        });
      }
      await batch.commit();
      setActiveMonthYear(monthYear);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plotPeriods/${newPeriod.id}`);
    }
  };

  const handleEditPlotPeriod = async (id: string, monthYear: string, cropType: string, notes?: string) => {
    try {
      const p = plotPeriods.find(item => item.id === id);
      if (!p) return;
      
      const oldMonthYear = p.monthYear;
      const ref = doc(db, 'plotPeriods', id);
      await setDoc(ref, removeUndefined({ ...p, monthYear, cropType, notes }), { merge: true });
      
      // Update monthYear inside all sampling points for this plot period
      if (oldMonthYear !== monthYear) {
        const periodPoints = samplingPoints.filter(pt => pt.plotId === p.plotId && pt.monthYear === oldMonthYear);
        if (periodPoints.length > 0) {
          const batch = writeBatch(db);
          periodPoints.forEach((pt) => {
            batch.set(doc(db, 'samplingPoints', pt.id), removeUndefined({ ...pt, monthYear }), { merge: true });
          });
          await batch.commit();
        }
      }

      if (activeMonthYear === oldMonthYear) {
        setActiveMonthYear(monthYear);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plotPeriods/${id}`);
    }
  };

  const handleDeletePlotPeriod = async (id: string) => {
    try {
      const p = plotPeriods.find(item => item.id === id);
      if (!p) return;
      await deleteDoc(doc(db, 'plotPeriods', id));

      const periodPoints = samplingPoints.filter(pt => pt.plotId === p.plotId && pt.monthYear === p.monthYear);
      if (periodPoints.length > 0) {
        const batch = writeBatch(db);
        periodPoints.forEach((pt) => {
          batch.delete(doc(db, 'samplingPoints', pt.id));
        });
        await batch.commit();
      }

      // Reset active period
      const remaining = plotPeriods.filter(item => item.plotId === p.plotId && item.id !== id);
      if (remaining.length > 0) {
        setActiveMonthYear(remaining[0].monthYear);
      } else {
        setActiveMonthYear('05/2026');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `plotPeriods/${id}`);
    }
  };

  const handleUpdatePoints = async (updatedPoints: SamplingPoint[]) => {
    try {
      const batch = writeBatch(db);
      updatedPoints.forEach((pt) => {
        // Encontra o ponto original correspondente para preservar subsample das outras profundidades
        const originalPt = samplingPoints.find(p => p.id === pt.id);
        let subsObj = originalPt?.subsamples || pt.subsamples || [];

        if (subsObj.length === 0) {
          subsObj = soilLayers.map(layer => {
            if (layer === activeSoilLayer) {
              return {
                id: `sub-${layer}-${pt.id}`,
                depth: layer,
                isCollected: pt.isCollected,
                collectionDate: pt.collectionDate,
                collectedBy: pt.collectedBy,
                results: pt.results
              };
            }
            const baseResults = pt.results;
            const multiplier = layer === '0-20cm' ? 1.0 : (layer === '20-40cm' ? 0.75 : 0.5);
            return {
              id: `sub-${layer}-${pt.id}`,
              depth: layer,
              isCollected: pt.isCollected && !!baseResults,
              collectionDate: pt.collectionDate,
              collectedBy: pt.collectedBy,
              results: baseResults ? {
                pH: parseFloat(Math.min(6.5, Math.max(4.0, baseResults.pH - (layer === '20-40cm' ? 0.35 : 0.55))).toFixed(2)),
                MO: parseFloat((baseResults.MO * multiplier).toFixed(1)),
                P: parseFloat(Math.max(1, baseResults.P * multiplier * 0.8).toFixed(1)),
                K: parseFloat(Math.max(0.5, baseResults.K * multiplier).toFixed(1)),
                Ca: parseFloat(Math.max(5, baseResults.Ca * multiplier).toFixed(1)),
                Mg: parseFloat(Math.max(2, baseResults.Mg * multiplier).toFixed(1)),
                Al: parseFloat(Math.max(0, baseResults.Al * (2.0 - multiplier)).toFixed(1))
              } : undefined
            };
          });
        } else {
          const exists = subsObj.some(s => s.depth === activeSoilLayer);
          if (!exists) {
            subsObj.push({
              id: `sub-${activeSoilLayer}-${pt.id}`,
              depth: activeSoilLayer,
              isCollected: pt.isCollected,
              collectionDate: pt.collectionDate,
              collectedBy: pt.collectedBy,
              results: pt.results
            });
          }
          subsObj = subsObj.map(s => {
            if (s.depth === activeSoilLayer) {
              return {
                ...s,
                isCollected: pt.isCollected,
                collectionDate: pt.collectionDate,
                collectedBy: pt.collectedBy,
                results: pt.results
              };
            }
            return s;
          });
        }

        const pointToWrite = {
          ...pt,
          subsamples: subsObj,
          isCollected: pt.isCollected,
          collectionDate: pt.collectionDate,
          collectedBy: pt.collectedBy,
          results: pt.results
        };

        batch.set(doc(db, 'samplingPoints', pt.id), removeUndefined(pointToWrite));
      });

      // Sincroniza furos deletados
      const currentIds = new Set(updatedPoints.map(p => p.id));
      rawActivePoints.forEach((pt) => {
        if (!currentIds.has(pt.id)) {
          batch.delete(doc(db, 'samplingPoints', pt.id));
        }
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'samplingPoints');
    }
  };

  const handleUpdatePlot = async (updatedPlot: Plot) => {
    try {
      await setDoc(doc(db, 'plots', updatedPlot.id), removeUndefined(updatedPlot));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `plots/${updatedPlot.id}`);
    }
  };

  // Export Zip trigger
  const handleExportZippedGisPayload = async () => {
    if (!activeClient || !activeFarm || !activePlot) return;
    await downloadGISZip(activeClient, activeFarm, activePlot, activePoints);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex font-sans overflow-x-hidden">
      
      {/* 1. LEFT NAVIGATION SIDEBAR (Geometric Balance theme) */}
      <aside className="w-64 bg-[#0F172A] flex flex-col border-r border-slate-800 shrink-0 select-none print:hidden hidden lg:flex">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="p-1.5 bg-emerald-500 rounded-sm flex items-center justify-center font-bold text-slate-950 font-heading">
            <Sprout className="w-5 h-5 shrink-0" />
          </div>
          <span className="text-white font-semibold tracking-tight text-lg font-heading">GeoSolo Pro</span>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1">
          <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gerenciamento</div>
          <button 
            onClick={() => setActiveTab('clients')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'clients' 
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'clients' ? 'bg-emerald-400 scale-125' : 'bg-emerald-500'}`}></span>
            Clientes & Fazendas
          </button>
          <button 
            onClick={() => setActiveTab('field_station')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'field_station' 
                ? 'bg-slate-800 text-white border-l-2 border-indigo-500' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'field_station' ? 'bg-indigo-400 scale-125' : 'bg-indigo-400'}`}></span>
            Estação de Campo
          </button>

          <div className="px-3 py-2 mt-6 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processamento</div>
          <button 
            onClick={() => setActiveTab('lab_results')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'lab_results' 
                ? 'bg-slate-800 text-white border-l-2 border-blue-500' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'lab_results' ? 'bg-blue-400 scale-125' : 'bg-blue-400'}`}></span>
            Tabela de Laudos
          </button>
          <button 
            onClick={() => setActiveTab('ai_panel')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'ai_panel' 
                ? 'bg-slate-800 text-white border-l-2 border-amber-500' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'ai_panel' ? 'bg-amber-400 scale-125' : 'bg-amber-400'}`}></span>
            Diagnóstico IA (Parecer)
          </button>
          <button 
            onClick={() => setActiveTab('fertility_maps')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'fertility_maps' 
                ? 'bg-slate-800 text-white border-l-2 border-indigo-400' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'fertility_maps' ? 'bg-indigo-500 scale-125' : 'bg-indigo-500'}`}></span>
            Fertilidade e Mapas
          </button>
        </nav>

        <div className="p-4 mt-auto bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#1E293B] border border-slate-700 text-emerald-400 flex items-center justify-center font-bold text-xs font-heading shadow-inner">
              RC
            </div>
            <div className="text-xs">
              <p className="text-white font-medium">Eng. Agrônomo</p>
              <p className="text-slate-400 text-[10px]">Unidade Cascavel</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOP TOOLBAR HEADER (Geometric Balance UI) */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 print:hidden z-10">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-650">{activeFarm?.name || 'Fazenda Principal'}</span>
              <span>/</span>
              <span className="text-emerald-600 font-semibold">{activePlot?.name || 'Talhão Soja'}</span>
            </div>
            <h1 className="font-bold text-slate-900 text-sm sm:text-base font-heading">
              Projeto: Coleta Grade {activePlot?.cropType ? activePlot.cropType : '2026'}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{timestamp.split(' ').slice(1).join(' ')}</span>
            </div>

            <button
              onClick={handleExportZippedGisPayload}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-750 text-xs font-bold rounded border border-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Exportar GPX para GPS de mão e KML para Google Earth"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Pacote (.zip)</span>
            </button>
          </div>
        </header>

        {/* SCROLLABLE MAIN LAYOUT CANVAS */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#F8FAFC]">
          
          {/* AGRICULTURAL DECK BANNER */}
          <div className="bg-[#0F172A] text-white rounded-lg border border-slate-800 p-5 sm:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-5 relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10 space-y-2">
              <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-extrabold font-heading">Talhão Ativo em Monitoramento</span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-heading">
                {activeFarm?.name || 'Fazenda Principal'} • {activePlot?.name || 'Talhão'}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-slate-400" />
                  Município: <strong className="text-slate-200 font-semibold">{activeFarm?.city || 'Default'} - {activeFarm?.state || 'UF'}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  Área: <strong className="text-slate-200 font-semibold">{activePlot?.areaHectares} ha</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  Cultura: <strong className="text-slate-200 font-semibold">{activePlot?.cropType}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Calendar className="w-3.5 h-3.5 text-emerald-450 animate-pulse shrink-0" />
                  Período: <strong className="text-emerald-350 font-extrabold">{activeMonthYear}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  Furos Planejados: <strong className="text-slate-200 font-semibold">{activePoints.length}</strong>
                </span>
              </div>
            </div>

            <div className="shrink-0 flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              {dbStatus === 'connected' ? (
                <span className="text-[11px] font-mono font-bold px-2.5 py-1 flex items-center gap-1.5 text-emerald-400" title="Banco de dados na nuvem Firestore conectado e atualizando em tempo real">
                  <Database className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                  Nuvem Firestore Sincronizada
                </span>
              ) : dbStatus === 'connecting' ? (
                <span className="text-[11px] font-mono font-bold px-2.5 py-1 flex items-center gap-1.5 text-amber-400 animate-pulse" title="Iniciando conexões seguras com Firestore">
                  <CloudLightning className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                  Conectando Nuvem...
                </span>
              ) : (
                <span className="text-[11px] font-mono font-bold px-2.5 py-1 flex items-center gap-1.5 text-rose-400" title="Verificando acessibilidade ou credenciais locais">
                  <Database className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  Banco de Dados Limitado
                </span>
              )}
            </div>
          </div>

          {/* SECTION 1: HIERARCHICAL CLIENT / FARM / PLOT MANAGER */}
          {activeTab === 'clients' && (
            <section id="client-manager-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">1. Organização do Portfólio Agrícola</h3>
              </div>
              <ClientManager
                clients={clients}
                farms={farms}
                plots={plots}
                projects={projects}
                activePlotId={activePlotId}
                plotPeriods={plotPeriods}
                activeMonthYear={activeMonthYear}
                onSelectPlot={(id) => {
                  setActivePlotId(id);
                  const pPeriod = plotPeriods.find(p => p.plotId === id);
                  if (pPeriod) {
                    setActiveMonthYear(pPeriod.monthYear);
                  } else {
                    setActiveMonthYear('05/2026');
                  }
                }}
                onSelectMonthYear={setActiveMonthYear}
                onAddPlotPeriod={handleAddPlotPeriod}
                onEditPlotPeriod={handleEditPlotPeriod}
                onDeletePlotPeriod={handleDeletePlotPeriod}
                onAddClient={handleAddClient}
                onAddFarm={handleAddFarm}
                onAddPlot={handleAddPlot}
                onEditClient={handleEditClient}
                onDeleteClient={handleDeleteClient}
                onEditFarm={handleEditFarm}
                onDeleteFarm={handleDeleteFarm}
                onEditPlot={handleEditPlot}
                onDeletePlot={handleDeletePlot}
              />
            </section>
          )}

          {/* SECTION 2: MAP CONTAINERS */}
          {activeTab === 'field_station' && (
            <section id="field-station-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">2. Estação Cartográfica de Campo</h3>
              </div>
              {activePlot ? (
                <MapContainer
                  plot={activePlot}
                  points={activePoints}
                  onUpdatePoints={handleUpdatePoints}
                  onUpdatePlot={handleUpdatePlot}
                  offlineMode={offlineMode}
                  setOfflineMode={setOfflineMode}
                  activeSoilLayer={activeSoilLayer}
                  setActiveSoilLayer={setActiveSoilLayer}
                  soilLayers={soilLayers}
                  setSoilLayers={setSoilLayers}
                />
              ) : (
                <div className="bg-white rounded-lg p-10 text-center text-slate-400 border border-dashed border-slate-200 shadow-sm">
                  Nenhum talhão ativo ou limite cartográfico selecionado.
                </div>
              )}
            </section>
          )}

          {/* SECTION 3: TABULAR ENTRY OF LABORATORY CHEMICAL ANALYSES */}
          {activeTab === 'lab_results' && (
            <section id="lab-results-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">3. Resultados de Análise Química do Solo</h3>
              </div>
              <LabResultsManager
                points={activePoints}
                onChangePoints={handleUpdatePoints}
                activeSoilLayer={activeSoilLayer}
                setActiveSoilLayer={setActiveSoilLayer}
                soilLayers={soilLayers}
                setSoilLayers={setSoilLayers}
              />
            </section>
          )}

          {/* SECTION 4: POINT-BY-POINT RECOMMENDATIONS */}
          {activeTab === 'ai_panel' && (
            <section id="ai-panel-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-amber-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">4. Diagnóstico Agronômico & Recomendação Ponto a Ponto</h3>
              </div>
              {activePlot && activeClient && activeFarm ? (
                <AIPanel
                  client={activeClient}
                  farm={activeFarm}
                  plot={activePlot}
                  points={activePoints}
                  onChangePoints={handleUpdatePoints}
                  desiredV2={globalDesiredV2}
                  setDesiredV2={setGlobalDesiredV2}
                  prnt={globalPrnt}
                  setPrnt={setGlobalPrnt}
                />
              ) : null}
            </section>
          )}

          {/* SECTION 5: FERTILITY STUDIES AND MAPS GRAPHICS */}
          {activeTab === 'fertility_maps' && (
            <section id="fertility-maps-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-indigo-400" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">5. Fertilidade e Mapas</h3>
              </div>
              {activePlot && activePoints ? (
                <FertilityAndMaps
                  plot={activePlot}
                  points={activePoints}
                  soilLayers={soilLayers}
                  activeSoilLayer={activeSoilLayer}
                  desiredV2={globalDesiredV2}
                  setDesiredV2={setGlobalDesiredV2}
                  prnt={globalPrnt}
                  setPrnt={setGlobalPrnt}
                />
              ) : null}
            </section>
          )}

        </main>

        {/* COMPREHENSIVE FOOTER */}
        <footer className="bg-white border-t border-slate-200 py-6 px-6 print:hidden shrink-0 text-center text-xs text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700">GeoSolo Pro • Software de Agricultura de Precisão e Georreferenciamento</p>
          <p className="mt-1 text-slate-500 max-w-2xl mx-auto">
            Geração automática de malhas de amostragem de terra, exportação de arquivos GPX e KML legíveis em navegadores Garmin/Trimble, e interpolação geoestatística por Krigagem Ordinária.
          </p>
          <p className="mt-2 text-slate-450 font-mono text-[10px]">
            UTC Timestamp: 2026-05-22 19:23:40 | Operador: {activeClient?.name || 'User-Active'}
          </p>
        </footer>

      </div>
    </div>
  );
}
