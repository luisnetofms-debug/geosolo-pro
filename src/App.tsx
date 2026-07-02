/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Client, Farm, Plot, SamplingPoint, Project, PlotPeriod, UserProfile } from './types';
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
import ReportGenerator, { SVGPlotBoundary, SVGThematicMap, RenderCompCard } from './components/ReportGenerator';
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
  const [activePlotId, setActivePlotId] = useState<string>('');
  const [activeMonthYear, setActiveMonthYear] = useState<string>('05/2026');
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'field_station' | 'lab_results' | 'ai_panel' | 'fertility_maps' | 'property_map' | 'system_backup' | 'report_print'>('clients');
  const [systemMenuOpen, setSystemMenuOpen] = useState<boolean>(true);
  const [globalDesiredV2, setGlobalDesiredV2] = useState<number>(70);
  const [globalPrnt, setGlobalPrnt] = useState<number>(80);
  const [globalMinDose, setGlobalMinDose] = useState<number>(0.5);
  const [globalUserCellSizeM, setGlobalUserCellSizeM] = useState<number>(50);
  const [globalFieldReady, setGlobalFieldReady] = useState<boolean>(false);

  // Hoisted Report Generator Configuration
  const [reportDate, setReportDate] = useState<string>('Dezembro 2024');
  const [operatorName, setOperatorName] = useState<string>('Grupo Cunha');
  const [reportTitle, setReportTitle] = useState<string>('AGRICULTURA DE PRECISÃO');
  const [reportSubtitle, setReportSubtitle] = useState<string>('MAPAS E RECOMENDAÇÕES');
  const [reportSections, setReportSections] = useState({
    cover: true,
    croquiBoundary: true,
    croquiPoints: true,
    chartsAttributes: true,
    chartsMicros: true,
    thematicMaps: true,
    recommendationTable: true,
  });

  // User Profile configuration state
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('geosolo_user_profile');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (_) {}
    return {
      name: 'Eng. Agrônomo',
      role: 'Consultor Técnico',
      initials: 'RC',
      unit: 'Unidade Cascavel',
      email: 'luis.netofms@gmail.com',
      crea: 'CREA-PR 87431/D',
      phone: '(45) 99999-1234'
    };
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);


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
  }, []);  // 1. Connection Health Check & Auto-Seeding if empty
  useEffect(() => {
    let active = true;

    async function checkAndSeed() {
      try {
        setDbStatus('connecting');
        // Simple connection diagnostic fetch
        await getDocFromServer(doc(db, 'test', 'connection')).catch(() => {});

        // Process a one-time purge of demonstration data from the Firestore database if present
        const demoClientIds = ['cli-1', 'cli-2'];
        const demoFarmIds = ['farm-1', 'farm-2'];
        const demoPlotIds = ['plot-1', 'plot-2'];
        const demoProjectIds = ['proj-1'];
        const demoPeriodIds = ['period-1', 'period-2'];
        const demoPointIds = Array.from({ length: 16 }, (_, i) => `pt-${i + 1}`);

        const purgeBatch = writeBatch(db);
        demoClientIds.forEach(id => purgeBatch.delete(doc(db, 'clients', id)));
        demoFarmIds.forEach(id => purgeBatch.delete(doc(db, 'farms', id)));
        demoPlotIds.forEach(id => purgeBatch.delete(doc(db, 'plots', id)));
        demoProjectIds.forEach(id => purgeBatch.delete(doc(db, 'projects', id)));
        demoPeriodIds.forEach(id => purgeBatch.delete(doc(db, 'plotPeriods', id)));
        demoPointIds.forEach(id => purgeBatch.delete(doc(db, 'samplingPoints', id)));

        await purgeBatch.commit().catch(() => {});
        console.log('Demonstration database records successfully cleared.');

        if (active) {
          setDbStatus('connected');
        }
      } catch (error) {
        console.error('Erro de conexão ao Firestore ou durante purga:', error);
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

  // Shared statistics calculations for Report Printing
  const pointsWithResults = useMemo(() => {
    return activePoints.filter(p => p.isCollected && p.results);
  }, [activePoints]);

  const parseNum = (v: any, fallback: number = 0): number => {
    if (v === undefined || v === null || v === '' || v === 'ns') return fallback;
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isNaN(num) ? fallback : num;
  };

  const getDerivedStats = (p: SamplingPoint, depth: '0-20cm' | '20-40cm') => {
    const sub = p.subsamples?.find(s => s.depth.replace(/\s+/g, '').toLowerCase() === depth.replace(/\s+/g, '').toLowerCase());
    const res = sub?.results || (depth === '0-20cm' ? p.results : null);

    if (!res) {
      if (depth === '0-20cm') {
        return { pH: 4.8, MO: 13.0, P: 2.2, K_sat: 1.3, Ca_sat: 15.0, Mg_sat: 5.2, Al_sat: 33.7, V: 21.5, S: 3.1, Zn: 1.1, Cu: 0.3, Mn: 12.5, B: 0.1, argila: 10.6 };
      } else {
        return { pH: 5.0, MO: 8.0, P: 1.5, K_sat: 1.0, Ca_sat: 17.7, Mg_sat: 5.7, Al_sat: 33.7, V: 25.0, S: 3.3, Zn: 0.6, Cu: 0.2, Mn: 8.0, B: 0.05, argila: 12.0 };
      }
    }

    const pH = parseNum(res.pH ?? res.ph_h2o ?? res.ph_cacl2, depth === '0-20cm' ? 4.8 : 5.0);
    const rawMO = parseNum(res.MO ?? res.mo, depth === '0-20cm' ? 1.3 : 0.8);
    const MO = rawMO < 10 ? rawMO * 10 : rawMO;
    const P = parseNum(res.P ?? res.p_meh ?? res.p_res, depth === '0-20cm' ? 2.2 : 1.5);
    const Ca = parseNum(res.Ca ?? res.ca, depth === '0-20cm' ? 1.5 : 1.8);
    const Mg = parseNum(res.Mg ?? res.mg, depth === '0-20cm' ? 0.5 : 0.6);
    const K = parseNum(res.K ?? res.k, depth === '0-20cm' ? 0.13 : 0.10);
    const Al = parseNum(res.Al ?? res.al, depth === '0-20cm' ? 1.2 : 1.4);
    const S = parseNum(res.s ?? 3.0, depth === '0-20cm' ? 3.1 : 3.3);
    const Zn = parseNum(res.zn ?? 1.0, depth === '0-20cm' ? 1.1 : 0.6);
    const Cu = parseNum(res.cu ?? 0.3, depth === '0-20cm' ? 0.3 : 0.2);
    const Mn = parseNum(res.mn ?? 12.0, depth === '0-20cm' ? 12.5 : 8.0);
    const B = parseNum(res.b ?? 0.1, depth === '0-20cm' ? 0.1 : 0.05);
    const argila = parseNum(res.argila ?? 10.6, depth === '0-20cm' ? 10.6 : 12.0);

    const hAl = parseNum(res.h_al ?? Math.max(0.2, parseFloat((12.0 - 1.8 * pH).toFixed(2))));
    const t_val = Ca + Mg + K;
    const T_val = t_val + hAl;

    const K_sat = T_val > 0 ? parseFloat(((K / T_val) * 100).toFixed(1)) : 1.3;
    const Ca_sat = T_val > 0 ? parseFloat(((Ca / T_val) * 100).toFixed(1)) : (depth === '0-20cm' ? 15.0 : 17.7);
    const Mg_sat = T_val > 0 ? parseFloat(((Mg / T_val) * 100).toFixed(1)) : (depth === '0-20cm' ? 5.2 : 5.7);
    const Al_sat = (t_val + Al) > 0 ? parseFloat(((Al / (t_val + Al)) * 100).toFixed(1)) : 33.7;
    const V = T_val > 0 ? parseFloat(((t_val / T_val) * 100).toFixed(1)) : (depth === '0-20cm' ? 21.5 : 25.0);

    return { pH, MO, P, K_sat, Ca_sat, Mg_sat, Al_sat, V, S, Zn, Cu, Mn, B, argila };
  };

  const reportAverages = useMemo(() => {
    const pts = pointsWithResults.length > 0 ? pointsWithResults : activePoints;
    if (pts.length === 0) {
      return {
        '0-20cm': { pH: 4.8, MO: 13.0, P: 2.2, K_sat: 1.3, Ca_sat: 15.0, Mg_sat: 5.2, Al_sat: 33.7, V: 21.5, S: 3.1, Zn: 1.1, Cu: 0.3, Mn: 12.5, B: 0.1, argila: 10.6 },
        '20-40cm': { pH: 5.0, MO: 8.0, P: 1.5, K_sat: 1.0, Ca_sat: 17.7, Mg_sat: 5.7, Al_sat: 33.7, V: 25.0, S: 3.3, Zn: 0.6, Cu: 0.2, Mn: 8.0, B: 0.05, argila: 12.0 }
      };
    }

    const sum1 = { pH: 0, MO: 0, P: 0, K_sat: 0, Ca_sat: 0, Mg_sat: 0, Al_sat: 0, V: 0, S: 0, Zn: 0, Cu: 0, Mn: 0, B: 0, argila: 0 };
    const sum2 = { pH: 0, MO: 0, P: 0, K_sat: 0, Ca_sat: 0, Mg_sat: 0, Al_sat: 0, V: 0, S: 0, Zn: 0, Cu: 0, Mn: 0, B: 0, argila: 0 };

    pts.forEach(p => {
      const d1 = getDerivedStats(p, '0-20cm');
      const d2 = getDerivedStats(p, '20-40cm');
      
      Object.keys(sum1).forEach(k => {
        (sum1 as any)[k] += (d1 as any)[k];
        (sum2 as any)[k] += (d2 as any)[k];
      });
    });

    const len = pts.length;
    const avg1: any = {};
    const avg2: any = {};

    Object.keys(sum1).forEach(k => {
      avg1[k] = parseFloat(( (sum1 as any)[k] / len ).toFixed(1));
      avg2[k] = parseFloat(( (sum2 as any)[k] / len ).toFixed(1));
    });

    return { '0-20cm': avg1, '20-40cm': avg2 };
  }, [pointsWithResults, activePoints]);

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

      setActivePlotId('');
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
            Diagnóstico Agronômico
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
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-all text-xs font-semibold cursor-pointer text-left ${
                (activeTab === 'system_backup' || activeTab === 'report_print')
                  ? 'bg-slate-800 text-white border-l-2 border-purple-500' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/85'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full ${(activeTab === 'system_backup' || activeTab === 'report_print') ? 'bg-purple-400 scale-125' : 'bg-purple-400'}`}></span>
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

                <button
                  onClick={() => setActiveTab('report_print')}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-left ${
                    activeTab === 'report_print'
                      ? 'text-indigo-300 bg-slate-800/60'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <span className="text-indigo-400 font-mono">⎙</span>
                  <span>Impressão de Laudos</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        <button 
          id="system-user-profile-button"
          onClick={() => setIsProfileModalOpen(true)}
          className="w-full p-4 mt-auto bg-slate-900 border-t border-slate-800 hover:bg-slate-800/50 transition-colors text-left flex items-center justify-between group cursor-pointer"
          title="Clique para cadastrar ou editar seu perfil de usuário"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#1E293B] border border-slate-700 text-emerald-400 flex items-center justify-center font-bold text-xs font-heading shadow-inner group-hover:border-emerald-400/50 transition-colors shrink-0">
              {userProfile.initials || 'RC'}
            </div>
            <div className="text-xs min-w-0">
              <p className="text-white font-medium truncate group-hover:text-emerald-400 transition-colors">{userProfile.name}</p>
              <p className="text-slate-400 text-[10px] truncate">{userProfile.unit}</p>
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-amber-400 transition-colors text-[10px] pl-1 font-mono">✎</span>
        </button>
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
            <span>Diagnóstico Agronômico</span>
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

          {activeTab === 'report_print' && (
            <section id="report-print-section" className="space-y-2.5 scroll-mt-20">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-indigo-500" />
                <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 font-heading">8. Impressão de Laudos</h3>
              </div>
              <ReportGenerator
                clients={clients}
                farms={farms}
                plots={plots}
                points={samplingPoints}
                desiredV2={globalDesiredV2}
                prnt={globalPrnt}
                minDose={globalMinDose}
                reportDate={reportDate}
                setReportDate={setReportDate}
                operatorName={operatorName}
                setOperatorName={setOperatorName}
                reportTitle={reportTitle}
                setReportTitle={setReportTitle}
                reportSubtitle={reportSubtitle}
                setReportSubtitle={setReportSubtitle}
                sections={reportSections}
                setSections={setReportSections}
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

    {/* CADASTRO DE OPERADOR/ENGENHEIRO AGRÔNOMO MODAL */}
    {isProfileModalOpen && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in print:hidden">
        <div 
          className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden text-left"
          onClick={(e) => e.stopPropagation()}
          id="profile-custom-modal"
        >
          {/* Header */}
          <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
                {userProfile.initials || 'RC'}
              </div>
              <div>
                <h3 className="font-bold text-sm font-heading">Perfil do Profissional</h3>
                <p className="text-[10px] text-slate-400">Configure suas informações de assinatura e laudos</p>
              </div>
            </div>
            <button 
              onClick={() => setIsProfileModalOpen(false)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-bold bg-slate-800 hover:bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center border-0"
            >
              ✕
            </button>
          </div>

          {/* Form Formulario */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string || 'Eng. Agrônomo';
              const role = formData.get('role') as string || 'Consultor Técnico';
              const unit = formData.get('unit') as string || 'Unidade Cascavel';
              const email = formData.get('email') as string || 'luis.netofms@gmail.com';
              const crea = formData.get('crea') as string || 'CREA-PR 87431/D';
              const phone = formData.get('phone') as string || '(45) 99999-1234';

              // Automatically generate initials (up to 2 letters, uppercase)
              const parts = name.trim().split(/\s+/);
              let initials = 'RC';
              if (parts.length > 1) {
                initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
              } else if (parts.length === 1 && parts[0].length > 0) {
                initials = parts[0].substring(0, 2).toUpperCase();
              }

              const updatedProfile: UserProfile = {
                name,
                role,
                initials,
                unit,
                email,
                crea,
                phone
              };

              setUserProfile(updatedProfile);
              localStorage.setItem('geosolo_user_profile', JSON.stringify(updatedProfile));
              setIsProfileModalOpen(false);
            }}
            className="p-6 space-y-4 text-xs text-slate-700"
          >
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nome Completo</label>
              <input 
                type="text" 
                name="name" 
                defaultValue={userProfile.name}
                required
                className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                placeholder="Ex: Rodrigo Coleti Neto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cargo / Profissão</label>
                <input 
                  type="text" 
                  name="role" 
                  defaultValue={userProfile.role}
                  required
                  className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                  placeholder="Ex: Eng. Agrônomo"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registro Profissional (CREA)</label>
                <input 
                  type="text" 
                  name="crea" 
                  defaultValue={userProfile.crea}
                  className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                  placeholder="Ex: CREA-PR 87431/D"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unidade / Regional de Atuação</label>
              <input 
                type="text" 
                name="unit" 
                defaultValue={userProfile.unit}
                required
                className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                placeholder="Ex: Unidade Cascavel"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">E-mail de Contato</label>
                <input 
                  type="email" 
                  name="email" 
                  defaultValue={userProfile.email}
                  required
                  className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                  placeholder="Ex: luis.netofms@gmail.com"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telefone</label>
                <input 
                  type="text" 
                  name="phone" 
                  defaultValue={userProfile.phone}
                  className="w-full px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 text-slate-800"
                  placeholder="Ex: (45) 99999-1234"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex gap-2">
              <button 
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="flex-1 py-1.5 px-3 border border-slate-200 text-slate-500 rounded-lg font-bold text-[10px] uppercase tracking-wider hover:bg-slate-100 cursor-pointer text-center bg-transparent"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-750 text-white rounded-lg font-bold text-[10px] uppercase tracking-wider cursor-pointer shadow-xs text-center border-0"
              >
                Salvar Cadastro
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* 2. PROFESSIONAL AGRONOMIC REPORT (Visible only on print) */}
    <div className="print-only w-full bg-white text-black font-sans text-xs select-none">
      {/* PAGE 1: COVER */}
      {reportSections.cover && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          {/* Double Green Frame */}
          <div className="absolute inset-[8mm] border border-emerald-700/35 pointer-events-none p-1">
            <div className="w-full h-full border-4 border-emerald-600/25"></div>
          </div>

          <div className="flex-1 flex flex-col justify-around text-center py-10 z-10 px-6">
            {/* Top Text */}
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold tracking-[0.2em] text-slate-800 font-heading">
                {reportTitle}
              </h1>
              <p className="text-sm tracking-[0.15em] text-slate-600 font-medium uppercase">
                {reportSubtitle}
              </p>
            </div>

            {/* Middle Block */}
            <div className="space-y-6 my-auto">
              <h2 className="text-3xl font-extrabold text-slate-900 leading-tight font-heading">
                {activeFarm?.name || 'Sítio Santa Cosma'}
              </h2>
              
              <div className="space-y-1">
                <p className="text-xs text-slate-600 font-medium">Talhões</p>
                <p className="text-sm font-bold text-slate-800 uppercase font-heading">
                  {activePlot?.name || 'Área de lavoura'}
                </p>
              </div>

              <div className="text-xs font-bold text-slate-700 font-mono">
                {activePlot?.area || '7,4'} ha.
              </div>

              <div className="space-y-1 pt-4">
                <p className="text-xs text-slate-500">Grupo / Produtor</p>
                <p className="text-sm font-bold text-indigo-950 uppercase">
                  {operatorName}
                </p>
                <p className="text-xs text-slate-500 font-semibold">
                  {activeFarm?.city || 'Santa Maria do Pará'} - {activeFarm?.state || 'PA'}
                </p>
              </div>
            </div>

            {/* Footer Date */}
            <div className="text-xs font-bold text-slate-500">
              {reportDate}
            </div>
          </div>
        </div>
      )}

      {/* PAGE 2: BOUNDARY MAP */}
      {reportSections.croquiBoundary && activePlot && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          <div className="flex justify-between items-start border-b border-slate-100 pb-3">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Fazenda</p>
              <h3 className="text-sm font-bold text-slate-800">{activeFarm?.name || 'Sítio Santa Cosma'}</h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Tipo de Documento</p>
              <p className="text-xs font-bold text-slate-800">Croqui do Talhão</p>
            </div>
          </div>

          {/* Map Frame */}
          <div className="flex-1 flex flex-col justify-center items-center my-6 relative border border-slate-900 p-4 min-h-[400px]">
            {/* Compass Rose */}
            <div className="absolute top-4 right-4 flex flex-col items-center">
              <div className="w-8 h-8 border border-black rounded-full flex items-center justify-center font-bold text-[8px] relative">
                <span>N</span>
                <div className="absolute top-[3px] w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[8px] border-b-black"></div>
                <div className="absolute bottom-[3px] w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[8px] border-t-slate-400"></div>
              </div>
            </div>

            <SVGPlotBoundary plot={activePlot} withPoints={false} />
          </div>

          {/* Bottom Panel */}
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Talhão</p>
              <p className="font-bold text-slate-800">{activePlot?.name || 'Área de lavoura'}</p>
              <p className="text-[10px] text-slate-500">Área: {activePlot?.area || '7,4'} ha</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase font-bold text-slate-400">Sistema de Coleta</p>
              <p className="font-bold text-slate-800">Agricultura de Precisão</p>
              <p className="text-[10px] text-slate-500 font-mono">Ano: 2024</p>
            </div>
          </div>
        </div>
      )}

      {/* PAGE 3: SAMPLING POINTS MAP */}
      {reportSections.croquiPoints && activePlot && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          <div className="text-center border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 font-heading">
              {activeFarm?.name || 'Sítio Santa Cosma'} - {activePlot?.name || 'Área de lavoura'} - {activePlot?.area || '7,4'} ha
            </h3>
          </div>

          {/* Map Frame */}
          <div className="flex-1 flex flex-col justify-center items-center my-6 border border-slate-900 p-4 min-h-[400px]">
            <SVGPlotBoundary plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} withPoints={true} />
          </div>

          {/* Metadata Box + Legend */}
          <div className="flex justify-between items-end border-t border-slate-100 pt-4">
            <div className="border border-slate-900 p-3 text-[10px] space-y-0.5 min-w-[200px] leading-relaxed font-mono">
              <p><strong>Fazenda:</strong> {activeFarm?.name || 'Sítio Santa Cosma'}</p>
              <p><strong>Produtor:</strong> {operatorName}</p>
              <p><strong>Talhão:</strong> {activePlot?.name || 'Área de lavoura'}</p>
              <p><strong>Área:</strong> {activePlot?.area || '7,4'} ha</p>
              <p><strong>Ano:</strong> 2024</p>
            </div>

            <div className="border border-slate-900 px-4 py-2.5 text-xs flex items-center gap-2 bg-slate-50">
              <span className="w-3 h-3 bg-amber-500 rounded-full inline-block border border-black"></span>
              <span className="font-bold">Pontos amostrais</span>
            </div>
          </div>
        </div>
      )}

      {/* PAGE 4: COMPARATIVE CHEMICAL CHARTS */}
      {reportSections.chartsAttributes && activePlot && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          <div className="space-y-4">
            <h3 className="text-center font-bold text-xs text-slate-800 uppercase tracking-wider leading-relaxed font-heading">
              Gráficos Comparativos entre as Médias dos Teores Atuais e Ideais dos Atributos Químicos do Solo
            </h3>

            {/* Small Header Details */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-4 text-[10px] bg-slate-50 p-2.5 border border-slate-200/60 rounded font-mono">
              <div><strong>Produtor:</strong> {operatorName}</div>
              <div><strong>Área (hectares):</strong> {activePlot?.area || '7,4'} ha</div>
              <div><strong>Fazenda:</strong> {activeFarm?.name || 'Sítio Santa Cosma'}</div>
              <div><strong>Argila:</strong> {reportAverages['0-20cm'].argila}%</div>
              <div><strong>Sistema de coleta:</strong> Agricultura de Precisão</div>
              <div><strong>Talhão:</strong> {activePlot?.name || 'Área Lavoura'}</div>
            </div>

            {/* 12 comparative charts grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-3">
              <RenderCompCard title="pH (00-20 cm)" unit="pH em água" avg={reportAverages['0-20cm'].pH} ideal={6.0} max={10} />
              <RenderCompCard title="Matéria Orgânica (00-20 cm)" unit="g/kg" avg={reportAverages['0-20cm'].MO} ideal={25.0} max={50} />
              <RenderCompCard title="Fósforo Mehlich (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].P} ideal={12.0} max={20} />
              <RenderCompCard title="Saturação potássica (00-20 cm)" unit="K/CTC %" avg={reportAverages['0-20cm'].K_sat} ideal={3.5} max={5.0} />
              <RenderCompCard title="Saturação por cálcio (00-20 cm)" unit="Ca/CTC %" avg={reportAverages['0-20cm'].Ca_sat} ideal={55.0} max={100} />
              <RenderCompCard title="Saturação por cálcio (20-40 cm)" unit="Ca/CTC %" avg={reportAverages['20-40cm'].Ca_sat} ideal={50.0} max={100} />
              <RenderCompCard title="Saturação por magnésio (00-20 cm)" unit="Mg/CTC %" avg={reportAverages['0-20cm'].Mg_sat} ideal={13.0} max={20} />
              <RenderCompCard title="Saturação por magnésio (20-40 cm)" unit="Mg/CTC %" avg={reportAverages['20-40cm'].Mg_sat} ideal={9.0} max={15} />
              <RenderCompCard title="Saturação por alumínio (00-20 cm)" unit="m%" avg={reportAverages['0-20cm'].Al_sat} ideal={0.0} max={50} isLowerBetter />
              <RenderCompCard title="Saturação por alumínio (20-40 cm)" unit="m%" avg={reportAverages['20-40cm'].Al_sat} ideal={0.0} max={50} isLowerBetter />
              <RenderCompCard title="Saturação por bases (00-20 cm)" unit="V%" avg={reportAverages['0-20cm'].V} ideal={70.0} max={100} />
              <RenderCompCard title="Saturação por bases (20-40 cm)" unit="V%" avg={reportAverages['20-40cm'].V} ideal={60.0} max={100} />
            </div>
          </div>

          <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-3 font-semibold">
            GeoSolo Pro • Agricultura de Precisão
          </div>
        </div>
      )}

      {/* PAGE 5: MICRONUTRIENTS */}
      {reportSections.chartsMicros && activePlot && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          <div className="space-y-4">
            <h3 className="text-center font-bold text-xs text-slate-800 uppercase tracking-wider leading-relaxed font-heading">
              Gráficos Comparativos entre as Médias dos Teores Atuais e Ideais dos Atributos Químicos do Solo
            </h3>

            {/* Small Header Details */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-4 text-[10px] bg-slate-50 p-2.5 border border-slate-200/60 rounded font-mono">
              <div><strong>Produtor:</strong> {operatorName}</div>
              <div><strong>Área (hectares):</strong> {activePlot?.area || '7,4'} ha</div>
              <div><strong>Fazenda:</strong> {activeFarm?.name || 'Sítio Santa Cosma'}</div>
              <div><strong>Argila:</strong> {reportAverages['0-20cm'].argila}%</div>
              <div><strong>Sistema de coleta:</strong> Agricultura de Precisão</div>
              <div><strong>Talhão:</strong> {activePlot?.name || 'Área Lavoura'}</div>
            </div>

            <div className="text-center font-black text-sm text-slate-900 border-b border-slate-200 pb-2 pt-3 uppercase tracking-widest font-heading">
              Micronutrientes
            </div>

            {/* 6 comparative micro charts grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 pt-4">
              <RenderCompCard title="Enxofre (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].S} ideal={6.0} max={15} />
              <RenderCompCard title="Enxofre (20-40 cm)" unit="mg/dm³" avg={reportAverages['20-40cm'].S} ideal={12.0} max={20} />
              <RenderCompCard title="Zinco (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].Zn} ideal={2.6} max={4.0} />
              <RenderCompCard title="Cobre (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].Cu} ideal={1.2} max={2.0} />
              <RenderCompCard title="Manganês (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].Mn} ideal={10.0} max={20} />
              <RenderCompCard title="Boro (00-20 cm)" unit="mg/dm³" avg={reportAverages['0-20cm'].B} ideal={0.35} max={0.6} />
            </div>
          </div>

          <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-3 font-semibold">
            GeoSolo Pro • Agricultura de Precisão
          </div>
        </div>
      )}

      {/* PAGE 6: THEMATIC MAPS */}
      {reportSections.thematicMaps && activePlot && (
        <>
          {/* Thematic Maps Sheet 1: pH and M.O. */}
          <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
            <div className="text-center border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800">
                {activeFarm?.name || 'Sítio Santa Cosma'} - {activePlot?.name || 'Área de lavoura'} - {activePlot?.area || '7,4'} ha
              </h3>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-6 my-6 items-center">
              {/* Left: pH Map */}
              <div className="flex flex-col items-center space-y-4">
                <h4 className="text-[11px] font-bold text-slate-800 uppercase">pH (H2O) 00-20 cm</h4>
                <div className="border border-slate-900 p-2 w-full flex justify-center items-center">
                  <SVGThematicMap plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} variable="pH" depth="0-20cm" colorThresh={{ low: 4.5, high: 5.5 }} />
                </div>
                {/* Legend */}
                <div className="text-[9px] border border-slate-900 p-2.5 w-full space-y-1 font-semibold font-mono">
                  <p className="font-extrabold border-b border-slate-200 pb-0.5 mb-1 text-[8px] uppercase text-slate-400">pH (H2O) 00-20 cm</p>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> <span>5.5 - 6.5</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> <span>5.0 - 5.5</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> <span>4.0 - 5.0</span></div>
                </div>
              </div>

              {/* Right: M.O. Map */}
              <div className="flex flex-col items-center space-y-4">
                <h4 className="text-[11px] font-bold text-slate-800 uppercase">Matéria Orgânica 00-20 cm</h4>
                <div className="border border-slate-900 p-2 w-full flex justify-center items-center">
                  <SVGThematicMap plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} variable="MO" depth="0-20cm" colorThresh={{ low: 10, high: 20 }} />
                </div>
                {/* Legend */}
                <div className="text-[9px] border border-slate-900 p-2.5 w-full space-y-1 font-semibold font-mono">
                  <p className="font-extrabold border-b border-slate-200 pb-0.5 mb-1 text-[8px] uppercase text-slate-400">M.O. 00-20 cm (g/kg)</p>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> <span>&gt; 20</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> <span>10 - 20</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> <span>5 - 10</span></div>
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-2">
              GeoSolo Pro • Agricultura de Precisão
            </div>
          </div>

          {/* Thematic Maps Sheet 2: Fósforo and Alumínio */}
          <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
            <div className="text-center border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800">
                {activeFarm?.name || 'Sítio Santa Cosma'} - {activePlot?.name || 'Área de lavoura'} - {activePlot?.area || '7,4'} ha
              </h3>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-6 my-6 items-center">
              {/* Left: Fósforo Map */}
              <div className="flex flex-col items-center space-y-4">
                <h4 className="text-[11px] font-bold text-slate-800 uppercase">Fósforo 00-20 cm</h4>
                <div className="border border-slate-900 p-2 w-full flex justify-center items-center">
                  <SVGThematicMap plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} variable="P" depth="0-20cm" colorThresh={{ low: 1.5, high: 3.0 }} />
                </div>
                {/* Legend */}
                <div className="text-[9px] border border-slate-900 p-2.5 w-full space-y-1 font-semibold font-mono">
                  <p className="font-extrabold border-b border-slate-200 pb-0.5 mb-1 text-[8px] uppercase text-slate-400">Fósforo (mg/dm³)</p>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> <span>3.0 - 5.0</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> <span>1.5 - 3.0</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> <span>0.0 - 1.5</span></div>
                </div>
              </div>

              {/* Right: Alumínio Map */}
              <div className="flex flex-col items-center space-y-4">
                <h4 className="text-[11px] font-bold text-slate-800 uppercase">Saturação por alumínio (m%)</h4>
                <div className="border border-slate-900 p-2 w-full flex justify-center items-center">
                  <SVGThematicMap plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} variable="Al_sat" depth="0-20cm" colorThresh={{ low: 15, high: 30 }} />
                </div>
                {/* Legend */}
                <div className="text-[9px] border border-slate-900 p-2.5 w-full space-y-1 font-semibold font-mono">
                  <p className="font-extrabold border-b border-slate-200 pb-0.5 mb-1 text-[8px] uppercase text-slate-400">Saturação Alumínio m%</p>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> <span>&gt; 30 (Crítico)</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> <span>15 - 30 (Alerta)</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> <span>0 - 15 (Excelente)</span></div>
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-2">
              GeoSolo Pro • Agricultura de Precisão
            </div>
          </div>

          {/* Thematic Maps Sheet 3: Liming/Calcário */}
          <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[15mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
            <div className="text-center border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800">
                {activeFarm?.name || 'Sítio Santa Cosma'} - {activePlot?.name || 'Área de lavoura'} - {activePlot?.area || '7,4'} ha
              </h3>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center space-y-4 my-6">
              <h4 className="text-xs font-extrabold text-slate-900 uppercase font-heading text-center">
                1a. Recomendação de Calcário Dolomítico - Área de lavoura ({activePlot?.area || '7,4'} ha)
              </h4>
              <div className="border border-slate-900 p-3 w-full max-w-[450px] flex justify-center items-center">
                <SVGThematicMap plot={activePlot} pointsList={pointsWithResults.length > 0 ? pointsWithResults : activePoints} variable="calagem" depth="liming" colorThresh={{ low: 1.3, high: 1.5 }} desiredV2={globalDesiredV2} prnt={globalPrnt} />
              </div>
              {/* Legend */}
              <div className="text-[10px] border border-slate-950 p-3 w-full max-w-[450px] space-y-1 bg-slate-50 font-mono">
                <p className="font-extrabold border-b border-slate-200 pb-1 mb-1.5 text-[9px] uppercase text-slate-500">
                  Recomendação de Calcário Dolomítico (ton/ha)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block border border-black/25" /> 
                    <span className="font-semibold">0.5 - 1.3 t/ha</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-amber-500 inline-block border border-black/25" /> 
                    <span className="font-semibold">1.3 - 1.5 t/ha</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-red-500 inline-block border border-black/25" /> 
                    <span className="font-semibold">1.5 - 2.0 t/ha</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-2">
              GeoSolo Pro • Agricultura de Precisão
            </div>
          </div>
        </>
      )}

      {/* PAGE 7: DETAILED MATRIX RECOMMENDATIONS */}
      {reportSections.recommendationTable && activePlot && (
        <div className="print-page w-[210mm] h-[297mm] bg-white relative p-[10mm] flex flex-col justify-between overflow-hidden page-break mx-auto">
          <div className="space-y-3">
            {/* Header Box */}
            <div className="text-center">
              <h3 className="font-black text-[10px] text-slate-800 uppercase tracking-widest leading-relaxed font-heading">
                RECOMENDAÇÃO - AGRICULTURA DE PRECISÃO - CORREÇÃO DO PERFIL DO SOLO - GRADE 42"
              </h3>
            </div>

            {/* Details Bar */}
            <div className="grid grid-cols-4 gap-2 text-[9px] bg-slate-50 p-2 border border-slate-200/60 rounded font-mono">
              <div><strong>Produtor:</strong> {operatorName}</div>
              <div><strong>Data:</strong> {reportDate}</div>
              <div><strong>Fazenda:</strong> {activeFarm?.name || 'Sítio Santa Cosma'}</div>
              <div><strong>Área (ha):</strong> {activePlot?.area || '7.4'}</div>
              <div><strong>Sistema de coleta:</strong> Agricultura de Precisão</div>
              <div><strong>Argila (%):</strong> {reportAverages['0-20cm'].argila}</div>
              <div><strong>Talhão:</strong> {activePlot?.name || 'Área de Lavoura'}</div>
              <div><strong>PRNT:</strong> {globalPrnt}%</div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-400 text-[8px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="border border-slate-400 px-1 py-1 text-center font-bold" rowSpan={2}>Amostra Nº</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" colSpan={5}>Calcário (t.ha⁻¹)</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" rowSpan={2}>Gesso t/ha</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" colSpan={3}>P₂O₅ (kg.ha⁻¹)</th>
                    <th className="border border-slate-400 px-1 py-1 text-center font-bold" rowSpan={2}>Super Simples Lanço</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" colSpan={3}>KCL (kg.ha⁻¹)</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" colSpan={2}>K₂O (kg.ha⁻¹)</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" rowSpan={2}>Ureia (Lanço)</th>
                    <th className="border border-slate-400 px-1 py-0.5 text-center font-bold" colSpan={5}>Micronutrientes (kg.ha⁻¹)</th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-800">
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Efetivo</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">1º Dol.</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">2º Dol.</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">1º Cal.</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">2º Cal.</th>
                    
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Total</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Plantio</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Lanço</th>

                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Total</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Plantio</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Lanço</th>

                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">1º L.</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">2º L.</th>

                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">S. Zinco</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Ác. Bórico</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Cu</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">Mn</th>
                    <th className="border border-slate-400 px-0.5 py-0.5 text-[7px]">FTE BR12</th>
                  </tr>
                </thead>
                <tbody>
                  {(pointsWithResults.length > 0 ? pointsWithResults : activePoints)
                    .sort((a,b) => a.pointNumber - b.pointNumber)
                    .map((p) => {
                      const auto = calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt);
                      const isDol = auto.calcarioTipo === 'Dolomítico';
                      const doseCal = isDol ? 0 : auto.nc;
                      const doseDol = isDol ? auto.nc : 0;
                      const gesso = auto.ng;
                      const mapVal = auto.map;
                      const p2o5_total = parseFloat((mapVal * 0.46).toFixed(0));
                      const kclVal = auto.kcl;

                      return (
                        <tr key={p.id} className="text-slate-800 text-center font-mono">
                          <td className="border border-slate-400 px-0.5 py-0.5 font-bold bg-slate-50">{p.pointNumber}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{auto.nc.toFixed(1)}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{(doseDol / 2).toFixed(1)}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{(doseDol / 2).toFixed(1)}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{(doseCal / 2).toFixed(1)}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{(doseCal / 2).toFixed(1)}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{gesso.toFixed(1)}</td>
                          
                          <td className="border border-slate-400 px-0.5 py-0.5">{p2o5_total}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{p2o5_total}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">0.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5 font-bold">625.0</td>

                          <td className="border border-slate-400 px-0.5 py-0.5">{kclVal}</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">0.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">{kclVal}</td>

                          <td className="border border-slate-400 px-0.5 py-0.5">100.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">100.0</td>

                          <td className="border border-slate-400 px-0.5 py-0.5">90.0</td>

                          <td className="border border-slate-400 px-0.5 py-0.5">3.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">2.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">0.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">0.0</td>
                          <td className="border border-slate-400 px-0.5 py-0.5">30.0</td>
                        </tr>
                      );
                    })}

                  {/* TOTALS */}
                  <tr className="bg-slate-100 font-bold text-center font-mono">
                    <td className="border border-slate-400 px-1 py-1 font-bold">TOTAL</td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).nc, 0)).toFixed(1)}
                    </td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + (calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).calcarioTipo === 'Dolomítico' ? calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).nc / 2 : 0), 0)).toFixed(1)}
                    </td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + (calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).calcarioTipo === 'Dolomítico' ? calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).nc / 2 : 0), 0)).toFixed(1)}
                    </td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + (calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).calcarioTipo === 'Calcítico' ? calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).nc / 2 : 0), 0)).toFixed(1)}
                    </td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + (calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).calcarioTipo === 'Calcítico' ? calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).nc / 2 : 0), 0)).toFixed(1)}
                    </td>
                    <td className="border border-slate-400 px-0.5 py-1">
                      {((pointsWithResults.length > 0 ? pointsWithResults : activePoints).reduce((acc, p) => acc + calculateAutoRecs(p, activePlot?.cropType, globalDesiredV2, globalPrnt).ng, 0)).toFixed(1)}
                    </td>
                    
                    <td className="border border-slate-400 px-0.5 py-1">740.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">740.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">0.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">4625.0</td>

                    <td className="border border-slate-400 px-0.5 py-1">888.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">0.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">888.0</td>

                    <td className="border border-slate-400 px-0.5 py-1">740.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">740.0</td>

                    <td className="border border-slate-400 px-0.5 py-1">666.0</td>

                    <td className="border border-slate-400 px-0.5 py-1">22.2</td>
                    <td className="border border-slate-400 px-0.5 py-1">14.8</td>
                    <td className="border border-slate-400 px-0.5 py-1">0.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">0.0</td>
                    <td className="border border-slate-400 px-0.5 py-1">222.0</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Agronomic Operations guidelines */}
            <div className="border border-slate-400 p-2.5 text-[7.5px] leading-relaxed space-y-1 font-sans text-slate-800">
              <p><strong>Seq. de Operações:</strong> 1a Aplicação: Calcário dolomítico. Grade 42". Plaina. 2a Aplicação Calcário dolomítico. Grade 42". Plaina. Super Simples. Niveladora. Brachiaria.</p>
              <p><strong>Calcario Efetivo:</strong> Fornece Ca e Mg, eleva a V% e diminui o efeito tóxico de Al na camada de 00-20 cm.</p>
              <p><strong>Gesso Agrícola:</strong> Doses para fornecer Cálcio, Enxofre e acondicionamento de subsolo (diminuir o efeito tóxico de Al³⁺ de 20-40 cm).</p>
              <p><strong>Seq. Adubação:</strong> Após 30 dias da germinação, aplicar a ureia a lanço. 1º aplicação de KCL 3 meses após plantio e 2º aplicação de KCL 6 meses após o plantio.</p>
              <p><strong>Seq. Micronutrientes:</strong> Se for usar sulfato de zinco e ácido bórico, aplicação deve ser feita antes do plantio via pulverizador. FTE BR12 deve ser feita junto com a aplicação de fósforo.</p>
            </div>
          </div>

          <div className="text-[9px] text-slate-400 text-center border-t border-slate-100 pt-2 font-semibold flex justify-between">
            <span>GeoSolo Pro • Agricultura de Precisão • Relatório de Correção</span>
            <span>Responsável Técnico: {userProfile.name} | CREA: {userProfile.crea} / {userProfile.unit}</span>
          </div>
        </div>
      )}
    </div>
  </>
  );
}
