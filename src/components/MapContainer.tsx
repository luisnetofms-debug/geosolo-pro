import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Plot, SamplingPoint, SoilLabResults, FERTILITY_THRESHOLDS } from '../types';
import { generateInterpolationGrid, InterpolationPoint, getFertilityColor, latLngToMeters, metersToLatLng, calculatePolygonArea } from '../utils/kriging';
import { 
  MapPin, HelpCircle, Compass, Wifi, WifiOff, Layers, 
  Settings, Play, Square, Ban, CheckCircle, Navigation, Plus, Save, Upload
} from 'lucide-react';

interface MapContainerProps {
  plot: Plot;
  points: SamplingPoint[];
  onUpdatePoints: (updatedPoints: SamplingPoint[]) => void;
  onUpdatePlot: (updatedPlot: Plot) => void;
  offlineMode: boolean;
  setOfflineMode: (offline: boolean) => void;
  activeSoilLayer: string;
  setActiveSoilLayer: (layer: string) => void;
  soilLayers: string[];
  setSoilLayers: (layers: string[]) => void;
  activeMonthYear?: string;
  fieldReady?: boolean;
  setFieldReady?: (ready: boolean) => void;
}

export default function MapContainer({
  plot,
  points,
  onUpdatePoints,
  onUpdatePlot,
  offlineMode,
  setOfflineMode,
  activeSoilLayer,
  setActiveSoilLayer,
  soilLayers,
  setSoilLayers,
  activeMonthYear,
  fieldReady = false,
  setFieldReady,
}: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  
  // Layer groups to clear on redraw
  const boundaryGroupRef = useRef<L.FeatureGroup | null>(null);
  const pointsGroupRef = useRef<L.FeatureGroup | null>(null);
  const interpolationLayerRef = useRef<L.ImageOverlay | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // States
  const [activeTab, setActiveTab] = useState<'coleta' | 'interpolacao'>('coleta');
  const [activeVariable, setActiveVariable] = useState<keyof SoilLabResults>('pH');
  const [interpolationOpacity, setInterpolationOpacity] = useState<number>(0.75);
  const [gridSpacing, setGridSpacing] = useState<number>(120); // Spacing in meters for automated grids

  // Real-time GPS tracker simulation states
  const [simulatedGPS, setSimulatedGPS] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingActive, setTrackingActive] = useState<boolean>(false);
  const gpsIntervalRef = useRef<any>(null);

  // Real-time Device GPS states
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [liveGeoTracking, setLiveGeoTracking] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);

  // Refs for tracking markers to prevent full component redraws
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsCircleRef = useRef<L.Circle | null>(null);

  // Custom Point Adding state
  const [manuallyClickToAdd, setManuallyClickToAdd] = useState<boolean>(false);

  // Show / Hide Sampling Grid state
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // KML Status Message states
  const [kmlError, setKmlError] = useState<string | null>(null);
  const [kmlSuccess, setKmlSuccess] = useState<string | null>(null);

  // Resilient, Client-Side KML Parser supporting Polygons and/or Waypoints
  const handleKmlImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setKmlError(null);
    setKmlSuccess(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("Não foi possível ler o conteúdo do arquivo.");

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Verify if parser returned an error
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
          throw new Error("Arquivo KML inválido ou corrompido.");
        }

        // Try to parse coordinate nodes in KML
        const coordinateNodes = xmlDoc.getElementsByTagName("coordinates");
        let foundBoundary = false;
        let foundPoints = false;
        let newBoundaryPoints: { lat: number; lng: number }[] = [];
        let newSamplingPoints: SamplingPoint[] = [];

        for (let i = 0; i < coordinateNodes.length; i++) {
          const node = coordinateNodes[i];
          const coordText = node.textContent || "";
          
          const parentNodeName = node.parentElement?.nodeName || "";
          const grandParentNodeName = node.parentElement?.parentElement?.nodeName || "";
          const isPoint = parentNodeName === "Point" || grandParentNodeName === "Point";

          // Use regex to remove spacing/tabs/newlines around commas, then split by any whitespace sequence
          const cleanCoordText = coordText.replace(/\s*,\s*/g, ',').replace(/[\r\n\t]+/g, ' ').trim();
          const coordPairs = cleanCoordText.split(/\s+/);
          
          const parsedCoords = coordPairs
            .map(pair => {
              if (!pair) return null;
              const parts = pair.split(',');
              if (parts.length >= 2) {
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                  return { lat, lng };
                }
              }
              return null;
            })
            .filter((item): item is { lat: number; lng: number } => item !== null);

          if (parsedCoords.length > 0) {
            // Check if this KML coordinates element represents sampling points or boundary polygon
            if (isPoint || parsedCoords.length === 1) {
              parsedCoords.forEach((pt, idx) => {
                const nr = newSamplingPoints.length + 1;
                newSamplingPoints.push({
                  id: `pt-kml-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
                  plotId: plot.id,
                  monthYear: activeMonthYear,
                  pointNumber: nr,
                  lat: pt.lat,
                  lng: pt.lng,
                  isCollected: false
                });
              });
              foundPoints = true;
            } else if (parsedCoords.length >= 3) {
              // Usually the last point of polygon in KML closes the loop to equal the first point.
              // To ensure we get the full boundary of the field, we select the longest polygons inside the file.
              if (parsedCoords.length > newBoundaryPoints.length) {
                newBoundaryPoints = parsedCoords;
                foundBoundary = true;
              }
            }
          }
        }

        // Fallback: search through Placemark tags
        if (!foundBoundary && !foundPoints) {
          const placemarks = xmlDoc.getElementsByTagName("Placemark");
          if (placemarks.length > 0) {
            for (let j = 0; j < placemarks.length; j++) {
              const pm = placemarks[j];
              const pTag = pm.getElementsByTagName("Point")?.[0];
              const polyTag = pm.getElementsByTagName("Polygon")?.[0];

              if (pTag) {
                const coordsTag = pTag.getElementsByTagName("coordinates")?.[0];
                if (coordsTag) {
                  const rawText = coordsTag.textContent || "";
                  const cleanFallback = rawText.replace(/\s*,\s*/g, ',').replace(/[\r\n\t]+/g, ' ').trim();
                  const parts = cleanFallback.split(/\s+/)[0]?.split(',');
                  if (parts && parts.length >= 2) {
                    const lng = parseFloat(parts[0]);
                    const lat = parseFloat(parts[1]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                      newSamplingPoints.push({
                        id: `pt-kml-pm-${Date.now()}-${j}`,
                        plotId: plot.id,
                        monthYear: activeMonthYear,
                        pointNumber: newSamplingPoints.length + 1,
                        lat,
                        lng,
                        isCollected: false
                      });
                      foundPoints = true;
                    }
                  }
                }
              } else if (polyTag) {
                const coordsTag = polyTag.getElementsByTagName("coordinates")?.[0];
                if (coordsTag) {
                  const rawText = coordsTag.textContent || "";
                  const cleanFallback = rawText.replace(/\s*,\s*/g, ',').replace(/[\r\n\t]+/g, ' ').trim();
                  const coordPairs = cleanFallback.split(/\s+/);
                  const parsed = coordPairs
                    ?.map(pair => {
                      if (!pair) return null;
                      const parts = pair.split(',');
                      if (parts.length >= 2) {
                        const lng = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lng)) {
                          return { lat, lng };
                        }
                      }
                      return null;
                    })
                    .filter((item): item is { lat: number; lng: number } => item !== null) || [];
                  
                  if (parsed.length >= 3) {
                    if (parsed.length > newBoundaryPoints.length) {
                      newBoundaryPoints = parsed;
                      foundBoundary = true;
                    }
                  }
                }
              }
            }
          }
        }

        if (!foundBoundary && !foundPoints) {
          throw new Error("Não encontramos nenhum polígono de limite ou marcas de furos amostrais neste arquivo KML.");
        }

        let reportMsg = "Importação KML concluída! ";

        if (foundBoundary && newBoundaryPoints.length >= 3) {
          // Calculate polygon area (Hectares) using physical map coordinates (Gauss/Shoelace theorem on plane projection)
          const actualAreaM2 = calculatePolygonArea(newBoundaryPoints);
          const estimatedHectares = Math.max(0.1, parseFloat((actualAreaM2 / 10000).toFixed(1)));

          onUpdatePlot({
            ...plot,
            boundaryPoints: newBoundaryPoints,
            areaHectares: estimatedHectares
          });

          // Set map center to newly imported boundaries
          if (mapInstanceRef.current) {
            const bounds = L.latLngBounds(newBoundaryPoints.map(p => L.latLng(p.lat, p.lng)));
            mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
          }

          reportMsg += `Limite do talhão atualizado (${newBoundaryPoints.length} vértices, ~${estimatedHectares} ha). `;
        }

        if (foundPoints && newSamplingPoints.length > 0) {
          onUpdatePoints(newSamplingPoints);
          reportMsg += `${newSamplingPoints.length} pontos de coleta gerados do mapa.`;

          // Center map on these markers if polygon was not set
          if (mapInstanceRef.current && !foundBoundary) {
            const bounds = L.latLngBounds(newSamplingPoints.map(p => L.latLng(p.lat, p.lng)));
            mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30] });
          }
        }

        setKmlSuccess(reportMsg);
      } catch (err: any) {
        setKmlError(err.message || "Ocorreu um erro desconhecido ao processar o seu KML.");
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (fieldReady) {
      setActiveTab('coleta');
    }
  }, [fieldReady]);

  // Manage Device Geolocation tracking
  const stopRealGeoTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLiveGeoTracking(false);
    setUserLocation(null);
  };

  const startRealGeoTracking = () => {
    if (!navigator.geolocation) {
      alert("Seu navegador ou dispositivo não suporta geolocalização.");
      return;
    }

    setLiveGeoTracking(true);
    
    // Stop simulated tracking if active to avoid conflicting markers
    if (trackingActive) {
      setTrackingActive(false);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude, accuracy });
        
        // Auto-center map if we lock on GPS
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 18);
        }
      },
      (err) => {
        console.error("Erro GPS:", err);
        let msg = "Não foi possível obter sua localização GPS.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "Permissão de GPS negada. Por favor, autorize o acesso à localização.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "Sinal de GPS indisponível no momento.";
        } else if (err.code === err.TIMEOUT) {
          msg = "Tempo limite para obter localização GPS esgotado.";
        }
        alert(msg);
        stopRealGeoTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
      }
    );
  };

  const toggleRealGeoTracking = () => {
    if (liveGeoTracking) {
      if (userLocation && mapInstanceRef.current) {
        mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 18);
      } else {
        stopRealGeoTracking();
      }
    } else {
      startRealGeoTracking();
    }
  };

  // Ensure precision GPS is stopped if component unmounts
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center map on Plot center
    const lats = plot.boundaryPoints.map(p => p.lat);
    const lngs = plot.boundaryPoints.map(p => p.lng);
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;

    // Destroy existing map if already instantiated
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      maxZoom: 18,
      minZoom: 12
    }).setView([centerLat, centerLng], 15);

    mapInstanceRef.current = map;

    // Feature Groups
    boundaryGroupRef.current = L.featureGroup().addTo(map);
    pointsGroupRef.current = L.featureGroup().addTo(map);

    // Event listener for placing manual points in "Zonas de Manejo"
    map.on('click', (e: L.LeafletMouseEvent) => {
      // Accessing a state in maps click event can be stale, so we look at an attribute or handle it gracefully
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [plot.id]);

  // Handle map click with latest state using a dynamic listener ref or similar
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (manuallyClickToAdd) {
        const nextNum = points.length > 0 ? Math.max(...points.map(p => p.pointNumber)) + 1 : 1;
        const newPoint: SamplingPoint = {
          id: `pt-${Date.now()}`,
          plotId: plot.id,
          monthYear: activeMonthYear,
          pointNumber: nextNum,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          isCollected: false
        };
        onUpdatePoints([...points, newPoint]);
        setManuallyClickToAdd(false);
      }
    };

    map.off('click');
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [manuallyClickToAdd, points, plot.id]);

  // 1.5 Base Tile Layer Manager (handles toggling between offline/online backgrounds without rebuilding the entire map or destroying other markers/overlays)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let newTileLayer: L.TileLayer;
    if (offlineMode) {
      newTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '💾 GPS LOCAL - MAPA COMPACTO OFFLINE (SIMULAÇÃO CACHE)',
        className: 'filter grayscale sepia contrast-125'
      });
    } else {
      newTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '🛰️ ArcGIS Esri Satélite Online'
      });
    }

    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [offlineMode, plot.id]);

  // 1.8 Real-time Position Marker & Accuracy Circle Handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Helper to clean up GPS layers
    const removeGPSLayers = () => {
      if (gpsMarkerRef.current) {
        map.removeLayer(gpsMarkerRef.current);
        gpsMarkerRef.current = null;
      }
      if (gpsCircleRef.current) {
        map.removeLayer(gpsCircleRef.current);
        gpsCircleRef.current = null;
      }
    };

    const activeGPS = simulatedGPS || userLocation;

    if (!activeGPS) {
      removeGPSLayers();
      return;
    }

    const { lat, lng } = activeGPS;
    const isSimulated = !!simulatedGPS;
    const colorClass = isSimulated ? 'emerald' : 'blue';
    const hexColor = isSimulated ? '#10b981' : '#3b82f6';

    const accuracy = !isSimulated && userLocation?.accuracy ? userLocation.accuracy : 15;

    // A. Update or create the circle representing accuracy
    if (!gpsCircleRef.current) {
      gpsCircleRef.current = L.circle([lat, lng], {
        radius: accuracy,
        color: hexColor,
        fillColor: hexColor,
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: isSimulated ? '4, 4' : undefined
      }).addTo(map);
    } else {
      gpsCircleRef.current.setLatLng([lat, lng]);
      gpsCircleRef.current.setRadius(accuracy);
      gpsCircleRef.current.setStyle({ color: hexColor, fillColor: hexColor });
    }

    // B. Update or create the pulsing GPS dot marker
    const gpsHtml = isSimulated 
      ? `
        <div class="relative flex items-center justify-center w-6 h-6">
          <div class="absolute w-5 h-5 rounded-full bg-emerald-500/40 animate-ping"></div>
          <div class="absolute w-4 h-4 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
        </div>
      `
      : `
        <div class="relative flex items-center justify-center w-6 h-6">
          <div class="absolute w-5 h-5 rounded-full bg-blue-500/40 animate-ping"></div>
          <div class="absolute w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
        </div>
      `;

    const gpsIcon = L.divIcon({
      className: 'gps-marker-leaflet-div',
      html: gpsHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.marker([lat, lng], {
        icon: gpsIcon,
        zIndexOffset: 1200
      }).addTo(map);
      
      // Initially pan to accuracy region
      map.setView([lat, lng], 17);
    } else {
      gpsMarkerRef.current.setLatLng([lat, lng]);
      gpsMarkerRef.current.setIcon(gpsIcon);
    }

    // Return cleanup to properly remove layers if component updates/unmounts
    return () => {
      // Avoid complete removal here on quick coordinates updates to prevent flickers,
      // but if the lat/lng becomes unset, the main rendering effect cleans it up
    };
  }, [simulatedGPS, userLocation]);

  // 2. Render Layers, Boundary & Markers Overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Draw boundary
    if (boundaryGroupRef.current) {
      boundaryGroupRef.current.clearLayers();
      const polygonPoints = plot.boundaryPoints.map(bp => [bp.lat, bp.lng] as [number, number]);
      const polygon = L.polygon(polygonPoints, {
        color: '#2563eb', // Blue border
        weight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        dashArray: '5, 5'
      });
      polygon.addTo(boundaryGroupRef.current);
    }

    // Draw Soil collection sampling nodes
    if (pointsGroupRef.current) {
      pointsGroupRef.current.clearLayers();

      if (showGrid) {
        points.forEach((p) => {
          const hasResults = !!p.results;
          // Determine pin colors
          const color = p.isCollected 
            ? (hasResults ? '#10b981' : '#3b82f6') // Collected (Green if lab results present, blue if just collected)
            : '#ef4444'; // Planned (Red)

          // Custom styled DivIcon using SVGs to avoid leaflet asset missing 404s
          const markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `
              <div class="flex flex-col items-center justify-center">
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg transition-transform hover:scale-115 active:scale-95 cursor-grab" style="background-color: ${color}; border: 2px solid white" title="Arraste para mover">
                  ${p.pointNumber}
                </div>
                <div class="w-1.5 h-1.5 rounded-full mt-0.5" style="background-color: ${color}"></div>
              </div>
            `,
            iconSize: [28, 35],
            iconAnchor: [14, 30]
          });

          // Add Marker with draggable option
          const marker = L.marker([p.lat, p.lng], { 
            icon: markerIcon,
            draggable: !fieldReady 
          }).addTo(pointsGroupRef.current!);

          // Handle point dragging/editing coordinates
          marker.on('dragend', (event) => {
            const target = event.target as L.Marker;
            const newLatLng = target.getLatLng();
            const updated = points.map((pSub) => {
              if (pSub.id === p.id) {
                return {
                  ...pSub,
                  lat: newLatLng.lat,
                  lng: newLatLng.lng,
                };
              }
              return pSub;
            });
            onUpdatePoints(updated);
          });

          // Popup controls supporting full inline editing and deletion
          const popupContent = document.createElement('div');
          popupContent.className = 'p-2 text-xs text-slate-800 space-y-2 min-w-[200px]';
          popupContent.innerHTML = `
            <div class="font-bold border-b border-slate-100 pb-1 mb-1 text-sm text-slate-900 flex justify-between items-center">
              <span>Amostra #${p.pointNumber}</span>
              <span class="text-[9px] font-normal text-slate-405 font-mono">ID: ${p.id.substring(0, 6)}</span>
            </div>
            
            <div id="view-mode-${p.id}" class="space-y-1.5">
              ${!fieldReady ? `
              <div class="text-[10px] text-slate-500 italic bg-slate-50 p-1 rounded font-sans">
                💡 Clique e segure no ponto para arrastar e alterar a localização.
              </div>
              ` : ''}
              <div><b>Coords:</b> ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
              <div><b>Status:</b> ${p.isCollected ? '✅ Coletado' : '❌ Pendente'}</div>
              ${p.results ? `
                <div class="bg-indigo-50 p-2 rounded text-indigo-800 font-semibold mt-1 space-y-0.5 border border-indigo-100">
                  <div><b>pH:</b> ${p.results.pH}</div>
                  <div><b>M.O:</b> ${p.results.MO}%</div>
                  <div><b>Fósforo P:</b> ${p.results.P} mg/dm³</div>
                  <div><b>Potássio K:</b> ${p.results.K} mmolc</div>
                </div>` : '<div class="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded font-medium">Nenhum resultado químico inserido</div>'}
              <div class="flex gap-1.5 pt-1.5 border-t border-slate-100 mt-2">
                <button id="toggle-collect-${p.id}" class="flex-1 px-1 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-650 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 rounded font-bold text-[10px] cursor-pointer text-center">
                  ${p.isCollected ? 'Desfazer' : 'Coletar'}
                </button>
                ${!fieldReady ? `
                <button id="toggle-edit-${p.id}" class="flex-1 px-1 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-650 hover:text-indigo-700 hover:border-indigo-250 border border-slate-200 rounded font-bold text-[10px] cursor-pointer text-center">
                  ✏️ Editar
                </button>
                <button id="delete-pt-${p.id}" class="px-2 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded text-[10px] cursor-pointer font-bold" title="Excluir">🗑️</button>
                ` : ''}
              </div>
            </div>

            <div id="edit-mode-${p.id}" class="hidden space-y-2 pt-1 border-t border-slate-100">
              <div class="font-bold text-slate-700 text-[10px] uppercase tracking-wide">Editar Amostra</div>
              
              <div>
                <label class="text-[9px] text-slate-500 font-bold block mb-0.5">Identificador (Número)</label>
                <input type="number" id="edit-nr-${p.id}" value="${p.pointNumber}" class="w-full px-2 py-1 border border-slate-250 rounded text-xs text-slate-800" />
              </div>

              <div class="grid grid-cols-2 gap-1.5">
                <div>
                  <label class="text-[9px] text-slate-500 font-semibold block mb-0.5">pH (H2O)</label>
                  <input type="number" step="0.1" id="edit-ph-${p.id}" value="${p.results?.pH || ''}" placeholder="pH" class="w-full px-2 py-1 border border-slate-250 rounded text-xs text-slate-800" />
                </div>
                <div>
                  <label class="text-[9px] text-slate-500 font-semibold block mb-0.5">M.O (%)</label>
                  <input type="number" step="0.1" id="edit-mo-${p.id}" value="${p.results?.MO || ''}" placeholder="M.O%" class="w-full px-2 py-1 border border-slate-250 rounded text-xs text-slate-800" />
                </div>
                <div>
                  <label class="text-[9px] text-slate-500 font-semibold block mb-0.5">P (Fósforo)</label>
                  <input type="number" step="0.1" id="edit-p-${p.id}" value="${p.results?.P || ''}" placeholder="P" class="w-full px-2 py-1 border border-slate-250 rounded text-xs text-slate-800" />
                </div>
                <div>
                  <label class="text-[9px] text-slate-500 font-semibold block mb-0.5">K (Potássio)</label>
                  <input type="number" step="0.1" id="edit-k-${p.id}" value="${p.results?.K || ''}" placeholder="K" class="w-full px-2 py-1 border border-slate-250 rounded text-xs text-slate-800" />
                </div>
              </div>

              <div class="flex gap-1 pt-1 border-t border-slate-100 mt-2">
                <button id="save-edit-${p.id}" class="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] cursor-pointer">Salvar</button>
                <button id="cancel-edit-${p.id}" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-200 rounded text-[10px] cursor-pointer">Cancelar</button>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent);

          marker.on('popupopen', () => {
            // Click to toggle collection status
            const btn = document.getElementById(`toggle-collect-${p.id}`);
            if (btn) {
              btn.onclick = () => {
                const updated = points.map((pSub) => {
                  if (pSub.id === p.id) {
                    const collected = !pSub.isCollected;
                    return {
                      ...pSub,
                      isCollected: collected,
                      collectionDate: collected ? new Date().toISOString().split('T')[0] : undefined,
                    };
                  }
                  return pSub;
                });
                onUpdatePoints(updated);
                map.closePopup();
              };
            }

            // Click to toggle EDIT form display
            const toggleEditBtn = document.getElementById(`toggle-edit-${p.id}`);
            if (toggleEditBtn) {
              toggleEditBtn.onclick = () => {
                const viewDiv = document.getElementById(`view-mode-${p.id}`);
                const editDiv = document.getElementById(`edit-mode-${p.id}`);
                if (viewDiv && editDiv) {
                  viewDiv.classList.add('hidden');
                  editDiv.classList.remove('hidden');
                }
              };
            }

            // Cancel edit
            const cancelEditBtn = document.getElementById(`cancel-edit-${p.id}`);
            if (cancelEditBtn) {
              cancelEditBtn.onclick = () => {
                const viewDiv = document.getElementById(`view-mode-${p.id}`);
                const editDiv = document.getElementById(`edit-mode-${p.id}`);
                if (viewDiv && editDiv) {
                  viewDiv.classList.remove('hidden');
                  editDiv.classList.add('hidden');
                }
              };
            }

            // Save edited features inside the popup
            const saveEditBtn = document.getElementById(`save-edit-${p.id}`);
            if (saveEditBtn) {
              saveEditBtn.onclick = () => {
                const numInput = document.getElementById(`edit-nr-${p.id}`) as HTMLInputElement;
                const phInput = document.getElementById(`edit-ph-${p.id}`) as HTMLInputElement;
                const moInput = document.getElementById(`edit-mo-${p.id}`) as HTMLInputElement;
                const pInput = document.getElementById(`edit-p-${p.id}`) as HTMLInputElement;
                const kInput = document.getElementById(`edit-k-${p.id}`) as HTMLInputElement;

                const nr = numInput ? parseInt(numInput.value) : p.pointNumber;
                const pH = phInput && phInput.value !== '' ? parseFloat(phInput.value) : undefined;
                const MO = moInput && moInput.value !== '' ? parseFloat(moInput.value) : undefined;
                const PVal = pInput && pInput.value !== '' ? parseFloat(pInput.value) : undefined;
                const KVal = kInput && kInput.value !== '' ? parseFloat(kInput.value) : undefined;

                const hasChemicals = pH !== undefined || MO !== undefined || PVal !== undefined || KVal !== undefined;

                const updated = points.map((pSub) => {
                  if (pSub.id === p.id) {
                    let results = pSub.results;
                    if (hasChemicals) {
                      results = {
                        pH: pH ?? pSub.results?.pH ?? 5.5,
                        MO: MO ?? pSub.results?.MO ?? 2.0,
                        P: PVal ?? pSub.results?.P ?? 10.0,
                        K: KVal ?? pSub.results?.K ?? 2.0,
                        Ca: pSub.results?.Ca ?? 25,
                        Mg: pSub.results?.Mg ?? 8,
                        Al: pSub.results?.Al ?? 1,
                      };
                    }
                    return {
                      ...pSub,
                      pointNumber: isNaN(nr) ? pSub.pointNumber : nr,
                      isCollected: hasChemicals || pSub.isCollected,
                      results: hasChemicals ? results : pSub.results
                    };
                  }
                  return pSub;
                });

                onUpdatePoints(updated);
                map.closePopup();
              };
            }

            // Delete point trigger from coordinates selection
            const delBtn = document.getElementById(`delete-pt-${p.id}`);
            if (delBtn) {
              delBtn.onclick = () => {
                onUpdatePoints(points.filter(pSub => pSub.id !== p.id));
                map.closePopup();
              };
            }
          });
        });
      }
    }

    // Clean tracking marker if active
    if (!trackingActive && gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
      setSimulatedGPS(null);
    }

  }, [plot.id, points, showGrid, fieldReady]);

  // 3. Render Kriging Interpolation Layer Over the Boundary
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing interpolation overlay first
    if (interpolationLayerRef.current) {
      map.removeLayer(interpolationLayerRef.current);
      interpolationLayerRef.current = null;
    }

    if (activeTab !== 'interpolacao') return;

    // Filter points overlay with results
    const pointsWithResults = points.filter(p => p.isCollected && p.results);
    if (pointsWithResults.length < 3) {
      return; // Need at least 3 points with lab results to compute kriging spatial interpolation
    }

    // Define center for local flat projection (meters)
    const lats = plot.boundaryPoints.map(p => p.lat);
    const lngs = plot.boundaryPoints.map(p => p.lng);
    const refLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const refLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;

    // Format to interpolation points in flat meters
    const interpPoints: InterpolationPoint[] = pointsWithResults.map(p => {
      const coords = latLngToMeters(p.lat, p.lng, refLat, refLng);
      return {
        x: coords.x,
        y: coords.y,
        value: p.results![activeVariable] || 0
      };
    });

    // Generate interpolated dense 90x90 matrix
    const gridRes = generateInterpolationGrid(interpPoints, 90, 90, 'exponential', 0.1, 1.0, 300);

    // Create an elegant in-memory canvas to draw the heatmap pixels
    const canvas = document.createElement('canvas');
    canvas.width = gridRes.cols;
    canvas.height = gridRes.rows;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Loop through each cell. Notice our rows coordinates go from yMin to yMax.
      // Canvas coordinates go from top-left. So we run r from rows-1 down to 0, or inverse.
      for (let r = 0; r < gridRes.rows; r++) {
        for (let c = 0; c < gridRes.cols; c++) {
          const val = gridRes.data[r][c];

          // Determine color with opacity built in
          const rawColor = getFertilityColor(val, activeVariable); // e.g. "rgba(239, 68, 68, 0.75)"
          
          ctx.fillStyle = rawColor;
          ctx.fillRect(c, gridRes.rows - 1 - r, 1, 1);
        }
      }
    }

    // Convert flat meter padding boundaries back to real geographical bounds GPS coordinates
    const geoSouthWest = metersToLatLng(gridRes.xMin, gridRes.yMin, refLat, refLng);
    const geoNorthEast = metersToLatLng(gridRes.xMax, gridRes.yMax, refLat, refLng);

    const imageBounds = L.latLngBounds(
      L.latLng(geoSouthWest.lat, geoSouthWest.lng),
      L.latLng(geoNorthEast.lat, geoNorthEast.lng)
    );

    // Create dynamic Leaflet overlay
    const dataUrl = canvas.toDataURL();
    const overlay = L.imageOverlay(dataUrl, imageBounds, {
      opacity: interpolationOpacity,
      interactive: false,
      alt: 'GeoSolo Fertility Kriging Layer'
    }).addTo(map);

    interpolationLayerRef.current = overlay;

  }, [points, activeTab, activeVariable, interpolationOpacity, plot.id]);

  // Toggle collection task live walk simulation
  const handleToggleTracking = () => {
    if (trackingActive) {
      setTrackingActive(false);
      return;
    }

    // Stop real-time GPS if it was active
    stopRealGeoTracking();

    setTrackingActive(true);
    // Find centers
    const lats = plot.boundaryPoints.map(p => p.lat);
    const lngs = plot.boundaryPoints.map(p => p.lng);
    const startLat = Math.min(...lats) + 0.001;
    const startLng = Math.min(...lngs) + 0.001;
    setSimulatedGPS({ lat: startLat, lng: startLng });

    let currentLat = startLat;
    let currentLng = startLng;
    let step = 0;

    // Simulate walker collecting nodes
    gpsIntervalRef.current = setInterval(() => {
      // Walk towards points sequentially to collect them!
      const uncollected = points.find(p => !p.isCollected);
      if (uncollected) {
        // Move 10% closer to the uncollected point
        const diffLat = uncollected.lat - currentLat;
        const diffLng = uncollected.lng - currentLng;
        currentLat += diffLat * 0.25;
        currentLng += diffLng * 0.25;
        setSimulatedGPS({ lat: currentLat, lng: currentLng });

        // If very close, auto-collect the node to give an outstanding UX!
        const dist = Math.hypot(uncollected.lat - currentLat, uncollected.lng - currentLng);
        if (dist < 0.0003) {
          const updated = points.map(item => {
            if (item.id === uncollected.id) {
              return {
                ...item,
                isCollected: true,
                collectionDate: new Date().toISOString().split('T')[0]
              };
            }
            return item;
          });
          onUpdatePoints(updated);
        }
      } else {
        // Loop back or end
        setTrackingActive(false);
        if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      }
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
      }
    };
  }, []);

  // Compute automated grid sampling (e.g. 2ha, 1ha square grids)
  const handleAutoGenerateSamplingGrid = () => {
    // We build a dense square grid of points inside the bounding box of the plot
    const lats = plot.boundaryPoints.map(p => p.lat);
    const lngs = plot.boundaryPoints.map(p => p.lng);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);

    const refLat = (latMin + latMax) / 2;
    const refLng = (lngMin + lngMax) / 2;

    const minMeters = latLngToMeters(latMin, lngMin, refLat, refLng);
    const maxMeters = latLngToMeters(latMax, lngMax, refLat, refLng);

    const spacing = gridSpacing; // meters (e.g. 100m spacing is 1ha grid size)
    const padding = 20; // keep points slightly inside boundary limits

    const generatedPoints: SamplingPoint[] = [];
    let count = 1;

    for (let x = minMeters.x + padding; x <= maxMeters.x - padding; x += spacing) {
      for (let y = minMeters.y + padding; y <= maxMeters.y - padding; y += spacing) {
        // Convert back to real GPS coords
        const realCoords = metersToLatLng(x, y, refLat, refLng);

        // Simple ray-casting or box test to make sure point falls inside boundary polygon
        const inside = isPointInPolygon(realCoords, plot.boundaryPoints);
        if (inside) {
          generatedPoints.push({
            id: `pt-gen-${count}-${Date.now()}`,
            plotId: plot.id,
            monthYear: activeMonthYear,
            pointNumber: count,
            lat: realCoords.lat,
            lng: realCoords.lng,
            isCollected: false
          });
          count++;
        }
      }
    }

    if (generatedPoints.length === 0) {
      // Fallback: If area is small, place a default 4-point template inside coordinates
      for (let i = 0; i < 4; i++) {
        const offsetLat = (latMax - latMin) * (i < 2 ? 0.3 : 0.7);
        const offsetLng = (lngMax - lngMin) * (i % 2 === 0 ? 0.3 : 0.7);
        generatedPoints.push({
          id: `pt-gen-fallback-${i}-${Date.now()}`,
          plotId: plot.id,
          monthYear: activeMonthYear,
          pointNumber: i + 1,
          lat: latMin + offsetLat,
          lng: lngMin + offsetLng,
          isCollected: false
        });
      }
    }

    onUpdatePoints(generatedPoints);
  };

  // Helper ray-casting algorithm to test polygon intersection
  function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
    const x = point.lng, y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
      
      {/* MAP CONTROLS SIDEBAR */}
      <div className="xl:col-span-1 space-y-5">
        
        {/* Compact Soil Layer Selector on Map Sidebar */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <div className="flex items-center gap-1 text-slate-750 font-bold text-[11px] uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Camada Ativa no Mapa</span>
            <span className="ml-auto text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold uppercase">{activeSoilLayer}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {soilLayers.map((layer) => {
              const matches = layer === activeSoilLayer;
              return (
                <button
                  type="button"
                  key={layer}
                  onClick={() => setActiveSoilLayer(layer)}
                  className={`py-1 rounded text-[10px] font-extrabold cursor-pointer border transition-all text-center leading-normal ${
                    matches
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {layer}
                </button>
              );
            })}
          </div>
        </div>

        {!fieldReady && (
          <div className="flex border-b border-slate-100 bg-slate-50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('coleta')}
              className={`w-1/2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'coleta' 
                  ? 'bg-white text-emerald-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Navegação & Coleta
            </button>
            <button
              onClick={() => setActiveTab('interpolacao')}
              className={`w-1/2 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'interpolacao' 
                  ? 'bg-white text-indigo-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Interpolação (Krigagem)
            </button>
          </div>
        )}

        {/* Tab 1: Navigation & Field operations */}
        {activeTab === 'coleta' && (
          <div className="space-y-4">
            {fieldReady ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-4 text-emerald-900 shadow-sm">
                  <div className="flex items-center gap-2 font-black text-[11px] uppercase tracking-wider text-emerald-800">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Pronto para Ir ao Campo!</span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-emerald-750 mt-1.5">
                    Os pontos amostrais estão consolidados e bloqueados no mapa. Navegue até os locais, realize os furos e registre o status de coleta tocando nos pinos.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm space-y-2.5">
                  <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">Status de Coleta de Campo</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                      <span className="text-slate-500 font-medium">Furos Programados:</span>
                      <span className="font-extrabold text-slate-800">{points.length} furos</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                      <span className="text-slate-500 font-medium">Pontos Coletados:</span>
                      <span className="font-extrabold text-emerald-600">
                        {points.filter(p => p.isCollected).length} / {points.length} ({points.length > 0 ? Math.round((points.filter(p => p.isCollected).length / points.length) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                      <span className="text-slate-500 font-medium">Aguardando Lab:</span>
                      <span className="font-extrabold text-amber-600">
                        {points.filter(p => p.isCollected && !p.results).length} amostras
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Planejamento de Grade</h5>
                  <p className="text-slate-400 text-[10px] mt-0.5">Defina a malha em hectares para gerar furos amostrais automáticos.</p>
                  
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="flex justify-between text-xs text-slate-650 mb-1">
                        <span>Espaçamento da Malha</span>
                        <span className="font-semibold text-slate-800">{gridSpacing}m (~{(gridSpacing * gridSpacing / 10000).toFixed(1)} ha)</span>
                      </label>
                      <input
                        type="range"
                        min="60"
                        max="220"
                        step="20"
                        value={gridSpacing}
                        onChange={(e) => setGridSpacing(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-200 rounded-lg"
                      />
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider block mb-1.5">Opções Padrão (Grade)</span>
                      <div className="flex gap-1">
                        {[
                          { label: '1 ha', value: 100 },
                          { label: '2 ha', value: 140 },
                          { label: '3 ha', value: 170 },
                          { label: '4 ha', value: 200 },
                          { label: '5 ha', value: 220 }
                        ].map((opt) => {
                          const isActive = Math.abs(gridSpacing - opt.value) <= 10;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => setGridSpacing(opt.value)}
                              className={`flex-1 text-center py-1 rounded text-[10px] font-bold cursor-pointer transition-all border ${
                                isActive
                                  ? 'bg-[#10b981] text-white border-[#10b981] shadow-sm'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAutoGenerateSamplingGrid}
                        className="flex-1 py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Gerar Grade
                      </button>
                      <button
                        onClick={() => setManuallyClickToAdd(!manuallyClickToAdd)}
                        className={`px-2.5 py-1 text-xs border rounded font-semibold flex items-center gap-1 cursor-pointer ${
                          manuallyClickToAdd 
                            ? 'border-red-400 bg-red-50 text-red-700' 
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                        title="Selecione um local no mapa para adicionar ponto na Zona de Manejo"
                      >
                        {manuallyClickToAdd ? 'Cancelar Clique' : 'Inserir Ponto'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 space-y-2">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Importar Arquivo KML
                  </h5>
                  <p className="text-slate-400 text-[10px]">Escolha um KML para atualizar os limites do talhão ou carregar marcas de furos do Google Earth.</p>
                  
                  <div className="space-y-2 mt-2">
                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-200 border-dashed rounded bg-white hover:bg-slate-50 transition-colors cursor-pointer p-2">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Upload className="w-5 h-5 text-slate-400 mb-0.5 shrink-0" />
                        <span className="text-[10px] text-slate-600 font-bold block">Selecionar KML</span>
                        <span className="text-[8px] text-slate-400 block font-medium">Google Earth .kml</span>
                      </div>
                      <input 
                        type="file" 
                        accept=".kml" 
                        className="hidden" 
                        onChange={handleKmlImport} 
                      />
                    </label>

                    {kmlError && (
                      <div className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100 p-2 rounded leading-tight">
                        ❌ {kmlError}
                      </div>
                    )}

                    {kmlSuccess && (
                      <div className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 p-2 rounded leading-tight">
                        ✅ {kmlSuccess}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Testar Coleta em Tempo Real</h5>
                  <p className="text-slate-400 text-[10px]">Simule um tablet GPS de campo coletando amostras de terra no talhão.</p>
                  
                  <div className="mt-3">
                    <button
                      onClick={handleToggleTracking}
                      className={`w-full py-2 px-3 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                        trackingActive 
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                          : 'bg-slate-800 text-white hover:bg-slate-900'
                      }`}
                    >
                      <Compass className={`w-3.5 h-3.5 ${trackingActive ? 'animate-spin' : ''}`} />
                      {trackingActive ? 'Parar Simulação GPS' : 'Iniciar Caminhada GPS'}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 text-[11px] space-y-1">
                  <div className="font-semibold text-slate-700 mb-1">Status Operacional:</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tamanho da grade:</span>
                    <span className="font-bold text-slate-700">{points.length} furos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pontos coletados:</span>
                    <span className="font-bold text-emerald-600">{points.filter(p => p.isCollected).length} pontos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Aguardando lab:</span>
                    <span className="font-bold text-amber-600">{points.filter(p => p.isCollected && !p.results).length} amostras</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Geostatistical Contours Interpolator */}
        {activeTab === 'interpolacao' && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Filtro de Fertilidade</h5>
              <p className="text-slate-400 text-[10px] mt-0.5">Selecione a propriedade química do solo para criar o mapa de interpolação.</p>
              
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {(Object.keys(FERTILITY_THRESHOLDS) as (keyof SoilLabResults)[]).map((v) => {
                  const label = FERTILITY_THRESHOLDS[v]?.name || v;
                  const unit = FERTILITY_THRESHOLDS[v]?.unit || '';
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setActiveVariable(v)}
                      className={`p-2 rounded text-left border cursor-pointer transition-colors ${
                        activeVariable === v
                          ? 'border-indigo-400 bg-indigo-50/50 text-indigo-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-100 bg-white text-slate-700'
                      }`}
                      title={label}
                    >
                      <div className="text-[10px] uppercase text-slate-400 font-normal truncate">{label}</div>
                      <div className="text-xs truncate font-bold">{v} <span className="text-[9px] font-normal text-slate-400">{unit}</span></div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 space-y-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Opções de Visualização</h5>
              
              <div>
                <label className="flex justify-between text-xs text-slate-650 mb-1">
                  <span>Opacidade do Mapa</span>
                  <span className="font-semibold text-slate-800">{Math.round(interpolationOpacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="10"
                  value={interpolationOpacity * 100}
                  onChange={(e) => setInterpolationOpacity(parseFloat(e.target.value) / 100)}
                  className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-700 mb-2">Método Ativo:</div>
                <div className="flex items-center gap-2 bg-indigo-100/50 text-indigo-900 border border-indigo-200 px-3 py-1.5 rounded-md text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                  Krigagem Ordinária Exponencial
                </div>
              </div>
            </div>

            {/* Custom Interactive Legend for soil levels */}
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg space-y-2 text-xs">
              <span className="font-bold text-slate-700">Legenda de Fertilidade:</span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 bg-red-500 rounded"></span>
                  <span>Baxo / Crítico (Requer Correção)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 bg-amber-500 rounded"></span>
                  <span>Médio / Aceitável</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 bg-emerald-500 rounded"></span>
                  <span>Alto / Saudável (Perfeito)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Offline / Online Indicator Toggle to fulfill visual requirements */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <button
            onClick={() => setOfflineMode(!offlineMode)}
            className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              offlineMode 
                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' 
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <div className="flex items-center gap-2">
              {offlineMode ? <WifiOff className="w-4 h-4 text-amber-600" /> : <Wifi className="w-4 h-4 text-emerald-600" />}
              <span>{offlineMode ? 'Modo Offline Ativo' : 'Visualização Online'}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border font-bold uppercase shadow-inner">
              {offlineMode ? 'Memória Cache' : 'Hybrid'}
            </span>
          </button>

          {/* "Pronto para ir ao campo!" Toggle Button */}
          <button
            onClick={() => setFieldReady?.(!fieldReady)}
            className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer shadow-sm ${
              fieldReady 
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:shadow shadow-emerald-200'
            }`}
          >
            {fieldReady ? (
              <>
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Voltar ao Planejamento</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 text-emerald-100 shrink-0 animate-pulse" />
                <span>Pronto para ir ao campo!</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* MAP CANVAS STAGE AREA */}
      <div className="xl:col-span-3 h-[450px] relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-900 text-white flex flex-col justify-between">
        
        {/* Offline notification toast banner */}
        {offlineMode && (
          <div className="absolute top-3 left-3 max-w-[calc(100%-160px)] z-[1000] bg-amber-600/95 backdrop-blur-md text-white text-xs py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 border border-amber-500/30 animate-pulse">
            <WifiOff className="w-3.5 h-3.5 animate-bounce shrink-0" />
            <span className="truncate"><strong>MODO OFFLINE ATIVO:</strong> Mapas locais. GPS emulado.</span>
          </div>
        )}

        {/* Floating controls overlay for fast toggles */}
        <div className="absolute top-3 right-3 z-[1001] flex flex-col gap-2">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg shadow-md text-xs font-bold cursor-pointer transition-all border ${
              showGrid
                ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Mostrar ou Ocultar Grade Amostral no Mapa"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>{showGrid ? 'Ocultar Grade' : 'Exibir Grade'}</span>
          </button>

          <button
            onClick={toggleRealGeoTracking}
            className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg shadow-md text-xs font-bold cursor-pointer transition-all border ${
              liveGeoTracking
                ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 animate-pulse'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title={liveGeoTracking ? 'GPS Conectado! Clique para centralizar no mapa.' : 'Utilizar GPS real do seu celular/tablet'}
          >
            <Compass className={`w-3.5 h-3.5 shrink-0 ${liveGeoTracking ? 'animate-spin' : ''}`} />
            <span>{liveGeoTracking ? 'Centralizar GPS' : 'Ativar meu GPS'}</span>
          </button>
        </div>

        {/* Dynamic coordinates / heading indicator bar */}
        <div className="absolute bottom-3 right-3 z-[1000] bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 flex items-center gap-3 shadow-lg">
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${liveGeoTracking ? 'bg-blue-500' : (trackingActive ? 'bg-emerald-500' : 'bg-slate-500')} animate-ping`}></span>
            <span className="font-bold">{liveGeoTracking ? 'GPS ATIVO' : (trackingActive ? 'SIMULANDO' : 'ESTÁTICO')}</span>
          </div>
          <span>•</span>
          <span>LAT: {(simulatedGPS || userLocation) ? (simulatedGPS || userLocation)!.lat.toFixed(6) : (plot.boundaryPoints[0] ? plot.boundaryPoints[0].lat.toFixed(6) : '0.0')}</span>
          <span>•</span>
          <span>LNG: {(simulatedGPS || userLocation) ? (simulatedGPS || userLocation)!.lng.toFixed(6) : (plot.boundaryPoints[0] ? plot.boundaryPoints[0].lng.toFixed(6) : '0.0')}</span>
          {(!simulatedGPS && userLocation?.accuracy) && (
            <>
              <span>•</span>
              <span className="text-blue-400 font-bold">PREC: ±{userLocation.accuracy.toFixed(1)}m</span>
            </>
          )}
        </div>

        {/* HTML Leaflet Map Div */}
        <div ref={mapContainerRef} className="w-full h-full border border-slate-100" id="tactical-leaflet-canvas" />

        {/* Live track cursor indicator */}
        {simulatedGPS && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-950/80 backdrop-blur-sm border border-emerald-500/30 py-2.5 px-4 rounded-xl z-[999] pointer-events-none flex items-center gap-2 font-mono text-xs shadow-2xl">
            <Navigation className="w-4 h-4 text-emerald-400 rotate-45 animate-pulse" />
            <span>GPS Tracking Ativo... Coletando Amostras</span>
          </div>
        )}

      </div>

    </div>
  );
}
