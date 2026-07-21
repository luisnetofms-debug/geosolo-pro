import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Farm, Plot, SamplingPoint, PlotPeriod, SoilLabResults, FERTILITY_THRESHOLDS } from '../types';
import { calculateAutoRecs } from './AIPanel';
import L from 'leaflet';
import { 
  Building2, Layers, CheckSquare, Settings, Compass, 
  ChevronRight, Calendar, AlertCircle, Info, Database,
  TrendingUp, Activity, Sparkles, Filter, Droplet, Eye, EyeOff,
  Maximize2, Minimize2
} from 'lucide-react';

interface PropertyMapProps {
  farm: Farm | null;
  plots: Plot[];
  plotPeriods: PlotPeriod[];
  samplingPoints: SamplingPoint[];
  soilLayers: string[];
  activeSoilLayer: string;
  onSelectPlot: (plotId: string, monthYear?: string) => void;
  onSelectTab: (tab: 'clients' | 'field_station' | 'lab_results' | 'ai_panel' | 'fertility_maps' | 'property_map') => void;
  activePlotId?: string;
  onSelectMonthYear?: (monthYear: string) => void;
  dbStatus?: string;
}

export default function PropertyMap({
  farm,
  plots,
  plotPeriods,
  samplingPoints,
  soilLayers,
  activeSoilLayer: initialActiveSoilLayer,
  onSelectPlot,
  onSelectTab,
  activePlotId: globalActivePlotId,
  onSelectMonthYear,
  dbStatus
}: PropertyMapProps) {
  
  // Local active plot selection in Property Map
  const [selectedPlotId, setSelectedPlotId] = useState<string>('');
  
  // Selected project (monthYear) per plot
  const [plotSelectedProjects, setPlotSelectedProjects] = useState<Record<string, string>>({});
  
  // Selected soil layer depth for averages
  const [activeLayer, setActiveLayer] = useState<string>('0-20cm');
  
  // Selected variable to overlay/visualize on the map polygons
  const [mapVariable, setMapVariable] = useState<keyof SoilLabResults>('v_percent');

  // Track map visibility state (active vs hidden) per plot
  const [visiblePlotIds, setVisiblePlotIds] = useState<Record<string, boolean>>({});

  // Fullscreen state and wrapper ref
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenWrapperRef = useRef<HTMLDivElement | null>(null);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [lastSavedDate, setLastSavedDate] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);
  const loadedFarmIdRef = useRef<string | null>(null);

  const toggleFullscreen = () => {
    setIsFullscreen(prev => {
      const next = !prev;
      if (next) {
        if (fullscreenWrapperRef.current && fullscreenWrapperRef.current.requestFullscreen) {
          fullscreenWrapperRef.current.requestFullscreen().catch(() => {
            // Native fullscreen blocked (e.g. inside iframe), fallback to fixed CSS modal
          });
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  };

  // Sync state when native fullscreen exits (e.g., via ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isFullscreen]);

  // Trigger Leaflet map invalidateSize when toggling fullscreen
  useEffect(() => {
    if (mapInstanceRef.current) {
      const t1 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 50);
      const t2 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isFullscreen]);

  // ESC key listener for fixed overlay mode fallback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Filter plots belonging to this farm
  const farmPlots = useMemo(() => {
    if (!farm) return [];
    return plots.filter(p => p.farmId === farm.id);
  }, [plots, farm]);

  // Determine available projects (monthYears) for each plot
  const plotAvailablePeriods = useMemo(() => {
    const map: Record<string, string[]> = {};
    farmPlots.forEach(plot => {
      // Get all unique monthYears from sampling points or plotPeriods
      const periodsFromPoints = Array.from(
        new Set(
          samplingPoints
            .filter(p => p.plotId === plot.id && p.monthYear)
            .map(p => p.monthYear!)
        )
      );
      
      const periodsFromProps = plotPeriods
        .filter(pp => pp.plotId === plot.id)
        .map(pp => pp.monthYear);
      
      const combined = Array.from(new Set([...periodsFromPoints, ...periodsFromProps, '05/2026']));
      map[plot.id] = combined.sort();
    });
    return map;
  }, [farmPlots, samplingPoints, plotPeriods]);

  // Helper to get the resolved selected project for a given plot
  const getPlotProject = React.useCallback((plotId: string) => {
    if (plotSelectedProjects[plotId]) {
      return plotSelectedProjects[plotId];
    }
    const available = plotAvailablePeriods[plotId] || [];
    return available.includes('05/2026') ? '05/2026' : (available[0] || '05/2026');
  }, [plotSelectedProjects, plotAvailablePeriods]);

  // Helper to save current configuration to localStorage
  const saveConfigToLocalStorage = React.useCallback((
    updatedProjects?: Record<string, string>,
    updatedVisibility?: Record<string, boolean>,
    updatedLayer?: string,
    updatedVariable?: keyof SoilLabResults,
    updatedSelectedPlotId?: string
  ) => {
    if (!farm) return;
    try {
      const currentProj = updatedProjects !== undefined ? updatedProjects : plotSelectedProjects;
      const currentVis = updatedVisibility !== undefined ? updatedVisibility : visiblePlotIds;
      const currentLayer = updatedLayer !== undefined ? updatedLayer : activeLayer;
      const currentVar = updatedVariable !== undefined ? updatedVariable : mapVariable;
      const currentPlotId = updatedSelectedPlotId !== undefined ? updatedSelectedPlotId : selectedPlotId;

      const config = {
        plotSelectedProjects: currentProj,
        visiblePlotIds: currentVis,
        activeLayer: currentLayer,
        mapVariable: currentVar,
        selectedPlotId: currentPlotId,
        savedAt: new Date().toISOString()
      };
      
      localStorage.setItem(`geosolo_property_map_config_${farm.id}`, JSON.stringify(config));
      
      if (currentPlotId) {
        localStorage.setItem('geosolo_last_saved_plot_id', currentPlotId);
        const chosenProj = currentProj[currentPlotId] || (plotAvailablePeriods[currentPlotId]?.includes('05/2026') ? '05/2026' : (plotAvailablePeriods[currentPlotId]?.[0] || '05/2026'));
        localStorage.setItem('geosolo_last_saved_month_year', chosenProj);
      }
    } catch (err) {
      console.error('Failed to save display configuration:', err);
    }
  }, [farm, plotSelectedProjects, visiblePlotIds, activeLayer, mapVariable, selectedPlotId, plotAvailablePeriods]);

  // Load saved configurations on mount / farm change (only once per farm)
  useEffect(() => {
    if (dbStatus === 'connecting') return;
    if (!farm || farmPlots.length === 0) return;
    
    // Only load if we haven't loaded for this farm yet
    if (loadedFarmIdRef.current === farm.id) return;
    
    try {
      const savedConfigStr = localStorage.getItem(`geosolo_property_map_config_${farm.id}`);
      if (savedConfigStr) {
        const config = JSON.parse(savedConfigStr);
        if (config) {
          const loadedProjects = { ...config.plotSelectedProjects };
          // Ensure every plot has an assigned project
          farmPlots.forEach(plot => {
            if (!loadedProjects[plot.id]) {
              const available = plotAvailablePeriods[plot.id] || [];
              loadedProjects[plot.id] = available.includes('05/2026') ? '05/2026' : (available[0] || '05/2026');
            }
          });

          setPlotSelectedProjects(loadedProjects);
          
          if (config.visiblePlotIds) {
            setVisiblePlotIds(config.visiblePlotIds);
          } else {
            const initialVis: Record<string, boolean> = {};
            farmPlots.forEach(plot => {
              initialVis[plot.id] = true;
            });
            setVisiblePlotIds(initialVis);
          }
          if (config.activeLayer) {
            setActiveLayer(config.activeLayer);
          }
          if (config.mapVariable) {
            setMapVariable(config.mapVariable);
          }
          if (config.savedAt) {
            setLastSavedDate(new Date(config.savedAt).toLocaleString('pt-BR'));
          } else {
            setLastSavedDate(null);
          }
          
          let targetPlotId = '';
          if (config.selectedPlotId && farmPlots.some(p => p.id === config.selectedPlotId)) {
            targetPlotId = config.selectedPlotId;
          } else if (globalActivePlotId && farmPlots.some(p => p.id === globalActivePlotId)) {
            targetPlotId = globalActivePlotId;
          } else {
            targetPlotId = farmPlots[0].id;
          }
          
          setSelectedPlotId(targetPlotId);
          
          const chosenProj = loadedProjects[targetPlotId];
          onSelectPlot(targetPlotId, chosenProj);
          if (onSelectMonthYear) {
            onSelectMonthYear(chosenProj);
          }
        }
      } else {
        // No saved config - clear and reset states with defaults
        const defaultProjects: Record<string, string> = {};
        const initialVis: Record<string, boolean> = {};
        
        farmPlots.forEach(plot => {
          const available = plotAvailablePeriods[plot.id] || [];
          defaultProjects[plot.id] = available.includes('05/2026') ? '05/2026' : (available[0] || '05/2026');
          initialVis[plot.id] = true;
        });

        setPlotSelectedProjects(defaultProjects);
        setVisiblePlotIds(initialVis);
        setLastSavedDate(null);
        
        let targetPlotId = '';
        if (globalActivePlotId && farmPlots.some(p => p.id === globalActivePlotId)) {
          targetPlotId = globalActivePlotId;
        } else {
          targetPlotId = farmPlots[0].id;
        }
        
        setSelectedPlotId(targetPlotId);
        
        const chosenProj = defaultProjects[targetPlotId];
        onSelectPlot(targetPlotId, chosenProj);
        if (onSelectMonthYear) {
          onSelectMonthYear(chosenProj);
        }
      }
      
      // Successfully loaded config for this farm
      loadedFarmIdRef.current = farm.id;
    } catch (err) {
      console.error('Failed to load saved property map configuration:', err);
      setLastSavedDate(null);
    }
  }, [farm, farmPlots, globalActivePlotId, onSelectPlot, onSelectMonthYear, plotAvailablePeriods, dbStatus]);

  const handleSaveDisplayConfig = () => {
    if (!farm) return;
    try {
      saveConfigToLocalStorage();
      setLastSavedDate(new Date().toLocaleString('pt-BR'));
      setSaveStatus('Sucesso');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('Erro');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleRestoreDisplayConfig = () => {
    if (!farm) return;
    try {
      const savedConfigStr = localStorage.getItem(`geosolo_property_map_config_${farm.id}`);
      if (savedConfigStr) {
        const config = JSON.parse(savedConfigStr);
        if (config) {
          if (config.plotSelectedProjects) setPlotSelectedProjects(config.plotSelectedProjects);
          if (config.visiblePlotIds) setVisiblePlotIds(config.visiblePlotIds);
          if (config.activeLayer) setActiveLayer(config.activeLayer);
          if (config.mapVariable) setMapVariable(config.mapVariable);
          if (config.selectedPlotId && farmPlots.some(p => p.id === config.selectedPlotId)) {
            setSelectedPlotId(config.selectedPlotId);
            const chosenProj = config.plotSelectedProjects?.[config.selectedPlotId] || '05/2026';
            onSelectPlot(config.selectedPlotId, chosenProj);
            if (onSelectMonthYear) {
              onSelectMonthYear(chosenProj);
            }
          }
          setSaveStatus('Restaurado');
          setTimeout(() => setSaveStatus(null), 3000);
        }
      } else {
        setSaveStatus('Nenhum salvo');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('Erro');
      setTimeout(() => setSaveStatus(null), 3005);
    }
  };

  const handleClearDisplayConfig = () => {
    if (!farm) return;
    try {
      localStorage.removeItem(`geosolo_property_map_config_${farm.id}`);
      setLastSavedDate(null);
      setSaveStatus('Limpo');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const activePlot = useMemo(() => {
    return farmPlots.find(p => p.id === selectedPlotId) || null;
  }, [farmPlots, selectedPlotId]);

  // Calculate sampling points for each plot based on its chosen project
  const plotProjectAverages = useMemo(() => {
    const averagesMap: Record<string, { averages: Record<string, number | string>; count: number }> = {};
    
    farmPlots.forEach(plot => {
      const selectedProj = getPlotProject(plot.id);
      
      // Fetch sampling points for this plot and selected project monthYear
      const ptsForPlot = samplingPoints.filter(p => 
        p.plotId === plot.id && 
        (p.monthYear === selectedProj || (!p.monthYear && selectedProj === '05/2026'))
      );

      // Get appropriate results depending on depth layer
      const resultsList: SoilLabResults[] = [];
      let collectedCount = 0;

      ptsForPlot.forEach(p => {
        // If they ask for deep layers, look for subsamples. Otherwise, fallback to p.results
        let resultsToUse: SoilLabResults | undefined = undefined;
        const normActiveLayer = activeLayer.replace(/\s+/g, '').toLowerCase();

        if (normActiveLayer === '0-20cm') {
          const sub = p.subsamples?.find(s => s.depth.replace(/\s+/g, '').toLowerCase() === '0-20cm');
          resultsToUse = sub?.results || p.results;
        } else if (p.subsamples) {
          const sub = p.subsamples.find(s => s.depth.replace(/\s+/g, '').toLowerCase() === normActiveLayer);
          resultsToUse = sub?.results;
        }

        if (resultsToUse) {
          const savedRec = p.recommendations || {};
          const autoRecs = calculateAutoRecs(p, plot.cropType || 'soja', 70, 80);

          const calcarioVal = (savedRec.calcarioDolomitico !== undefined || savedRec.calcarioCalcitico !== undefined)
            ? ((savedRec.calcarioDolomitico || 0) + (savedRec.calcarioCalcitico || 0))
            : autoRecs.nc;

          const gessoVal = savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng;
          const kclVal = savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl;
          const mapVal = savedRec.map !== undefined ? savedRec.map : autoRecs.map;
          const formuladoVal = savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado;

          const enrichedResults: SoilLabResults = {
            ...resultsToUse,
            rec_calcario: calcarioVal,
            rec_gesso: gessoVal,
            rec_kcl: kclVal,
            rec_map: mapVal,
            rec_formulado: formuladoVal,
          };

          resultsList.push(enrichedResults);
          if (p.isCollected) collectedCount++;
        }
      });

      // Compute simple mathematical averages for all potential variables
      const averages: Record<string, number | string> = {};
      const numericKeys = Object.keys(FERTILITY_THRESHOLDS) as (keyof SoilLabResults)[];

      numericKeys.forEach(key => {
        const vals = resultsList
          .map(r => r[key])
          .filter(v => v !== undefined && v !== null && v !== 'ns' && v !== '')
          .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
          .filter(v => !isNaN(v));

        if (vals.length > 0) {
          const sum = vals.reduce((acc, curr) => acc + curr, 0);
          averages[key] = sum / vals.length;
        } else {
          averages[key] = NaN; // Indicated as missing/uncollected
        }
      });

      // Extract text/categorical values from latest collected point
      const lastWithText = [...resultsList].reverse().find(r => r.clas_textura || r.tipo_solo);
      averages['clas_textura'] = lastWithText?.clas_textura || 'Não Informado';
      averages['tipo_solo'] = lastWithText?.tipo_solo || 'N/A';

      averagesMap[plot.id] = {
        averages,
        count: ptsForPlot.length
      };
    });

    return averagesMap;
  }, [farmPlots, plotSelectedProjects, samplingPoints, activeLayer, getPlotProject]);

  // Fingerprint representing the set of active/visible plot IDs
  const visiblePlotsKey = useMemo(() => {
    return farmPlots
      .filter(p => {
        const plotProj = getPlotProject(p.id);
        const isPlotVisible = visiblePlotIds[`${p.id}_${plotProj}`] !== undefined 
          ? visiblePlotIds[`${p.id}_${plotProj}`] 
          : (visiblePlotIds[p.id] !== false);
        return isPlotVisible;
      })
      .map(p => p.id)
      .join(',');
  }, [farmPlots, visiblePlotIds, plotSelectedProjects, getPlotProject]);

  // 1. Leaflet Map Instance Initialization & Lifetime (dependent only on farm changes)
  useEffect(() => {
    if (!mapContainerRef.current || !farm) return;

    // Center map on average coordinates of all plot boundary points of this farm
    let allLats: number[] = [];
    let allLngs: number[] = [];

    farmPlots.forEach(p => {
      if (p.boundaryPoints && Array.isArray(p.boundaryPoints)) {
        p.boundaryPoints.forEach(bp => {
          allLats.push(bp.lat);
          allLngs.push(bp.lng);
        });
      }
    });

    // Fallback to primary coordinate if no boundary points are loaded
    const defaultLat = -21.17;
    const defaultLng = -47.81;
    const centerLat = allLats.length > 0 ? (Math.max(...allLats) + Math.min(...allLats)) / 2 : defaultLat;
    const centerLng = allLngs.length > 0 ? (Math.max(...allLngs) + Math.min(...allLngs)) / 2 : defaultLng;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      maxZoom: 18,
      minZoom: 11
    }).setView([centerLat, centerLng], 14);

    mapInstanceRef.current = map;

    // Satélite Online High Resolution backdrop
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '🛰️ Esri Satellite Map'
    }).addTo(map);

    const layersGroup = L.featureGroup().addTo(map);
    layersGroupRef.current = layersGroup;

    // Fit map bounds to display all plots together comfortably
    if (allLats.length > 0 && allLngs.length > 0) {
      const bounds = L.latLngBounds(
        farmPlots.flatMap(p => (p.boundaryPoints || []).map(bp => L.latLng(bp.lat, bp.lng)))
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
      }
    };
  }, [farm ? farm.id : null]);

  // 1b. Dynamic Auto-Fitting of Map Bounds when visible plots change or are created
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const visiblePlots = farmPlots.filter(p => {
      const plotProj = getPlotProject(p.id);
      const isPlotVisible = visiblePlotIds[`${p.id}_${plotProj}`] !== undefined 
        ? visiblePlotIds[`${p.id}_${plotProj}`] 
        : (visiblePlotIds[p.id] !== false);
      return isPlotVisible && p.boundaryPoints && p.boundaryPoints.length >= 3;
    });
    if (visiblePlots.length === 0) return;

    const boundsPoints = visiblePlots.flatMap(p => (p.boundaryPoints || []).map(bp => L.latLng(bp.lat, bp.lng)));
    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], animate: true });
    }
  }, [visiblePlotsKey]);

  // 2. Leaflet Layer Drawing/Updating (re-renders polygons without destroying the map container)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    // Clear previous layers before rendering updated ones
    layersGroup.clearLayers();

    // Draw each plot with colored polygons corresponding to mapVariable level
    farmPlots.forEach(plot => {
      const plotProj = getPlotProject(plot.id);
      // Respect visible toggle per project
      const isPlotVisible = visiblePlotIds[`${plot.id}_${plotProj}`] !== undefined 
        ? visiblePlotIds[`${plot.id}_${plotProj}`] 
        : (visiblePlotIds[plot.id] !== false);
      if (!isPlotVisible) return;

      if (!plot.boundaryPoints || !Array.isArray(plot.boundaryPoints) || plot.boundaryPoints.length < 3) return;

      const polygonPoints = plot.boundaryPoints.map(bp => [bp.lat, bp.lng] as [number, number]);
      const avgData = plotProjectAverages[plot.id]?.averages;
      const numVal = avgData ? (avgData[mapVariable] as number) : NaN;

      // Color coding logic based on threshold
      let fillColor = '#64748b'; // Slate for missing
      const thresholds = FERTILITY_THRESHOLDS[mapVariable];

      if (!isNaN(numVal) && thresholds) {
        if (String(mapVariable).startsWith('rec_')) {
          // Recommendation doses (0 = ideal/none needed, low = blue, medium = amber, high = dark amber)
          if (numVal === 0) fillColor = '#10b981'; // green / no application needed
          else if (numVal <= thresholds.low) fillColor = '#3b82f6'; // blue / light dose
          else if (numVal <= thresholds.medium) fillColor = '#f59e0b'; // amber / moderate dose
          else fillColor = '#d97706'; // dark amber / high dose
        } else if (mapVariable === 'Al' || mapVariable === 'al') {
          // Aluminum is toxic - low is better
          if (numVal <= thresholds.low) fillColor = '#10b981'; // green / excellent
          else if (numVal <= thresholds.medium) fillColor = '#eab308'; // yellow / alert
          else fillColor = '#ef4444'; // red / high contamination
        } else {
          // Standard variables - higher is better
          if (numVal <= thresholds.low) fillColor = '#ef4444'; // red / poor
          else if (numVal <= thresholds.medium) fillColor = '#f59e0b'; // amber / medium
          else fillColor = '#10b981'; // green / high fertility
        }
      }

      const isCurrentSelected = plot.id === selectedPlotId;

      const poly = L.polygon(polygonPoints, {
        color: isCurrentSelected ? '#3b82f6' : '#ffffff',
        weight: isCurrentSelected ? 4 : 2,
        fillColor: fillColor,
        fillOpacity: isCurrentSelected ? 0.65 : 0.45,
        dashArray: isCurrentSelected ? '' : '3, 4'
      }).addTo(layersGroup);

      // Mouse interactive effects
      poly.on('mouseover', () => {
        poly.setStyle({ fillOpacity: 0.75, weight: isCurrentSelected ? 4 : 3 });
      });

      poly.on('mouseout', () => {
        poly.setStyle({ fillOpacity: isCurrentSelected ? 0.65 : 0.45, weight: isCurrentSelected ? 4 : 2 });
      });

      poly.on('click', () => {
        setSelectedPlotId(plot.id);
        const plotProj = getPlotProject(plot.id);
        onSelectPlot(plot.id, plotProj);
        if (onSelectMonthYear) {
          onSelectMonthYear(plotProj);
        }
        saveConfigToLocalStorage(undefined, undefined, undefined, undefined, plot.id);
      });

      const variableLabel = thresholds?.name || String(mapVariable).toUpperCase();
      const unit = thresholds?.unit || '';
      const displayVal = isNaN(numVal) ? 'Sem análise' : `${numVal.toFixed(2)} ${unit}`;
      const chosenProj = getPlotProject(plot.id);

      // Attach detailed tooltip
      poly.bindTooltip(`
        <div class="p-2 font-sans text-xs">
          <p class="font-extrabold text-slate-900 border-b border-slate-100 pb-1 mb-1">${plot.name.toUpperCase()}</p>
          <p class="text-slate-500">Área: <strong class="text-slate-800">${plot.areaHectares} ha</strong></p>
          <p class="text-slate-500">Cultura: <strong class="text-slate-800">${plot.cropType}</strong></p>
          <p class="text-slate-500">Projeto: <strong class="text-slate-800">${chosenProj}</strong></p>
          <p class="mt-1 pb-0.5 border-t border-dashed border-slate-100 pt-1 font-bold text-slate-700">
            Média ${variableLabel}: <span class="text-indigo-600 font-extrabold font-mono">${displayVal}</span>
          </p>
        </div>
      `, { sticky: true });
    });
  }, [farmPlots, selectedPlotId, plotProjectAverages, mapVariable, plotSelectedProjects, visiblePlotIds, getPlotProject, saveConfigToLocalStorage]);

  if (!farm) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-slate-350 mx-auto" />
        <h4 className="text-sm font-extrabold text-slate-800 uppercase">Nenhuma Propriedade Selecionada</h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Por favor, retorne para a aba de <strong className="text-slate-700">Clientes & Fazendas</strong> e selecione ou crie um cliente ativo.
        </p>
      </div>
    );
  }

  // Helper renderer for chemical classification and progress bar
  const renderVariableStat = (key: keyof SoilLabResults, group: string) => {
    const avgData = plotProjectAverages[selectedPlotId]?.averages;
    if (!avgData) return null;

    const val = avgData[key];
    const thresholds = FERTILITY_THRESHOLDS[key];
    if (!thresholds) return null;

    const numVal = typeof val === 'number' ? val : (val && !isNaN(parseFloat(String(val))) ? parseFloat(String(val)) : NaN);
    const isMissing = isNaN(numVal);

    let classification = 'N/D';
    let badgeColor = 'bg-slate-100 text-slate-500';
    let progressPercent = 0;

    // Simple bounds normalized progress (0 to 100%)
    if (!isMissing) {
      if (key === 'Al' || key === 'al') {
        // Reverse for Aluminum toxicity (lower the better)
        if (numVal <= thresholds.low) {
          classification = 'Excelente / Baixo';
          badgeColor = 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold';
        } else if (numVal <= thresholds.medium) {
          classification = 'Alerta / Médio';
          badgeColor = 'bg-amber-50 border border-amber-200 text-amber-700 font-extrabold';
        } else {
          classification = 'Tóxico / Alto';
          badgeColor = 'bg-rose-50 border border-rose-200 text-rose-700 font-extrabold';
        }
        progressPercent = Math.min(100, Math.max(5, (numVal / (thresholds.high || 10)) * 100));
      } else {
        // Higher is better standard
        if (numVal <= thresholds.low) {
          classification = 'Baixo Teor';
          badgeColor = 'bg-rose-50 border border-rose-200 text-rose-700 font-extrabold';
        } else if (numVal <= thresholds.medium) {
          classification = 'Médio / Adequado';
          badgeColor = 'bg-amber-50 border border-amber-200 text-amber-700 font-extrabold';
        } else {
          classification = 'Alto / Excelente';
          badgeColor = 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold';
        }
        const maxRef = thresholds.high * 1.5 || 100;
        progressPercent = Math.min(100, Math.max(5, (numVal / maxRef) * 100));
      }
    }

    return (
      <div key={key} className="p-3 bg-white hover:bg-slate-50/50 rounded-xl border border-slate-100 transition-all flex flex-col justify-between space-y-2 group shadow-2xs">
        <div className="flex justify-between items-start gap-1">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 block tracking-tight uppercase leading-none group-hover:text-slate-500">
              {thresholds.name}
            </span>
            <span className="text-xs font-extrabold text-slate-750 font-mono mt-1 block">
              {isMissing ? 'Não Analisado' : `${numVal.toFixed(2)}${thresholds.unit}`}
            </span>
          </div>
          {!isMissing && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase whitespace-nowrap ${badgeColor}`}>
              {classification}
            </span>
          )}
        </div>
        
        {!isMissing ? (
          <div className="space-y-1">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  classification.includes('Baixo') ? 'bg-rose-500' :
                  classification.includes('Médio') || classification.includes('Alerta') ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-slate-400 font-mono">
              <span>Mín: {thresholds.low}</span>
              <span>Ref: {thresholds.high}</span>
            </div>
          </div>
        ) : (
          <div className="text-[9px] text-slate-350 italic font-mono pt-1">
            Falta dados no furos do projeto
          </div>
        )}
      </div>
    );
  };

  const selectedPlotAverages = plotProjectAverages[selectedPlotId]?.averages;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="property-multidimensional-workflow">
      
      {/* LEFT COLUMN: MULTI-PLOT TIMELINE CONTROL BOARD */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Farm overview summary header */}
        <div className="bg-white rounded-xl border border-slate-150 p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-800 uppercase leading-none">
                {farm.name}
              </h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-none font-medium">
                Localidade: {farm.city} - {farm.state} | Área Total: {farm.areaHectares} ha
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px]">Total de Talhões</span>
              <strong className="text-slate-800 text-sm font-extrabold">{farmPlots.length}</strong>
            </div>
            <div className="text-xs text-right">
              <span className="text-slate-400 block text-[10px]">Variável do Mapa</span>
              <select
                value={mapVariable}
                onChange={(e) => setMapVariable(e.target.value as keyof SoilLabResults)}
                className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-bold text-indigo-700 cursor-pointer focus:outline-hidden"
              >
                <option value="v_percent">V% Saturação Bases</option>
                <option value="pH">pH (H2O)</option>
                <option value="ph_cacl2">pH CaCl2</option>
                <option value="mo">M.O. Matéria Orgânica</option>
                <option value="p_meh">Fósforo (P meh)</option>
                <option value="k">Potássio (K+)</option>
                <option value="ca">Cálcio (Ca 2+)</option>
                <option value="mg">Magnésio (Mg 2+)</option>
                <option value="s">Enxofre (S)</option>
                <option value="k_t">Relação K/CTC %</option>
                <option value="al">Alumínio (Al 3+)</option>
                <option value="argila">Argila (%)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Persistência de Exibição / Display Configurations persistence */}
        <div className="bg-slate-900 border border-slate-850 rounded-xl p-4 space-y-3 text-white shadow-xs text-left" id="display-configurations-persistence-card">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-purple-300">
                Configurações de Exibição:
              </span>
            </div>
            <span className="bg-purple-950 border border-purple-800 text-purple-300 text-[8px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider">
              Persistência
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Salve os filtros de projetos e a visibilidade dos talhões ativos de <strong className="text-slate-200">{farm?.name}</strong> para que sejam carregados de forma idêntica no próximo acesso.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleSaveDisplayConfig}
              className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-md cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              title="Salvar quais talhes estão ativos/ocultos e os projetos de cada um"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Salvar Exibição</span>
            </button>

            <button
              onClick={handleRestoreDisplayConfig}
              className="flex-1 py-1.5 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-[10px] uppercase tracking-wider rounded-md cursor-pointer transition-colors flex items-center justify-center gap-1.5 border border-slate-705"
              title="Recarregar a última exibição salva para esta fazenda"
            >
              <Compass className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
              <span>Restaurar</span>
            </button>
          </div>

          {/* Status Display area */}
          <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
            <span>
              {lastSavedDate ? (
                <>
                  Salvo em: <strong className="text-slate-350">{lastSavedDate}</strong>
                </>
              ) : (
                "Nenhuma configuração salva"
              )}
            </span>

            {lastSavedDate && (
              <button
                onClick={handleClearDisplayConfig}
                className="text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                title="Limpar configurações salvas para esse mapa"
              >
                Excluir
              </button>
            )}
          </div>

          {saveStatus && (
            <div className={`text-center py-1 rounded text-[9px] font-bold transition-all duration-300 ${
              saveStatus === 'Sucesso' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900' :
              saveStatus === 'Restaurado' ? 'bg-purple-950/80 text-purple-400 border border-purple-900' :
              saveStatus === 'Limpo' ? 'bg-amber-950/80 text-amber-400 border border-amber-900' :
              saveStatus === 'Nenhum salvo' ? 'bg-slate-800 text-slate-300 border border-slate-700' :
              'bg-rose-950/80 text-rose-400 border border-rose-900'
            }`}>
              {saveStatus === 'Sucesso' && '✓ Exibição salva com sucesso!'}
              {saveStatus === 'Restaurado' && '✓ Exibição restaurada de seu backup!'}
              {saveStatus === 'Limpo' && 'Instalação de exibição limpa com sucesso.'}
              {saveStatus === 'Nenhum salvo' && 'Nenhum backup encontrado para esta fazenda.'}
              {saveStatus === 'Erro' && 'Erro ao processar persistência de exibição.'}
            </div>
          )}
        </div>

        {/* Plots List and select dropdown */}
        <div className="bg-white rounded-xl border border-slate-150 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Talhões Co-instalados</span>
            <span className="bg-slate-100 text-[9px] text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
              Configurador de Projetos
            </span>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {farmPlots.map(plot => {
              const isSelected = plot.id === selectedPlotId;
              const plotProj = getPlotProject(plot.id);
              const isPlotVisible = visiblePlotIds[`${plot.id}_${plotProj}`] !== undefined 
                ? visiblePlotIds[`${plot.id}_${plotProj}`] 
                : (visiblePlotIds[plot.id] !== false);
              const avg = plotProjectAverages[plot.id];
              const samplingCount = avg?.count || 0;

              return (
                <div 
                  key={plot.id}
                  onClick={() => {
                    setSelectedPlotId(plot.id);
                    const plotProjVal = getPlotProject(plot.id);
                    onSelectPlot(plot.id, plotProjVal);
                    if (onSelectMonthYear) {
                      onSelectMonthYear(plotProjVal);
                    }
                    saveConfigToLocalStorage(undefined, undefined, undefined, undefined, plot.id);
                  }}
                  className={`p-3 rounded-lg border transition-all text-left cursor-pointer space-y-2.5 relative flex flex-col justify-between ${
                    isSelected 
                      ? 'bg-blue-50/50 border-blue-500 shadow-xs' 
                      : 'bg-slate-50 hover:bg-slate-100/60 border-slate-200'
                  } ${!isPlotVisible ? 'opacity-65' : ''}`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Layers className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold text-slate-800 uppercase block">{plot.name}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                        Área: {plot.areaHectares} ha | {plot.cropType}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Active/Hidden Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const projectKey = `${plot.id}_${plotProj}`;
                          const currentVal = visiblePlotIds[projectKey] !== undefined 
                            ? visiblePlotIds[projectKey] 
                            : (visiblePlotIds[plot.id] !== false);
                          const nextVis = {
                            ...visiblePlotIds,
                            [projectKey]: !currentVal
                          };
                          setVisiblePlotIds(nextVis);
                          saveConfigToLocalStorage(undefined, nextVis);
                        }}
                        className={`px-2 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1 text-[8px] font-black uppercase ${
                          isPlotVisible
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-450 border-slate-200 hover:bg-slate-150'
                        }`}
                        title={isPlotVisible ? "Ocultar projeto no mapa" : "Mostrar projeto no mapa"}
                      >
                        {isPlotVisible ? (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Ativo</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                            <span>Oculto</span>
                          </>
                        )}
                      </button>

                      {isSelected && (
                        <span className="bg-blue-500 text-white p-0.5 rounded-full block">
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100/70 pt-2 flex items-center justify-between gap-1.5">
                    {/* Project timeline dropdown */}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                      <select
                        value={plotProj}
                        onClick={(e) => e.stopPropagation()} // Avoid triggering plot selection
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = e.target.value;
                          const nextProjects = { ...plotSelectedProjects, [plot.id]: val };
                          setPlotSelectedProjects(nextProjects);
                          if (plot.id === selectedPlotId && onSelectMonthYear) {
                            onSelectMonthYear(val);
                            onSelectPlot(plot.id, val);
                          }
                          saveConfigToLocalStorage(nextProjects);
                        }}
                        className="text-[10px] bg-white border border-slate-225 rounded px-1.5 py-0.5 font-bold text-slate-700 cursor-pointer focus:ring-1 focus:ring-blue-500"
                      >
                        {(plotAvailablePeriods[plot.id] || []).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <span className="bg-slate-100 text-[9px] text-slate-500 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                      {samplingCount} furos
                    </span>
                  </div>
                </div>
              );
            })}

            {farmPlots.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">Nenhum talhão cadastrado para esta fazenda.</p>
            )}
          </div>
        </div>

        {/* Global Depth Layer Selector */}
        <div className="p-3.5 bg-slate-900 border border-slate-850 rounded-xl space-y-2 text-white shadow-xs text-left">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-300">
              Profundidade das Amostras:
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-800 rounded-md border border-slate-700">
            {soilLayers.map(l => (
              <button
                key={l}
                onClick={() => setActiveLayer(l)}
                className={`py-1 text-[9px] font-extrabold rounded select-none cursor-pointer text-center ${
                  activeLayer === l
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">
            Todas as médias mostradas ao lado serão recalculadas instantaneamente com base nos dados do estrato escolhido do solo.
          </p>
        </div>

      </div>

      {/* MAP VIEWPORT CARD */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        
        {/* Map Stage container */}
        <div 
          ref={fullscreenWrapperRef}
          className={`bg-white rounded-xl border border-slate-150 shadow-xs overflow-hidden flex flex-col transition-all ${
            isFullscreen 
              ? 'fixed inset-0 z-[9999] w-screen h-screen rounded-none border-none p-0 bg-slate-900' 
              : ''
          }`}
        >
          <div className={`p-4 border-b flex items-center justify-between ${
            isFullscreen ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-800'
          }`}>
            <div>
              <h4 className={`text-xs font-extrabold uppercase leading-none ${isFullscreen ? 'text-white' : 'text-slate-800'}`}>
                Mapeamento das Quadras • Limites do Imóvel
              </h4>
              <p className={`text-[10px] mt-0.5 leading-none ${isFullscreen ? 'text-slate-400' : 'text-slate-400'}`}>
                Roteiro geoespacial e fertilidade visual ativa para {activeLayer} {farm ? `• ${farm.name}` : ''}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {isFullscreen && (
                <div className="flex items-center gap-2 text-xs mr-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold hidden md:inline">Variável:</span>
                  <select
                    value={mapVariable}
                    onChange={(e) => setMapVariable(e.target.value as keyof SoilLabResults)}
                    className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 rounded px-2 py-1 font-bold cursor-pointer focus:outline-hidden"
                  >
                    <option value="v_percent">V% Saturação Bases</option>
                    <option value="pH">pH (H2O)</option>
                    <option value="ph_cacl2">pH CaCl2</option>
                    <option value="mo">M.O. Matéria Orgânica</option>
                    <option value="p_meh">Fósforo (P meh)</option>
                    <option value="k">Potássio (K+)</option>
                    <option value="ca">Cálcio (Ca 2+)</option>
                    <option value="mg">Magnésio (Mg 2+)</option>
                    <option value="s">Enxofre (S)</option>
                    <option value="k_t">Relação K/CTC %</option>
                    <option value="al">Alumínio (Al 3+)</option>
                    <option value="argila">Argila (%)</option>
                  </select>
                </div>
              )}

              <div className="text-[9px] bg-indigo-50 border border-indigo-100 rounded px-2 py-1 text-center font-mono font-bold text-indigo-700 hidden sm:block">
                Visualização por Talhão & Projeto Selecionado
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-[10px] uppercase rounded-md transition-all cursor-pointer border ${
                  isFullscreen
                    ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-sm'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs'
                }`}
                title={isFullscreen ? "Sair da Tela Cheia (ESC)" : "Abrir Mapa em Tela Cheia"}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Sair da Tela Cheia</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Tela Cheia</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className={`relative w-full bg-slate-50 ${isFullscreen ? 'flex-1 h-full' : 'h-[360px]'}`}>
            <div ref={mapContainerRef} className="w-full h-full" id="plots-unified-property-map" />
            
            {/* Floating Variables & Layer Toolbar on Map */}
            <div className={`absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-1.5 max-w-[calc(100%-150px)] ${
              isFullscreen 
                ? 'bg-slate-900/90 text-white border-slate-700/80 p-2 rounded-xl shadow-2xl backdrop-blur-md' 
                : 'bg-white/95 text-slate-800 border-slate-200/90 p-1.5 rounded-xl shadow-md backdrop-blur-xs'
            } border transition-all`}>
              
              {/* Soil Layer Depth buttons */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                {soilLayers.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setActiveLayer(l)}
                    className={`px-2 py-0.5 text-[9px] font-extrabold rounded transition-all cursor-pointer select-none ${
                      activeLayer === l
                        ? 'bg-emerald-500 text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-250 dark:bg-slate-700 mx-0.5 hidden sm:block" />

              <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-400 hidden sm:inline">
                Variável:
              </span>

              {/* Quick Pills for requested variables */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 max-w-full">
                {[
                  { id: 'v_percent', label: 'V%' },
                  { id: 's', label: 'Enxofre (S)' },
                  { id: 'p_meh', label: 'P (Meh)' },
                  { id: 'k_t', label: 'K/CTC %' },
                  { id: 'ph_cacl2', label: 'pH' },
                  { id: 'mo', label: 'M.O.' },
                  { id: 'k', label: 'K⁺' },
                  { id: 'ca', label: 'Ca²⁺' },
                  { id: 'mg', label: 'Mg²⁺' },
                  { id: 'argila', label: 'Argila' },
                ].map(item => {
                  const isSelected = mapVariable === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMapVariable(item.id as keyof SoilLabResults)}
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs font-black ring-1 ring-indigo-400'
                          : isFullscreen
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}

                <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

                {/* Recommendation Dose Pills */}
                <span className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 shrink-0 hidden sm:inline">
                  Doses:
                </span>

                {[
                  { id: 'rec_calcario', label: 'Calcário', unit: 't/ha' },
                  { id: 'rec_gesso', label: 'Gesso', unit: 't/ha' },
                  { id: 'rec_kcl', label: 'KCl', unit: 'kg/ha' },
                  { id: 'rec_map', label: 'MAP', unit: 'kg/ha' },
                  { id: 'rec_formulado', label: 'Formulado', unit: 'kg/ha' },
                ].map(item => {
                  const isSelected = mapVariable === item.id;
                  const avgData = plotProjectAverages[selectedPlotId]?.averages;
                  const val = avgData ? avgData[item.id] : NaN;
                  const numVal = typeof val === 'number' ? val : (val && !isNaN(parseFloat(String(val))) ? parseFloat(String(val)) : NaN);
                  const formattedVal = !isNaN(numVal) 
                    ? (item.unit === 't/ha' ? `${numVal.toFixed(1)}t` : `${Math.round(numVal)}kg`)
                    : null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMapVariable(item.id as keyof SoilLabResults)}
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                        isSelected
                          ? 'bg-amber-600 text-white shadow-xs font-black ring-1 ring-amber-400'
                          : isFullscreen
                            ? 'bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/60'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/90'
                      }`}
                      title={`Visualizar dose de ${item.label}`}
                    >
                      <span>{item.label}</span>
                      {formattedVal && (
                        <span className={`text-[8px] px-1 py-0.1 rounded font-mono font-black ${
                          isSelected ? 'bg-amber-800 text-amber-100' : 'bg-amber-200/80 text-amber-950'
                        }`}>
                          {formattedVal}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Dropdown with groups */}
                <select
                  value={mapVariable}
                  onChange={(e) => setMapVariable(e.target.value as keyof SoilLabResults)}
                  className={`text-[10px] font-extrabold border rounded-md px-1.5 py-0.5 cursor-pointer focus:outline-hidden shrink-0 ${
                    isFullscreen
                      ? 'bg-slate-800 text-emerald-400 border-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <optgroup label="🌱 Variáveis do Solo">
                    <option value="v_percent">V% (Saturação Bases)</option>
                    <option value="s">Enxofre (S)</option>
                    <option value="p_meh">Fósforo (P Mehlich)</option>
                    <option value="p_res">Fósforo (P Resina)</option>
                    <option value="k_t">Relação K/CTC % (K/T)</option>
                    <option value="pH">pH (H₂O)</option>
                    <option value="ph_cacl2">pH (CaCl₂)</option>
                    <option value="mo">M.O. (Matéria Orgânica)</option>
                    <option value="k">Potássio (K⁺)</option>
                    <option value="ca">Cálcio (Ca²⁺)</option>
                    <option value="mg">Magnésio (Mg²⁺)</option>
                    <option value="al">Alumínio (Al³⁺)</option>
                    <option value="ctc_t">CTC (T)</option>
                    <option value="sb">Soma de Bases (SB)</option>
                    <option value="argila">Teor de Argila (%)</option>
                    <option value="silte">Silte (%)</option>
                    <option value="areia_total">Areia Total (%)</option>
                    <option value="b">Boro (B)</option>
                    <option value="cu">Cobre (Cu)</option>
                    <option value="fe">Ferro (Fe)</option>
                    <option value="mn">Manganês (Mn)</option>
                    <option value="zn">Zinco (Zn)</option>
                  </optgroup>
                  <optgroup label="🌾 Doses de Recomendação">
                    <option value="rec_calcario">Rec. Calcário (t/ha)</option>
                    <option value="rec_gesso">Rec. Gesso Agrícola (t/ha)</option>
                    <option value="rec_kcl">Rec. KCl - Cloreto de Potássio (kg/ha)</option>
                    <option value="rec_map">Rec. MAP - Fosfato (kg/ha)</option>
                    <option value="rec_formulado">Rec. Formulado 12-15-15 (kg/ha)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Floating button on top right of map */}
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="bg-white/95 hover:bg-white text-slate-800 font-bold text-[10px] uppercase px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-md backdrop-blur-xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
                title={isFullscreen ? "Sair da Tela Cheia (ESC)" : "Abrir Mapa em Tela Cheia"}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-rose-600" />
                    <span className="font-semibold text-rose-700">Sair da Tela Cheia</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="font-semibold text-indigo-900">Tela Cheia</span>
                  </>
                )}
              </button>
            </div>

            {/* Color mapping legend overlay */}
            <div className="absolute bottom-3 left-3 bg-white/95 rounded-lg border border-slate-200 p-2.5 z-1000 shadow-sm max-w-[190px] space-y-1.5 text-[10px]">
              <span className="font-extrabold text-slate-800 block text-[9px] uppercase tracking-wide">
                {String(mapVariable).startsWith('rec_') ? 'Dose Recomendada' : 'Teores'} ({FERTILITY_THRESHOLDS[mapVariable]?.unit || 'Adimensional'})
              </span>
              <div className="space-y-1">
                {String(mapVariable).startsWith('rec_') ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#10b981] border border-white block shrink-0" />
                      <span>Sem necessidade (0)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#3b82f6] border border-white block shrink-0" />
                      <span>Dose Leve</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#f59e0b] border border-white block shrink-0" />
                      <span>Dose Moderada</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#d97706] border border-white block shrink-0" />
                      <span>Dose Elevada</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#ef4444] border border-white block shrink-0" />
                      <span>Baixo Teor / Crítico</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#f59e0b] border border-white block shrink-0" />
                      <span>Teor Médio / Alvo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[#10b981] border border-white block shrink-0" />
                      <span>Excelente / Pleno</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-1.5 pt-0.5 border-t border-slate-100">
                  <span className="w-3 h-3 rounded bg-[#64748b] border border-white block shrink-0" />
                  <span>Sem amostragem</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DETAILED RESULTS DASHBOARD FOR CHOSEN PLOT */}
        {activePlot ? (
          <div className="bg-white rounded-xl border border-slate-150 p-5 space-y-5 shadow-xs text-left" id="selected-plot-agronomic-dashboard">
            
            {/* Dashboard Sub-Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                  <h4 className="text-sm font-extrabold text-slate-800 uppercase block tracking-tight">
                    Análise Físico-Química Média: {activePlot.name}
                  </h4>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold uppercase shrink-0 ${
                    (visiblePlotIds[`${activePlot.id}_${getPlotProject(activePlot.id)}`] !== undefined 
                      ? visiblePlotIds[`${activePlot.id}_${getPlotProject(activePlot.id)}`] 
                      : (visiblePlotIds[activePlot.id] !== false))
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {(visiblePlotIds[`${activePlot.id}_${getPlotProject(activePlot.id)}`] !== undefined 
                      ? visiblePlotIds[`${activePlot.id}_${getPlotProject(activePlot.id)}`] 
                      : (visiblePlotIds[activePlot.id] !== false))
                      ? '● Visível no Mapa' : '○ Oculto no Mapa'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Consolidação métrica de todas as coletas ({getPlotProject(activePlot.id)}) • Profundidade: <strong className="text-slate-600 font-bold">{activeLayer}</strong>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab('lab_results')}
                  className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 rounded border border-slate-200 cursor-pointer whitespace-nowrap transition-all"
                >
                  Ir p/ Tabela de Entrada
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('ai_panel')}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[10px] font-bold text-indigo-700 rounded border border-indigo-200 cursor-pointer whitespace-nowrap transition-all"
                >
                  Ver Diagnóstico Recomendado
                </button>
              </div>
            </div>

            {/* If averages contain invalid/all NaN results (no data has been collected or uploaded) */}
            {selectedPlotAverages && Object.keys(selectedPlotAverages).length > 0 && 
             Object.values(selectedPlotAverages).slice(0, 20).every(v => typeof v === 'number' && isNaN(v)) ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl space-y-2 border border-slate-150">
                <Database className="w-8 h-8 text-slate-400 mx-auto" />
                <h5 className="text-xs font-bold text-slate-700 uppercase leading-none">Sem dados de laboratório nesta data</h5>
                <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
                  Ainda não constam furos com análise de solo cadastradas para o projeto <strong className="text-slate-700 font-semibold">{getPlotProject(activePlot.id)}</strong> do talhão selecionado. Para alimentar os teores, utilize as tabelas de dados.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* 1. PHYSICAL ATTRIBUTES & TEXTURE */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Atributos Físicos e Granulometria (Textura do Solo)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Clay */}
                    {renderVariableStat('argila', 'fisica')}
                    {/* Silte */}
                    {renderVariableStat('silte', 'fisica')}
                    {/* Total Sand */}
                    {renderVariableStat('areia_total', 'fisica')}

                    {/* Classification details */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between space-y-2.5">
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 block tracking-tight uppercase leading-none font-bold">
                          Classificação Textural
                        </span>
                        <span className="text-xs font-extrabold text-indigo-700 block mt-1 uppercase font-heading">
                          {selectedPlotAverages?.clas_textura || 'Não Cadastrado'}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium">
                        Tipo de Solo: <strong className="text-slate-700 font-bold">{selectedPlotAverages?.tipo_solo || 'AD 4'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. ACIDITY, pH & CATION EXCHANGE COMPLEX */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Variáveis de Acidez, pH e Complexo de Troca de Cátions (CTC)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                    {renderVariableStat('ph_cacl2', 'quimica_base')}
                    {renderVariableStat('ph_h2o', 'quimica_base')}
                    {renderVariableStat('v_percent', 'quimica_base')}
                    {renderVariableStat('ctc_t', 'quimica_base')}
                    {renderVariableStat('sb', 'quimica_base')}
                    {renderVariableStat('al', 'quimica_base')}
                    {renderVariableStat('k_t', 'quimica_base')}
                  </div>
                </div>

                {/* 3. NUTRITIONAL MACRONUTRIENTS */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Teores Médios de Matéria Orgânica e Macronutrientes
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                    {renderVariableStat('mo', 'quimica_macronutrientes')}
                    {renderVariableStat('p_res', 'quimica_macronutrientes')}
                    {renderVariableStat('p_meh', 'quimica_macronutrientes')}
                    {renderVariableStat('k', 'quimica_macronutrientes')}
                    {renderVariableStat('ca', 'quimica_macronutrientes')}
                    {renderVariableStat('mg', 'quimica_macronutrientes')}
                    {renderVariableStat('s', 'quimica_macronutrientes')}
                  </div>
                </div>

                {/* 4. MICRONUTRIENTS & INTERRELATIONSHIPS */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Micronutrientes Auxiliares do Solo (Teores Médios)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {renderVariableStat('b', 'quimica_micro')}
                    {renderVariableStat('cu', 'quimica_micro')}
                    {renderVariableStat('fe', 'quimica_micro')}
                    {renderVariableStat('mn', 'quimica_micro')}
                    {renderVariableStat('zn', 'quimica_micro')}
                  </div>
                </div>

                {/* 5. CATION RATIOS (Visual Equilibrium table) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                  <div className="text-left">
                    <span className="text-[10px] font-extrabold text-slate-600 uppercase block tracking-wider leading-none">
                      Equilíbrio das Saturações e Relações de Cátions na CTC
                    </span>
                    <p className="text-[9px] text-slate-400 leading-none mt-1">
                      Medidores de dispersão e saturação relativa recomendados pela literatura para as relações nutricionais
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-[11px]">
                    <div className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center shadow-2xs">
                      <div>
                        <strong className="text-slate-400 font-mono text-[9px] block">Relação Ca/Mg</strong>
                        <strong className="text-slate-800 text-xs font-mono font-extrabold block mt-0.5">
                          {selectedPlotAverages?.ca_mg ? Number(selectedPlotAverages.ca_mg).toFixed(2) : 'N/D'}
                        </strong>
                      </div>
                      <span className="bg-slate-100 text-[9px] text-slate-500 px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap">
                        Alvo: 3.0 / 4.0
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center shadow-2xs">
                      <div>
                        <strong className="text-slate-400 font-mono text-[9px] block">Cálcio na CTC (Ca/T %)</strong>
                        <strong className="text-slate-800 text-xs font-mono font-extrabold block mt-0.5">
                          {selectedPlotAverages?.ca_t ? `${Number(selectedPlotAverages.ca_t).toFixed(1)}%` : 'N/D'}
                        </strong>
                      </div>
                      <span className="bg-slate-100 text-[9px] text-slate-500 px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap">
                        Alvo: 50% - 65%
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center shadow-2xs">
                      <div>
                        <strong className="text-slate-400 font-mono text-[9px] block">Magnésio na CTC (Mg/T %)</strong>
                        <strong className="text-slate-800 text-xs font-mono font-extrabold block mt-0.5">
                          {selectedPlotAverages?.mg_t ? `${Number(selectedPlotAverages.mg_t).toFixed(1)}%` : 'N/D'}
                        </strong>
                      </div>
                      <span className="bg-slate-100 text-[9px] text-slate-500 px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap">
                        Alvo: 10% - 20%
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center shadow-2xs">
                      <div>
                        <strong className="text-slate-400 font-mono text-[9px] block">Relação K/CTC % (K/T)</strong>
                        <strong className="text-slate-800 text-xs font-mono font-extrabold block mt-0.5">
                          {selectedPlotAverages?.k_t ? `${Number(selectedPlotAverages.k_t).toFixed(1)}%` : 'N/D'}
                        </strong>
                      </div>
                      <span className="bg-slate-100 text-[9px] text-slate-500 px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap">
                        Alvo: 2% - 6%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. AGRONOMIC RECOMMENDATION DOSES SUMMARY */}
                <div className="p-4 bg-amber-50/60 border border-amber-200/90 rounded-xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                    <div>
                      <span className="text-[10px] font-black text-amber-950 uppercase block tracking-wider leading-none flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        Recomendação de Fertilizantes e Corretivos (Diagnóstico Agronômico)
                      </span>
                      <p className="text-[9px] text-amber-800/80 leading-none mt-1">
                        Doses médias por hectare consolidadas para o talhão ({activePlot.cropType || 'Soja'})
                      </p>
                    </div>
                    <span className="text-[9px] bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded font-extrabold uppercase whitespace-nowrap self-start sm:self-auto">
                      Camada {activeLayer}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
                    {[
                      { key: 'rec_calcario', label: 'Calcário Total', unit: 't/ha', target: 'Calagem (NC)', icon: '🪨' },
                      { key: 'rec_gesso', label: 'Gesso Agrícola', unit: 't/ha', target: 'Gessagem (NG)', icon: '🌾' },
                      { key: 'rec_kcl', label: 'Cloreto de Potássio', unit: 'kg/ha', target: 'Fertilização K', icon: '⚡' },
                      { key: 'rec_map', label: 'Fosfato (MAP)', unit: 'kg/ha', target: 'Fertilização P', icon: '🌱' },
                      { key: 'rec_formulado', label: 'Formulado 12-15-15', unit: 'kg/ha', target: 'Adubação NPK', icon: '📦' },
                    ].map(item => {
                      const val = selectedPlotAverages ? selectedPlotAverages[item.key] : NaN;
                      const numVal = typeof val === 'number' ? val : (val && !isNaN(parseFloat(String(val))) ? parseFloat(String(val)) : NaN);
                      const formatted = !isNaN(numVal) 
                        ? (item.unit === 't/ha' ? `${numVal.toFixed(1)} t/ha` : `${Math.round(numVal)} kg/ha`)
                        : '0.0 ' + item.unit;

                      const isCurrentMapVar = mapVariable === item.key;

                      return (
                        <div 
                          key={item.key}
                          onClick={() => setMapVariable(item.key as keyof SoilLabResults)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer shadow-2xs flex flex-col justify-between ${
                            isCurrentMapVar
                              ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400'
                              : 'bg-white border-amber-200/80 hover:border-amber-300 hover:bg-amber-50/50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{item.icon}</span>
                              <span className="text-[8px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-extrabold uppercase">
                                {item.target}
                              </span>
                            </div>
                            <strong className="text-slate-700 text-[10px] font-bold block mt-1.5 leading-snug">
                              {item.label}
                            </strong>
                          </div>
                          <div className="mt-2.5 pt-1.5 border-t border-dashed border-amber-200/80 flex items-center justify-between">
                            <strong className="text-amber-950 text-xs sm:text-sm font-mono font-black">
                              {formatted}
                            </strong>
                            <span className="text-[8px] text-amber-700 font-bold underline">
                              {isCurrentMapVar ? 'Ativo' : 'Ver no mapa'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

          </div>
        ) : (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-405 shadow-xs">
            Selecione um talhão para visuliazar a ficha físico-química consolidada.
          </div>
        )}

      </div>

    </div>
  );
}
