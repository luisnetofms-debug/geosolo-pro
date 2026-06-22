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
import AIPanel, { calculateAutoRecs } from './components/AIPanel';
import FertilityAndMaps from './components/FertilityAndMaps';
import PropertyMap from './components/PropertyMap';
import SystemBackup from './components/SystemBackup';
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
  const [activeTab, setActiveTab] = useState<'clients' | 'field_station' | 'lab_results' | 'ai_panel' | 'fertility_maps' | 'property_map' | 'system_backup'>('clients');
  const [systemMenuOpen, setSystemMenuOpen] = useState<boolean>(true);
  const [globalDesiredV2, setGlobalDesiredV2] = useState<number>(70);
  const [globalPrnt, setGlobalPrnt] = useState<number>(80);
  const [globalMinDose, setGlobalMinDose] = useState<number>(0.5);
  const [globalUserCellSizeM, setGlobalUserCellSizeM] = useState<number>(50);
  const [globalFieldReady, setGlobalFieldReady] = useState<boolean>(false);

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

  // Dynamically heal plots in Firestore that were created in a wrong far-off location (e.g., misplaced SP fallback)
  useEffect(() => {
    if (plots.length === 0 || dbStatus !== 'connected') return;

    // Group plots by farmId
    const plotsByFarm: Record<string, Plot[]> = {};
    plots.forEach(p => {
      if (!p.farmId) return;
      if (!plotsByFarm[p.farmId]) plotsByFarm[p.farmId] = [];
      plotsByFarm[p.farmId].push(p);
    });

    const healMisplacedPlots = async () => {
      for (const farmId in plotsByFarm) {
        const farmPlots = plotsByFarm[farmId];
        // Find a "reference" plot that is correctly located or has original boundary points
        const refPlot = farmPlots.find(p => p.boundaryPoints && p.boundaryPoints.length >= 3 && !p.id.includes('plot-17')); // Find non-temp reference plots
        const primaryRef = refPlot || farmPlots.find(p => p.boundaryPoints && p.boundaryPoints.length >= 3);
        if (!primaryRef || !primaryRef.boundaryPoints || primaryRef.boundaryPoints.length === 0) continue;

        const refLat = primaryRef.boundaryPoints[0].lat;
        const refLng = primaryRef.boundaryPoints[0].lng;

        // Check if any plot in this farm is misplaced (e.g., distance > 0.5 degrees in lat/lng from ref)
        for (const plot of farmPlots) {
          if (!plot.boundaryPoints || plot.boundaryPoints.length === 0) continue;
          const firstPt = plot.boundaryPoints[0];
          const distanceLat = Math.abs(firstPt.lat - refLat);
          const distanceLng = Math.abs(firstPt.lng - refLng);

          if (distanceLat > 0.5 || distanceLng > 0.5) {
            console.log(`Healing misplaced plot: ${plot.name} in farm ${farmId}`);
            const baseLat = refLat;
            const baseLng = refLng;

            const healedPlot: Plot = {
              ...plot,
              boundaryPoints: [
                { lat: baseLat + 0.003, lng: baseLng - 0.003 },
                { lat: baseLat + 0.003, lng: baseLng + 0.003 },
                { lat: baseLat - 0.003, lng: baseLng + 0.003 },
                { lat: baseLat - 0.003, lng: baseLng - 0.003 },
                { lat: baseLat + 0.003, lng: baseLng - 0.003 }
              ]
            };

            try {
              await setDoc(doc(db, 'plots', healedPlot.id), removeUndefined(healedPlot));
              console.log(`Successfully healed plot ${plot.name}`);
            } catch (err) {
              console.error(`Failed to heal plot ${plot.name}:`, err);
            }
          }
        }
      }
    };

    healMisplacedPlots();
  }, [plots, dbStatus]);

  // Camadas de solo & Subamostras
  const [soilLayers, setSoilLayers] = useState<string[]>(['0-20cm', '20-40cm', '40-60cm']);
  const [activeSoilLayer, setActiveSoilLayer] = useState<string>('0-20cm');

  const activePlot = plots.find((p) => p.id === activePlotId) || plots[0];
  const activeFarm = farms.find((f) => f.id === activePlot?.farmId) || farms[0];
  const activeClient = clients.find((c) => c.id === activeFarm?.clientId) || clients[0];

  const activePeriod = useMemo(() => {
    return plotPeriods.find(p => p.plotId === activePlotId && p.monthYear === activeMonthYear);
  }, [plotPeriods, activePlotId, activeMonthYear]);

  // Synchronize state with current active period parameters
  useEffect(() => {
    if (activePeriod) {
      setGlobalDesiredV2(activePeriod.desiredV2 ?? 70);
      setGlobalPrnt(activePeriod.prnt ?? 80);
      setGlobalMinDose(activePeriod.minDose ?? 0.5);
      setGlobalUserCellSizeM(activePeriod.userCellSizeM ?? 50);
      setGlobalFieldReady(activePeriod.fieldReady ?? false);
    } else {
      setGlobalDesiredV2(70);
      setGlobalPrnt(80);
      setGlobalMinDose(0.5);
      setGlobalUserCellSizeM(50);
      setGlobalFieldReady(false);
    }
  }, [activePeriod]);

  const handleUpdateFieldReady = async (val: boolean) => {
    setGlobalFieldReady(val);
    if (activePeriod) {
      try {
        await setDoc(doc(db, 'plotPeriods', activePeriod.id), removeUndefined({ ...activePeriod, fieldReady: val }), { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar status de pronto para o campo no Firestore:", err);
      }
    }
  };

  // Persistent Firestore parameter updates for current period/project
  const handleUpdateDesiredV2 = async (val: number) => {
    setGlobalDesiredV2(val);
    if (activePeriod) {
      try {
        await setDoc(doc(db, 'plotPeriods', activePeriod.id), removeUndefined({ ...activePeriod, desiredV2: val }), { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar V2 no Firestore:", err);
      }
    }
  };

  const handleUpdatePrnt = async (val: number) => {
    setGlobalPrnt(val);
    if (activePeriod) {
      try {
        await setDoc(doc(db, 'plotPeriods', activePeriod.id), removeUndefined({ ...activePeriod, prnt: val }), { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar PRNT no Firestore:", err);
      }
    }
  };

  const handleUpdateMinDose = async (val: number) => {
    setGlobalMinDose(val);
    if (activePeriod) {
      try {
        await setDoc(doc(db, 'plotPeriods', activePeriod.id), removeUndefined({ ...activePeriod, minDose: val }), { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar dose mínima no Firestore:", err);
      }
    }
  };

  const handleUpdateUserCellSizeM = async (val: number) => {
    setGlobalUserCellSizeM(val);
    if (activePeriod) {
      try {
        await setDoc(doc(db, 'plotPeriods', activePeriod.id), removeUndefined({ ...activePeriod, userCellSizeM: val }), { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar tamanho de célula no Firestore:", err);
      }
    }
  };

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
    // 1. Try to find any existing plot inside this specific farm to use as coordinate reference
    const siblingPlot = plots.find(p => p.farmId === farmId);
    
    // 2. Fall back to activePlot if it belongs to this farm
    const refPlot = siblingPlot || (activePlot?.farmId === farmId ? activePlot : null) || plots.find(p => p.boundaryPoints?.length > 0) || plots[0];

    const baseLat = refPlot?.boundaryPoints?.[0]?.lat || -21.17;
    const baseLng = refPlot?.boundaryPoints?.[0]?.lng || -47.81;

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

  const handleRestoreBackup = async (backupData: any) => {
    try {
      const collectionsToRestore = [
        { key: 'clients', data: backupData.clients },
        { key: 'farms', data: backupData.farms },
        { key: 'plots', data: backupData.plots },
        { key: 'plotPeriods', data: backupData.plotPeriods },
        { key: 'samplingPoints', data: backupData.samplingPoints },
        { key: 'projects', data: backupData.projects },
      ];

      for (const col of collectionsToRestore) {
        if (col.data && Array.isArray(col.data)) {
          // Delete current documents in Firestore for this collection to ensure precise restore
          const snap = await getDocs(collection(db, col.key));
          const deleteChunks = [];
          let currentBatch = writeBatch(db);
          let count = 0;

          snap.forEach(docSnap => {
            currentBatch.delete(docSnap.ref);
            count++;
            if (count >= 400) {
              deleteChunks.push(currentBatch.commit());
              currentBatch = writeBatch(db);
              count = 0;
            }
          });
          if (count > 0) {
            deleteChunks.push(currentBatch.commit());
          }
          await Promise.all(deleteChunks);

          // Now insert the new documents
          const insertChunks = [];
          let insertBatch = writeBatch(db);
          let icount = 0;

          col.data.forEach((item: any) => {
            if (!item.id) return;
            insertBatch.set(doc(db, col.key, item.id), removeUndefined(item));
            icount++;
            if (icount >= 400) {
              insertChunks.push(insertBatch.commit());
              insertBatch = writeBatch(db);
              icount = 0;
            }
          });
          if (icount > 0) {
            insertChunks.push(insertBatch.commit());
          }
          await Promise.all(insertChunks);
        }
      }

      // Reset active talhão and month selection pointers
      if (backupData.plots && backupData.plots.length > 0) {
        setActivePlotId(backupData.plots[0].id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'backup_restore');
      throw error;
    }
  };

  const handleResetDatabaseToStaticDefaults = async () => {
    try {
      // Clear all major collections first
      const collectionsToClear = ['clients', 'farms', 'plots', 'plotPeriods', 'samplingPoints', 'projects'];
      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        const deleteChunks = [];
        let currentBatch = writeBatch(db);
        let count = 0;

        snap.forEach(docSnap => {
          currentBatch.delete(docSnap.ref);
          count++;
          if (count >= 400) {
            deleteChunks.push(currentBatch.commit());
            currentBatch = writeBatch(db);
            count = 0;
          }
        });
        if (count > 0) {
          deleteChunks.push(currentBatch.commit());
        }
        await Promise.all(deleteChunks);
      }

      // Now Seed initial data
      const seedBatch = writeBatch(db);
      INITIAL_CLIENTS.forEach(cli => {
        seedBatch.set(doc(db, 'clients', cli.id), removeUndefined(cli));
      });
      INITIAL_FARMS.forEach(f => {
        seedBatch.set(doc(db, 'farms', f.id), removeUndefined(f));
      });
      INITIAL_PLOTS.forEach(p => {
        seedBatch.set(doc(db, 'plots', p.id), removeUndefined(p));
      });
      INITIAL_SAMPLING_POINTS.forEach(pt => {
        seedBatch.set(doc(db, 'samplingPoints', pt.id), removeUndefined(pt));
      });
      INITIAL_PROJECTS.forEach(proj => {
        seedBatch.set(doc(db, 'projects', proj.id), removeUndefined(proj));
      });

      // Default periods
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
        seedBatch.set(doc(db, 'plotPeriods', p.id), removeUndefined(p));
      });

      await seedBatch.commit();
      setActivePlotId('plot-1');
      setActiveMonthYear('05/2026');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'database_reset');
      throw error;
    }
  };

  // Export Zip trigger
  const handleExportZippedGisPayload = async () => {
    if (!activeClient || !activeFarm || !activePlot) return;
    await downloadGISZip(activeClient, activeFarm, activePlot, activePoints);
  };

  return (
    <>
      {/* 1. INTERACTIVE SYSTEM CONTAINER (Hidden completely during Print) */}
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex font-sans overflow-x-hidden print:hidden">
      
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
          <button 
            onClick={() => setActiveTab('property_map')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-xs font-semibold cursor-pointer text-left ${
              activeTab === 'property_map' 
                ? 'bg-slate-800 text-white border-l-2 border-emerald-450' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/85'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'property_map' ? 'bg-emerald-400 scale-125' : 'bg-emerald-400'}`}></span>
            Mapa de Propriedades
          </button>

          <div className="px-3 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configuração</div>
          <div className="space-y-1">
            <button 
              onClick={() => {
                setSystemMenuOpen(!systemMenuOpen);
                setActiveTab('system_backup');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all text-xs font-semibold cursor-pointer text-left ${
                activeTab === 'system_backup' 
                  ? 'bg-slate-800 text-white border-l-2 border-purple-500' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/85'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'system_backup' ? 'bg-purple-400 scale-125' : 'bg-purple-400'}`}></span>
                <span>Sistema</span>
              </div>
              <span className="text-[10px] text-slate-400">{systemMenuOpen ? '▼' : '▶'}</span>
            </button>
            
            {systemMenuOpen && (
              <div className="pl-3.5 space-y-1">
                <button
                  onClick={() => setActiveTab('system_backup')}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-left ${
                    activeTab === 'system_backup'
                      ? 'text-purple-300 bg-slate-800/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <span className="text-purple-405 font-mono">⛁</span>
                  <span>Backup</span>
                </button>
              </div>
            )}
          </div>
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

        {/* MOBILE NAVIGATION TABS (Strictly visible on mobile/tablet) */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex gap-2 overflow-x-auto shrink-0 select-none z-10" id="mobile-tab-navigation">
          <button
            id="mobile-tab-clients"
            onClick={() => setActiveTab('clients')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'clients'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>Clientes & Fazendas</span>
          </button>
          
          <button
            id="mobile-tab-field-station"
            onClick={() => setActiveTab('field_station')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'field_station'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>Estação de Campo</span>
          </button>

          <button
            id="mobile-tab-lab-results"
            onClick={() => setActiveTab('lab_results')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'lab_results'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Tabela de Laudos</span>
          </button>

          <button
            id="mobile-tab-ai-panel"
            onClick={() => setActiveTab('ai_panel')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'ai_panel'
                ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Diagnóstico IA</span>
          </button>

          <button
            id="mobile-tab-fertility-maps"
            onClick={() => setActiveTab('fertility_maps')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'fertility_maps'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-250 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Fertilidade & Mapas</span>
          </button>

          <button
            id="mobile-tab-property-map"
            onClick={() => setActiveTab('property_map')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'property_map'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-250 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Mapa de Propriedades</span>
          </button>

          <button
            id="mobile-tab-system-backup"
            onClick={() => setActiveTab('system_backup')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'system_backup'
                ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
                : 'bg-slate-50 text-slate-650 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0 text-purple-400" />
            <span>Sistema</span>
          </button>
        </div>

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
                  activeMonthYear={activeMonthYear}
                  fieldReady={globalFieldReady}
                  setFieldReady={handleUpdateFieldReady}
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
                  setDesiredV2={handleUpdateDesiredV2}
                  prnt={globalPrnt}
                  setPrnt={handleUpdatePrnt}
                  activeSoilLayer={activeSoilLayer}
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
                  setDesiredV2={handleUpdateDesiredV2}
                  prnt={globalPrnt}
                  setPrnt={handleUpdatePrnt}
                  minDose={globalMinDose}
                  setMinDose={handleUpdateMinDose}
                  userCellSizeM={globalUserCellSizeM}
                  setUserCellSizeM={handleUpdateUserCellSizeM}
                />
              ) : null}
            </section>
          )}

          {activeTab === 'property_map' && (
            <section id="property-map-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">6. Mapa de Propriedades</h3>
              </div>
              <PropertyMap
                farm={activeFarm}
                plots={plots}
                plotPeriods={plotPeriods}
                samplingPoints={samplingPoints}
                soilLayers={soilLayers}
                activeSoilLayer={activeSoilLayer}
                onSelectPlot={(plotId) => {
                  setActivePlotId(plotId);
                  const pPeriod = plotPeriods.find(p => p.plotId === plotId);
                  if (pPeriod) {
                    setActiveMonthYear(pPeriod.monthYear);
                  } else {
                    setActiveMonthYear('05/2026');
                  }
                }}
                onSelectTab={setActiveTab}
                activePlotId={activePlotId}
              />
            </section>
          )}

          {activeTab === 'system_backup' && (
            <section id="system-backup-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-purple-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">7. Sistema e Segurança</h3>
              </div>
              <SystemBackup
                clients={clients}
                farms={farms}
                plots={plots}
                plotPeriods={plotPeriods}
                samplingPoints={samplingPoints}
                projects={projects}
                dbStatus={dbStatus}
                onRestoreBackup={handleRestoreBackup}
                onResetDatabaseToStaticDefaults={handleResetDatabaseToStaticDefaults}
              />
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

    {/* 2. PROFESSIONAL AGRONOMIC REPORT (Visible only on print or print layouts) */}
    <div className="print-only w-full bg-white text-black p-10 font-sans text-xs">
      <div className="border-b-2 border-emerald-600 pb-4 mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">GeoSolo Pro</h1>
          <p className="text-slate-500 font-medium text-[10px] tracking-wide uppercase font-heading">Laudo Técnico de Recomendação Agronômica</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-slate-400 font-mono font-bold">EMISSÃO: {new Date().toLocaleDateString('pt-BR')}</p>
          <p className="text-[10px] text-emerald-700 font-bold font-mono">CÓDIGO: {activePlot?.id?.substring(0, 8).toUpperCase() || 'PL-GRID'}</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Cliente / Produtor</span>
          <p className="font-bold text-slate-800">{activeClient?.name || 'Não Identificado'}</p>
        </div>
        <div>
          <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Fazenda</span>
          <p className="font-bold text-slate-800">{activeFarm?.name || 'Fazenda Principal'}</p>
          <p className="text-[9px] text-slate-500">{activeFarm?.city} - {activeFarm?.state}</p>
        </div>
        <div>
          <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Talhão</span>
          <p className="font-bold text-slate-800">{activePlot?.name || 'Talhão Ativo'}</p>
          <p className="text-[9px] text-slate-500">{activePlot?.areaHectares} Hectares (ha)</p>
        </div>
        <div>
          <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Cultura / Período</span>
          <p className="font-bold text-slate-800">{activePlot?.cropType || 'Não definida'}</p>
          <p className="text-[9px] text-emerald-700 font-bold">{activeMonthYear}</p>
        </div>
      </div>

      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-4 gap-4 grid grid-cols-3 mb-6 text-emerald-950">
        <div>
          <span className="text-[8px] font-extrabold uppercase text-emerald-600 block tracking-wider">Camada de Solo Analisada</span>
          <p className="text-sm font-black font-mono">{activeSoilLayer}</p>
        </div>
        <div>
          <span className="text-[8px] font-extrabold uppercase text-emerald-600 block tracking-wider font-semibold">PRNT Adotado</span>
          <p className="text-sm font-black font-mono">{globalPrnt}%</p>
        </div>
        <div>
          <span className="text-[8px] font-extrabold uppercase text-emerald-600 block tracking-wider font-semibold">V₂ Desejado</span>
          <p className="text-sm font-black font-mono">{globalDesiredV2}%</p>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1 font-heading">
          1. Resultados das Análises Físico-Químicas do Solo
        </h3>
        <table className="w-full text-left border-collapse border border-slate-200 text-[10px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase tracking-wider text-[8px] font-extrabold">
              <th className="p-1 px-2 border-r border-slate-200">Ponto</th>
              <th className="p-1 text-center border-r border-slate-200">pH Ca/H₂O</th>
              <th className="p-1 text-center border-r border-slate-200">M.O. %</th>
              <th className="p-1 text-center border-r border-slate-200">P mg/dm³</th>
              <th className="p-1 text-center border-r border-slate-200">K mmolc</th>
              <th className="p-1 text-center border-r border-slate-200">Ca mmolc</th>
              <th className="p-1 text-center border-r border-slate-200">Mg mmolc</th>
              <th className="p-1 text-center border-r border-slate-200">Al cmolc</th>
              <th className="p-1 text-center border-r border-slate-200">H+Al cmolc</th>
              <th className="p-1 text-center border-r border-slate-200">CTC (T)</th>
              <th className="p-1 text-center border-r border-slate-200">V% Solo</th>
              <th className="p-1 text-center border-r border-slate-205">Argila %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {[...activePoints].sort((a,b) => a.pointNumber - b.pointNumber).map((p) => {
              if (!p.results) {
                return (
                  <tr key={`print-ph-${p.id}`}>
                    <td className="p-1 px-2 font-bold bg-slate-50 border-r border-slate-200">F-{p.pointNumber}</td>
                    <td colSpan={11} className="p-1 text-center text-slate-400 italic">Dado não disponível para esta camada</td>
                  </tr>
                );
              }
              const parseNum = (v: any, fallback: number = 0): number => {
                if (v === undefined || v === null || v === '' || v === 'ns') return fallback;
                const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
                return isNaN(num) ? fallback : num;
              };

              const pH = parseNum(p.results.pH ?? p.results.ph_h2o ?? p.results.ph_cacl2, 5.5);
              const MO = parseNum(p.results.MO ?? p.results.mo, 0);
              const Ca = parseNum(p.results.Ca ?? p.results.ca, 0);
              const Mg = parseNum(p.results.Mg ?? p.results.mg, 0);
              const K = parseNum(p.results.K ?? p.results.k, 0);
              const P = parseNum(p.results.P ?? p.results.p_meh ?? p.results.p_res, 0);
              const Al = parseNum(p.results.Al ?? p.results.al, 0);
              const hAl = parseNum(p.results.h_al ?? Math.max(0.2, parseFloat((12.0 - 1.8 * pH).toFixed(2))));
              const T = parseNum(p.results.ctc_t ?? (Ca + Mg + K + hAl));
              const t = Ca + Mg + K;
              const v1 = T > 0 ? Math.min(100, (t / T) * 100) : 0;
              const argila = parseNum(p.results.argila, 0);

              return (
                <tr key={`print-res-${p.id}`} className="hover:bg-slate-50">
                  <td className="p-1 px-2 font-bold bg-slate-50 border-r border-slate-200">F-{p.pointNumber}</td>
                  <td className="p-1 text-center border-r border-slate-200">{pH.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{MO.toFixed(1)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{P.toFixed(1)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{K.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{Ca.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{Mg.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{Al.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{hAl.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200">{T.toFixed(2)}</td>
                  <td className="p-1 text-center border-r border-slate-200 font-bold text-slate-800">{v1.toFixed(0)}%</td>
                  <td className="p-1 text-center border-r border-slate-200">{argila > 0 ? `${argila}%` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-6 page-break">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1 font-heading">
          2. Prescrição Técnica e Recomendações Agronômicas Corrigidas
        </h3>
        <table className="w-full text-left border-collapse border border-slate-200 text-[10px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase tracking-wider text-[8px] font-extrabold">
              <th className="p-1 px-2 border-r border-slate-200">Ponto</th>
              <th className="p-1 text-center border-r border-slate-200">C. Dolomítico (t/ha)</th>
              <th className="p-1 text-center border-r border-slate-200">C. Calcítico (t/ha)</th>
              <th className="p-1 text-center border-r border-slate-200">Gesso (t/ha)</th>
              <th className="p-1 text-center border-r border-slate-200">Super MAP (kg/ha)</th>
              <th className="p-1 text-center border-r border-slate-200">Cloreto KCl (kg/ha)</th>
              <th className="p-1 text-center border-r border-slate-250">NPK 12-15-15 (kg/ha)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {[...activePoints].sort((a,b) => a.pointNumber - b.pointNumber).map((p) => {
              if (!p.results) {
                return (
                  <tr key={`print-rec-empty-${p.id}`}>
                    <td className="p-1 px-2 font-bold bg-slate-50 border-r border-slate-200">F-{p.pointNumber}</td>
                    <td colSpan={6} className="p-1 text-center text-slate-400 italic">Falta dados físico-químicos</td>
                  </tr>
                );
              }
              const savedRec = p.recommendations || {};
              const autoRecs = calculateAutoRecs(p, activePlot?.cropType || '', globalDesiredV2, globalPrnt);

              const dolomitico = savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0);
              const calcitico = savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0);
              const gesso = savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng;
              const mapVal = savedRec.map !== undefined ? savedRec.map : autoRecs.map;
              const kclVal = savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl;
              const npkVal = savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado;

              return (
                <tr key={`print-rec-${p.id}`} className="hover:bg-slate-50">
                  <td className="p-1 px-2 font-bold bg-slate-50 border-r border-slate-200">F-{p.pointNumber}</td>
                  <td className="p-1 text-center border-r border-slate-200">{dolomitico > 0 ? `${dolomitico.toFixed(1)} t` : '-'}</td>
                  <td className="p-1 text-center border-r border-slate-200">{calcitico > 0 ? `${calcitico.toFixed(1)} t` : '-'}</td>
                  <td className="p-1 text-center border-r border-slate-200">{gesso > 0 ? `${gesso.toFixed(1)} t` : '-'}</td>
                  <td className="p-1 text-center border-r border-slate-200">{mapVal > 0 ? `${mapVal} kg` : '-'}</td>
                  <td className="p-1 text-center border-r border-slate-200">{kclVal > 0 ? `${kclVal} kg` : '-'}</td>
                  <td className="p-1 text-center border-r border-slate-200">{npkVal > 0 ? `${npkVal} kg` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(() => {
        let dolomiticoSum = 0;
        let calciticoSum = 0;
        let gessoSum = 0;
        let mapSum = 0;
        let kclSum = 0;
        let formuladoSum = 0;
        let count = 0;

        activePoints.forEach(p => {
          if (!p.results) return;
          count++;
          const savedRec = p.recommendations || {};
          const autoRecs = calculateAutoRecs(p, activePlot?.cropType || '', globalDesiredV2, globalPrnt);

          dolomiticoSum += savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0);
          calciticoSum += savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0);
          gessoSum += savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng;
          mapSum += savedRec.map !== undefined ? savedRec.map : autoRecs.map;
          kclSum += savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl;
          formuladoSum += savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado;
        });

        const area = activePlot?.areaHectares || 1;
        const avgDolomitico = count > 0 ? dolomiticoSum / count : 0;
        const avgCalcitico = count > 0 ? calciticoSum / count : 0;
        const avgGesso = count > 0 ? gessoSum / count : 0;
        const avgMap = count > 0 ? mapSum / count : 0;
        const avgKcl = count > 0 ? kclSum / count : 0;
        const avgFormulado = count > 0 ? formuladoSum / count : 0;

        const totDolomitico = avgDolomitico * area;
        const totCalcitico = avgCalcitico * area;
        const totGesso = avgGesso * area;
        const totMap = avgMap * area;
        const totKcl = avgKcl * area;
        const totFormulado = avgFormulado * area;

        return (
          <div className="mb-10 page-break">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-200 pb-1 font-heading">
              3. Resumo Executivo e Consolidado de Insumos para o Talhão ({area} ha)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-900">
                <p className="text-[8px] font-black uppercase text-slate-400">Corretivos de Acidez (Calagem)</p>
                <p className="text-[11px] font-bold mt-1 text-slate-800">Dolomítico: <span className="font-mono text-emerald-800">{totDolomitico.toFixed(1)} t</span> (Média {avgDolomitico.toFixed(1)} t/ha)</p>
                <p className="text-[11px] font-bold text-slate-800">Calcítico: <span className="font-mono text-emerald-800">{totCalcitico.toFixed(1)} t</span> (Média {avgCalcitico.toFixed(1)} t/ha)</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-900">
                <p className="text-[8px] font-black uppercase text-slate-400">Condicionadores de Subsuperfície</p>
                <p className="text-[11px] font-bold mt-1 text-slate-800">Gesso Agrícola: <span className="font-mono text-amber-800">{totGesso.toFixed(1)} t</span> (Média {avgGesso.toFixed(1)} t/ha)</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-900">
                <p className="text-[8px] font-black uppercase text-slate-400">Nutrição Especial NPK</p>
                <p className="text-[11px] font-bold mt-1 text-slate-800">Super MAP: <span className="font-mono text-slate-800">{(totMap/1000).toFixed(2)} t</span> ({Math.round(totMap)} kg)</p>
                <p className="text-[11px] font-bold text-slate-800">Cloreto KCl: <span className="font-mono text-slate-800">{(totKcl/1000).toFixed(2)} t</span> ({Math.round(totKcl)} kg)</p>
                <p className="text-[11px] font-bold text-slate-800">NPK 12-15-15: <span className="font-mono text-slate-800">{(totFormulado/1000).toFixed(2)} t</span> ({Math.round(totFormulado)} kg)</p>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="border-t border-slate-300 pt-8 mt-12 grid grid-cols-2 gap-8">
        <div>
          <h4 className="font-bold text-slate-800 uppercase text-[9px] tracking-widest font-heading">Recomendações de Campo</h4>
          <p className="text-[9px] text-slate-500 leading-relaxed mt-1">
            Recomenda-se a aplicação em taxa variável dos corretivos de acidez e condicionadores com equipamentos munidos de GPS e piloto automático para obedecer à grade de amostragem georreferenciada. Os defensivos e formulações devem ser dosados conforme orientações técnicas locais vigentes e as exigências estofológicas de cada mancha de fertilidade.
          </p>
        </div>
        <div className="flex flex-col items-center justify-end text-center">
          <div className="w-48 border-b border-slate-400 mb-1" />
          <p className="text-[10px] font-bold text-slate-800">Engenheiro Agrônomo Técnico</p>
          <p className="text-[9px] text-slate-500">CREA PR / Cascavel - PR</p>
        </div>
      </div>
    </div>
  </>
  );
}
