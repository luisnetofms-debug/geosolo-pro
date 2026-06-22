import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Farm, Plot, SamplingPoint, PlotPeriod, SoilLabResults, FERTILITY_THRESHOLDS } from '../types';
import L from 'leaflet';
import { 
  Building2, Layers, CheckSquare, Settings, Compass, 
  ChevronRight, Calendar, AlertCircle, Info, Database,
  TrendingUp, Activity, Sparkles, Filter, Droplet, Eye, EyeOff
} from 'lucide-react';

interface PropertyMapProps {
  farm: Farm | null;
  plots: Plot[];
  plotPeriods: PlotPeriod[];
  samplingPoints: SamplingPoint[];
  soilLayers: string[];
  activeSoilLayer: string;
  onSelectPlot: (plotId: string) => void;
  onSelectTab: (tab: 'clients' | 'field_station' | 'lab_results' | 'ai_panel' | 'fertility_maps' | 'property_map') => void;
  activePlotId?: string;
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
  activePlotId: globalActivePlotId
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

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [lastSavedDate, setLastSavedDate] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);

  // Filter plots belonging to this farm
  const farmPlots = useMemo(() => {
    if (!farm) return [];
    return plots.filter(p => p.farmId === farm.id);
  }, [plots, farm]);

  // Load saved configurations on mount / farm change
  useEffect(() => {
    if (!farm) return;
    try {
      const savedConfigStr = localStorage.getItem(`geosolo_property_map_config_${farm.id}`);
      if (savedConfigStr) {
        const config = JSON.parse(savedConfigStr);
        if (config) {
          if (config.plotSelectedProjects) {
            setPlotSelectedProjects(config.plotSelectedProjects);
          }
          if (config.visiblePlotIds) {
            setVisiblePlotIds(config.visiblePlotIds);
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
        }
      } else {
        setLastSavedDate(null);
      }
    } catch (err) {
      console.error('Failed to load saved property map configuration:', err);
      setLastSavedDate(null);
    }
  }, [farm]);

  // Set initial selected plot once farm plots load
  useEffect(() => {
    if (farmPlots.length > 0) {
      // Check if we loaded a saved plot from localStorage first
      let loadSavedId = '';
      if (farm) {
        try {
          const savedConfigStr = localStorage.getItem(`geosolo_property_map_config_${farm.id}`);
          if (savedConfigStr) {
            const config = JSON.parse(savedConfigStr);
            if (config && config.selectedPlotId && farmPlots.some(p => p.id === config.selectedPlotId)) {
              loadSavedId = config.selectedPlotId;
            }
          }
        } catch (_) {}
      }

      if (loadSavedId) {
        setSelectedPlotId(loadSavedId);
      } else if (globalActivePlotId && farmPlots.some(p => p.id === globalActivePlotId)) {
        setSelectedPlotId(globalActivePlotId);
      } else if (!selectedPlotId || !farmPlots.some(p => p.id === selectedPlotId)) {
        setSelectedPlotId(farmPlots[0].id);
      }
    }
  }, [farmPlots, globalActivePlotId, farm]);

  // Initialize visibility state for plots
  useEffect(() => {
    if (farmPlots.length > 0) {
      setVisiblePlotIds(prev => {
        const next = { ...prev };
        let updated = false;
        farmPlots.forEach(plot => {
          if (next[plot.id] === undefined) {
            next[plot.id] = true;
            updated = true;
          }
        });
        return updated ? next : prev;
      });
    }
  }, [farmPlots]);

  const handleSaveDisplayConfig = () => {
    if (!farm) return;
    try {
      const config = {
        plotSelectedProjects,
        visiblePlotIds,
        activeLayer,
        mapVariable,
        selectedPlotId,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(`geosolo_property_map_config_${farm.id}`, JSON.stringify(config));
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

  // Initialize selected project defaults for each plot
  useEffect(() => {
    const initialProjects: Record<string, string> = { ...plotSelectedProjects };
    let updated = false;
    
    farmPlots.forEach(plot => {
      if (!initialProjects[plot.id]) {
        const available = plotAvailablePeriods[plot.id] || [];
        // Default to latest period, or '05/2026'
        initialProjects[plot.id] = available.includes('05/2026') ? '05/2026' : (available[0] || '05/2026');
        updated = true;
      }
    });
    
    if (updated) {
      setPlotSelectedProjects(initialProjects);
    }
  }, [farmPlots, plotAvailablePeriods]);

  const activePlot = useMemo(() => {
    return farmPlots.find(p => p.id === selectedPlotId) || null;
  }, [farmPlots, selectedPlotId]);

  // Calculate sampling points for each plot based on its chosen project
  const plotProjectAverages = useMemo(() => {
    const averagesMap: Record<string, { averages: Record<string, number | string>; count: number }> = {};
    
    farmPlots.forEach(plot => {
      const selectedProj = plotSelectedProjects[plot.id] || '05/2026';
      
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
        if (activeLayer === '0-20cm') {
          resultsToUse = p.results;
        } else if (p.subsamples) {
          const sub = p.subsamples.find(s => s.depth === activeLayer);
          resultsToUse = sub?.results;
        }

        if (resultsToUse) {
          resultsList.push(resultsToUse);
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
  }, [farmPlots, plotSelectedProjects, samplingPoints, activeLayer]);

  // Fingerprint representing the set of active/visible plot IDs
  const visiblePlotsKey = useMemo(() => {
    return farmPlots
      .filter(p => visiblePlotIds[p.id] !== false)
      .map(p => p.id)
      .join(',');
  }, [farmPlots, visiblePlotIds]);

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

    const visiblePlots = farmPlots.filter(p => visiblePlotIds[p.id] !== false && p.boundaryPoints && p.boundaryPoints.length >= 3);
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
      // Respect visible toggle
      const isPlotVisible = visiblePlotIds[plot.id] !== false;
      if (!isPlotVisible) return;

      if (!plot.boundaryPoints || !Array.isArray(plot.boundaryPoints) || plot.boundaryPoints.length < 3) return;

      const polygonPoints = plot.boundaryPoints.map(bp => [bp.lat, bp.lng] as [number, number]);
      const avgData = plotProjectAverages[plot.id]?.averages;
      const numVal = avgData ? (avgData[mapVariable] as number) : NaN;

      // Color coding logic based on threshold
      let fillColor = '#64748b'; // Slate for missing
      const thresholds = FERTILITY_THRESHOLDS[mapVariable];

      if (!isNaN(numVal) && thresholds) {
        if (mapVariable === 'Al' || mapVariable === 'al') {
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
        // Cohesively align the global App.tsx selected plot too!
        onSelectPlot(plot.id);
      });

      const variableLabel = thresholds?.name || String(mapVariable).toUpperCase();
      const unit = thresholds?.unit || '';
      const displayVal = isNaN(numVal) ? 'Sem análise' : `${numVal.toFixed(2)} ${unit}`;
      const chosenProj = plotSelectedProjects[plot.id] || '05/2026';

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
  }, [farmPlots, selectedPlotId, plotProjectAverages, mapVariable, plotSelectedProjects, visiblePlotIds]);

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
              const isPlotVisible = visiblePlotIds[plot.id] !== false;
              const plotProj = plotSelectedProjects[plot.id] || '05/2026';
              const avg = plotProjectAverages[plot.id];
              const samplingCount = avg?.count || 0;

              return (
                <div 
                  key={plot.id}
                  onClick={() => {
                    setSelectedPlotId(plot.id);
                    onSelectPlot(plot.id);
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
                          setVisiblePlotIds(prev => ({
                            ...prev,
                            [plot.id]: prev[plot.id] === undefined ? false : !prev[plot.id]
                          }));
                        }}
                        className={`px-2 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1 text-[8px] font-black uppercase ${
                          isPlotVisible
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-450 border-slate-200 hover:bg-slate-150'
                        }`}
                        title={isPlotVisible ? "Ocultar talhão no mapa" : "Mostrar talhão no mapa"}
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
                          setPlotSelectedProjects(prev => ({ ...prev, [plot.id]: e.target.value }));
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
        <div className="bg-white rounded-xl border border-slate-150 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase leading-none">
                Mapeamento das Quadras • Limites do Imóvel
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                Roteiro geoespacial e fertilidade visual ativa para {activeLayer}
              </p>
            </div>
            
            <div className="text-[9px] bg-indigo-50 border border-indigo-100 rounded px-2 py-1 text-center font-mono font-bold text-indigo-700">
              Visualização por Talhão & Proyecto Selecionado
            </div>
          </div>

          <div className="relative h-[360px] w-full bg-slate-50">
            <div ref={mapContainerRef} className="w-full h-full" id="plots-unified-property-map" />
            
            {/* Color mapping legend overlay */}
            <div className="absolute bottom-3 left-3 bg-white/95 rounded-lg border border-slate-200 p-2.5 z-1000 shadow-sm max-w-[170px] space-y-1.5 text-[10px]">
              <span className="font-extrabold text-slate-800 block text-[9px] uppercase tracking-wide">
                Teores ({FERTILITY_THRESHOLDS[mapVariable]?.unit || 'Adimensional'})
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#ef4444] border border-white block" />
                  <span>Baixo Teor / Crítico</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#f59e0b] border border-white block" />
                  <span>Teor Médio / Alvo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#10b981] border border-white block" />
                  <span>Excelente / Pleno</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#64748b] border border-white block" />
                  <span>Sem amostragem cadastrada</span>
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
                    visiblePlotIds[activePlot.id] !== false
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {visiblePlotIds[activePlot.id] !== false ? '● Visível no Mapa' : '○ Oculto no Mapa'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Consolidação métrica de todas as coletas ({plotSelectedProjects[activePlot.id] || '05/2026'}) • Profundidade: <strong className="text-slate-600 font-bold">{activeLayer}</strong>
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
                  Ainda não constam furos com análise de solo cadastradas para o projeto <strong className="text-slate-700 font-semibold">{plotSelectedProjects[activePlot.id] || '05/2026'}</strong> do talhão selecionado. Para alimentar os teores, utilize as tabelas de dados.
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

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {renderVariableStat('ph_cacl2', 'quimica_base')}
                    {renderVariableStat('ph_h2o', 'quimica_base')}
                    {renderVariableStat('v_percent', 'quimica_base')}
                    {renderVariableStat('ctc_t', 'quimica_base')}
                    {renderVariableStat('sb', 'quimica_base')}
                    {renderVariableStat('al', 'quimica_base')}
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

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {renderVariableStat('mo', 'quimica_macronutrientes')}
                    {renderVariableStat('p_res', 'quimica_macronutrientes')}
                    {renderVariableStat('p_meh', 'quimica_macronutrientes')}
                    {renderVariableStat('k', 'quimica_macronutrientes')}
                    {renderVariableStat('ca', 'quimica_macronutrientes')}
                    {renderVariableStat('mg', 'quimica_macronutrientes')}
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
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
