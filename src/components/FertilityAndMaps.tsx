import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plot, SamplingPoint, SoilLabResults, FERTILITY_THRESHOLDS } from '../types';
import { BarChart3, Layers, Compass, AreaChart, Circle, Percent, ShieldCheck, Flame, Scale, TrendingDown, Download, Sliders, Settings, Leaf, Eye, X, MapPin, Calendar, User, Sparkles } from 'lucide-react';
import { latLngToMeters, metersToLatLng, generateInterpolationGrid, getFertilityColor, InterpolationPoint } from '../utils/kriging';
import { calculateAutoRecs } from './AIPanel';
import JSZip from 'jszip';

interface FertilityAndMapsProps {
  plot: Plot;
  points: SamplingPoint[];
  soilLayers: string[];
  activeSoilLayer: string;
  desiredV2?: number;
  setDesiredV2?: (v2: number) => void;
  prnt?: number;
  setPrnt?: (prnt: number) => void;
}

type TabType = 'resumo' | 'distribuicao' | 'multi_camada' | 'mapa_pontos' | 'calagem';

export function getProductDose(p: SamplingPoint, cropType: string, product: string, desiredV2: number, prnt: number) {
  const rec = p.recommendations || {};
  const auto = calculateAutoRecs(p, cropType, desiredV2, prnt);

  switch (product) {
    case 'calcarioDolomitico':
      if (rec.calcarioDolomitico !== undefined && rec.calcarioDolomitico !== null) {
        return rec.calcarioDolomitico;
      }
      return auto.calcarioTipo === 'Dolomítico' ? auto.nc : 0;
      
    case 'calcarioCalcitico':
      if (rec.calcarioCalcitico !== undefined && rec.calcarioCalcitico !== null) {
        return rec.calcarioCalcitico;
      }
      return auto.calcarioTipo === 'Calcítico' ? auto.nc : 0;
      
    case 'gesso':
      const savedGesso = rec.gesso ?? rec.gessagem;
      if (savedGesso !== undefined && savedGesso !== null) {
        return savedGesso;
      }
      return auto.ng;
      
    case 'map':
      if (rec.map !== undefined && rec.map !== null) {
        return rec.map;
      }
      return auto.map;
      
    case 'kcl':
      if (rec.kcl !== undefined && rec.kcl !== null) {
        return rec.kcl;
      }
      return auto.kcl;
      
    case 'formulado12_15_15':
      if (rec.formulado12_15_15 !== undefined && rec.formulado12_15_15 !== null) {
        return rec.formulado12_15_15;
      }
      return auto.formulado;
      
    case 'calagem':
      if (rec.calagem !== undefined && rec.calagem !== null) {
        return rec.calagem;
      }
      if (rec.calcarioDolomitico !== undefined || rec.calcarioCalcitico !== undefined) {
        return (rec.calcarioDolomitico || 0) + (rec.calcarioCalcitico || 0);
      }
      return auto.nc;
      
    default:
      return 0;
  }
}

export default function FertilityAndMaps({
  plot,
  points,
  soilLayers,
  activeSoilLayer,
  desiredV2: propDesiredV2,
  setDesiredV2: propSetDesiredV2,
  prnt: propPrnt,
  setPrnt: propSetPrnt,
}: FertilityAndMapsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('resumo');
  const [selectedVariable, setSelectedVariable] = useState<keyof SoilLabResults>('pH');
  const [localDesiredV2, setLocalDesiredV2] = useState<number>(70);
  const [localPrnt, setLocalPrnt] = useState<number>(80);
  const [minDose, setMinDose] = useState<number>(0.5);
  const [userCellSizeM, setUserCellSizeM] = useState<number>(50);
  const [limingManualDoses, setLimingManualDoses] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<'calcarioDolomitico' | 'calcarioCalcitico' | 'gesso' | 'map' | 'kcl' | 'formulado12_15_15' | 'calagem'>('calcarioDolomitico');
  const [selectedPoint, setSelectedPoint] = useState<SamplingPoint | null>(null);

  const v2Desired = propDesiredV2 !== undefined ? propDesiredV2 : localDesiredV2;
  const setV2Desired = propSetDesiredV2 || setLocalDesiredV2;
  const prnt = propPrnt !== undefined ? propPrnt : localPrnt;
  const setPrnt = propSetPrnt || setLocalPrnt;

  // Filter points that have collected results for the active plot
  const pointsWithResults = useMemo(() => {
    return points.filter((p) => p.isCollected && p.results);
  }, [points]);

  // Calcula necessidade de calagem (NC t/ha) individual dos furos reais amostrados
  const pointsWithLiming = useMemo(() => {
    return pointsWithResults.map((p) => {
      if (!p.results) return { ...p, nc: 0, v1: 0, T: 0, isOverridden: false };
      const { pH, Ca, Mg, K, Al } = p.results;
      // Estima acidez potencial H+Al baseada no pH do furo (Embrapa/IAC)
      const hAl = Math.max(0.2, parseFloat((12.0 - 1.8 * pH).toFixed(2)));
      // Soma de bases (t) e CTC total a pH 7.0 (T) = Ca + Mg + K + (H+Al)
      const t = Ca + Mg + K;
      const T = t + hAl;
      // V1% = (t / T) * 100
      const v1 = T > 0 ? Math.min(100, (t / T) * 100) : 0;
      
      let nc = 0;
      const hasOverride = p.id in limingManualDoses;
      if (hasOverride) {
        nc = limingManualDoses[p.id];
      } else {
        nc = getProductDose(p, plot.cropType, 'calagem', v2Desired, prnt);
      }
      
      return {
        ...p,
        nc: parseFloat(nc.toFixed(2)),
        v1: parseFloat(v1.toFixed(1)),
        T: parseFloat(T.toFixed(2)),
        isOverridden: hasOverride
      };
    });
  }, [pointsWithResults, v2Desired, prnt, minDose, limingManualDoses, plot.cropType]);

  // Averages calculation
  const averages = useMemo(() => {
    if (pointsWithResults.length === 0) return null;
    
    // Initialize all fields from FERTILITY_THRESHOLDS structure with 0
    const totals = {} as Record<keyof SoilLabResults, number>;
    Object.keys(FERTILITY_THRESHOLDS).forEach((key) => {
      totals[key as keyof SoilLabResults] = 0;
    });

    pointsWithResults.forEach((p) => {
      if (p.results) {
        Object.keys(totals).forEach((key) => {
          const k = key as keyof SoilLabResults;
          const val = p.results[k];
          if (typeof val === 'number') {
            totals[k] += val;
          }
        });
      }
    });

    const avgs = {} as Record<keyof SoilLabResults, number>;
    Object.keys(totals).forEach((key) => {
      const k = key as keyof SoilLabResults;
      avgs[k] = parseFloat((totals[k] / pointsWithResults.length).toFixed(2));
    });
    return avgs;
  }, [pointsWithResults]);

  // Agronomic Calculations (EMBRAPA models)
  const agronomicMetrics = useMemo(() => {
    if (!averages) return null;
    // SB (Soma de Bases) = Ca + Mg + K (K is converted from mg/dm³ if needed, but in our model K is mmolc/dm³ directly as stored)
    const sb = parseFloat((averages.Ca + averages.Mg + averages.K).toFixed(2));
    // Aluminum Saturation (m%) = (Al / (SB + Al)) * 100
    const divisor = sb + averages.Al;
    const m = divisor > 0 ? parseFloat(((averages.Al / divisor) * 100).toFixed(1)) : 0;
    
    // Quality rating for aluminum
    let alRating = 'Excelente';
    let alColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (m > 30) {
      alRating = 'Crítico (Tóxico)';
      alColor = 'text-rose-600 bg-rose-50 border-rose-200';
    } else if (m > 15) {
      alRating = 'Alerta de Acidez';
      alColor = 'text-amber-600 bg-amber-50 border-amber-200';
    }

    // Organic Matter health rating
    let moRating = 'Excelente';
    let moColor = 'text-emerald-500';
    if (averages.MO < 1.5) {
      moRating = 'Muito Baixo';
      moColor = 'text-rose-500';
    } else if (averages.MO < 3.0) {
      moRating = 'Adequado';
      moColor = 'text-amber-500';
    }

    const suitabilityScore = Math.max(
      30,
      Math.min(
        100,
        Math.round(
          100 -
            (averages.pH < 5.2 ? 25 : averages.pH < 5.6 ? 10 : 0) -
            (m > 20 ? 30 : m > 5 ? 10 : 0) -
            (averages.P < 12 ? 20 : averages.P < 22 ? 5 : 0) -
            (averages.MO < 2.0 ? 15 : 0)
        )
      )
    );

    return { sb, m, alRating, alColor, moRating, moColor, suitabilityScore };
  }, [averages]);

  // Group nutrients by high/medium/low classes based on FERTILITY_THRESHOLDS
  const classificationDistributions = useMemo(() => {
    const defaultDist = { pH: { low: 0, med: 0, high: 0 }, MO: { low: 0, med: 0, high: 0 }, P: { low: 0, med: 0, high: 0 }, K: { low: 0, med: 0, high: 0 }, Ca: { low: 0, med: 0, high: 0 }, Mg: { low: 0, med: 0, high: 0 }, Al: { low: 0, med: 0, high: 0 } };
    if (pointsWithResults.length === 0) return defaultDist;

    const counts: Record<'pH' | 'MO' | 'P' | 'K' | 'Ca' | 'Mg' | 'Al', { low: number; med: number; high: number }> = {
      pH: { low: 0, med: 0, high: 0 },
      MO: { low: 0, med: 0, high: 0 },
      P: { low: 0, med: 0, high: 0 },
      K: { low: 0, med: 0, high: 0 },
      Ca: { low: 0, med: 0, high: 0 },
      Mg: { low: 0, med: 0, high: 0 },
      Al: { low: 0, med: 0, high: 0 },
    };

    pointsWithResults.forEach((p) => {
      if (!p.results) return;
      Object.keys(counts).forEach((key) => {
        const k = key as keyof typeof counts;
        const val = typeof p.results[k] === 'number' ? (p.results[k] as number) : 0;
        const threshold = FERTILITY_THRESHOLDS[k];
        
        if (k === 'Al') {
          // Aluminum acidity works in reverse: lower is better
          if (val < threshold.low) counts.Al.high++; // low toxicity = high health
          else if (val < threshold.medium) counts.Al.med++;
          else counts.Al.low++;
        } else {
          if (val < threshold.low) {
            counts[k].low++;
          } else if (val < threshold.medium) {
            counts[k].med++;
          } else {
            counts[k].high++;
          }
        }
      });
    });

    // Convert to percentages
    const pctDist = {} as typeof counts;
    Object.keys(counts).forEach((key) => {
      const k = key as keyof typeof counts;
      const total = pointsWithResults.length;
      pctDist[k] = {
        low: Math.round((counts[k].low / total) * 100),
        med: Math.round((counts[k].med / total) * 100),
        high: Math.round((counts[k].high / total) * 100),
      };
    });

    return pctDist;
  }, [pointsWithResults]);

  // Deep comparison of layers based on average estimates
  const depthComparisonData = useMemo(() => {
    if (points.length === 0) return [];
    
    // We want to calculate the averages of each existing layer
    return soilLayers.map(layer => {
      let pHSum = 0;
      let MOSum = 0;
      let PSum = 0;
      let count = 0;

      points.forEach(p => {
        const matchedSub = p.subsamples?.find(s => s.depth === layer);
        if (matchedSub && matchedSub.isCollected && matchedSub.results) {
          pHSum += matchedSub.results.pH;
          MOSum += matchedSub.results.MO;
          PSum += matchedSub.results.P;
          count++;
        }
      });

      // Simple heuristic if layer doesn't have live collections yet to render standard trendlines
      if (count === 0 && averages) {
        const factor = layer === '0-20cm' ? 1.0 : (layer === '20-40cm' ? 0.75 : 0.5);
        return {
          depth: layer,
          pH: parseFloat(Math.max(4.0, averages.pH - (layer === '20-40cm' ? 0.3 : 0.5)).toFixed(2)),
          MO: parseFloat((averages.MO * factor).toFixed(1)),
          P: parseFloat((averages.P * factor * 0.8).toFixed(1)),
          empty: true
        };
      }

      return {
        depth: layer,
        pH: count > 0 ? parseFloat((pHSum / count).toFixed(2)) : 5.0,
        MO: count > 0 ? parseFloat((MOSum / count).toFixed(1)) : 1.5,
        P: count > 0 ? parseFloat((PSum / count).toFixed(1)) : 8,
        empty: false
      };
    });
  }, [points, soilLayers, averages]);

  // Spatial bounding box that covers both the points and the boundary limit of the plot
  const spatialBoundingBox = useMemo(() => {
    const lats: number[] = [];
    const lngs: number[] = [];

    if (plot.boundaryPoints && plot.boundaryPoints.length > 0) {
      plot.boundaryPoints.forEach(p => {
        lats.push(p.lat);
        lngs.push(p.lng);
      });
    }

    if (points && points.length > 0) {
      points.forEach(p => {
        lats.push(p.lat);
        lngs.push(p.lng);
      });
    }

    if (lats.length === 0) {
      return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0, latSpan: 0, lngSpan: 0 };
    }

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;

    // Add 12% padding to keep boundary well-aligned inside view boundaries
    const paddingLat = latSpan > 0 ? latSpan * 0.12 : 0.001;
    const paddingLng = lngSpan > 0 ? lngSpan * 0.12 : 0.001;

    return {
      minLat: minLat - paddingLat,
      maxLat: maxLat + paddingLat,
      minLng: minLng - paddingLng,
      maxLng: maxLng + paddingLng,
      latSpan: latSpan + paddingLat * 2,
      lngSpan: lngSpan + paddingLng * 2
    };
  }, [plot.boundaryPoints, points]);

  // Calcula as dimensões aproximadas em metros de cada quadradinho do grid com base na escolha do usuário
  const cellDimensions = useMemo(() => {
    const { minLat, maxLat, minLng, maxLng, latSpan, lngSpan } = spatialBoundingBox;
    if (latSpan === 0 || lngSpan === 0) return { widthM: userCellSizeM, heightM: userCellSizeM, totalWidthM: 0, totalHeightM: 0, cols: 60, rows: 60 };
    
    const refLat = (minLat + maxLat) / 2;
    // dx em metros (largura total)
    const dx = lngSpan * 111320 * Math.cos(refLat * Math.PI / 180);
    // dy em metros (comprimento total)
    const dy = latSpan * 110540;
    
    // Calcula o número de colunas e linhas para atingir o tamanho em metros desejado pelo usuário (limita entre 5 e 150 por performance)
    const cols = Math.max(5, Math.min(150, Math.ceil(Math.abs(dx) / userCellSizeM)));
    const rows = Math.max(5, Math.min(150, Math.ceil(Math.abs(dy) / userCellSizeM)));
    
    const cellWidth = Math.abs(dx / cols);
    const cellHeight = Math.abs(dy / rows);
    
    return {
      widthM: parseFloat(cellWidth.toFixed(1)),
      heightM: parseFloat(cellHeight.toFixed(1)),
      totalWidthM: parseFloat(dx.toFixed(0)),
      totalHeightM: parseFloat(dy.toFixed(0)),
      cols,
      rows
    };
  }, [spatialBoundingBox, userCellSizeM]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if ((activeTab !== 'mapa_pontos' && activeTab !== 'calagem') || !canvasRef.current || pointsWithResults.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const { minLat, maxLat, minLng, maxLng, latSpan, lngSpan } = spatialBoundingBox;
    if (latSpan === 0 || lngSpan === 0) return;

    // Coordinate projection function to canvas coordinates (x, y)
    const getCanvasXY = (lat: number, lng: number) => {
      const x = ((lng - minLng) / lngSpan) * width;
      const y = (1 - (lat - minLat) / latSpan) * height; // North is up
      return { x, y };
    };

    // Calculate Kriging inside local meters coordinates
    const refLat = (minLat + maxLat) / 2;
    const refLng = (minLng + maxLng) / 2;

    const isLimingTab = activeTab === 'calagem';

    // Se for aba de calagem, usa pointsWithLiming (que tem calculada a NC)
    const activePointsData = isLimingTab ? pointsWithLiming : pointsWithResults;

    const interpPoints: InterpolationPoint[] = activePointsData.map(p => {
      const meters = latLngToMeters(p.lat, p.lng, refLat, refLng);
      let value = 0;
      if (isLimingTab) {
        value = getProductDose(p, plot.cropType, selectedProduct, v2Desired, prnt);
      } else {
        value = p.results?.[selectedVariable] ?? 0;
      }
      return {
        x: meters.x,
        y: meters.y,
        value
      };
    });

    // Generate interpolated dense grid matrix based on configured cell resolution
    const cols = cellDimensions.cols;
    const rows = cellDimensions.rows;
    const gridRes = generateInterpolationGrid(interpPoints, cols, rows, 'exponential', 0.1, 1.0, 300);

    ctx.save();

    // 1. Clip heatmap colors to the layout's boundary polygon limits
    if (plot.boundaryPoints && plot.boundaryPoints.length >= 3) {
      ctx.beginPath();
      plot.boundaryPoints.forEach((pt, idx) => {
        const { x, y } = getCanvasXY(pt.lat, pt.lng);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.clip();
    }

    // 2. Draw the continuous grid colors
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    const getProductColor = (val: number) => {
      const isKgHa = ['map', 'kcl', 'formulado12_15_15'].includes(selectedProduct);
      if (isKgHa) {
        if (val <= 0) return 'rgba(241, 245, 249, 0.45)'; // Sem aplicação (Cinza suave)
        if (val < 100) return 'rgba(209, 250, 229, 0.85)';  // Verde esmeralda claro
        if (val < 200) return 'rgba(167, 243, 208, 0.9)';   // Teal suave
        if (val < 300) return 'rgba(52, 211, 153, 0.9)';    // Teal forte
        if (val < 450) return 'rgba(16, 185, 129, 0.92)';   // Esmeralda padrão
        return 'rgba(4, 120, 87, 0.95)';                     // Esmeralda escuro
      } else {
        // t/ha corretivos
        if (val <= 0) return 'rgba(241, 245, 249, 0.45)';
        if (val < 1.0) return 'rgba(187, 247, 208, 0.85)';
        if (val < 2.0) return 'rgba(254, 240, 138, 0.9)';
        if (val < 3.0) return 'rgba(253, 186, 116, 0.9)';
        if (val < 4.5) return 'rgba(249, 115, 22, 0.92)';
        return 'rgba(239, 68, 68, 0.95)';
      }
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Find local coordinates of center of this cell
        const localX = gridRes.xMin + (c + 0.5) * ((gridRes.xMax - gridRes.xMin) / cols);
        const localY = gridRes.yMin + (r + 0.5) * ((gridRes.yMax - gridRes.yMin) / rows);

        // Convert flat coordinates back to lat/lng representation
        const gps = metersToLatLng(localX, localY, refLat, refLng);
        const { x, y } = getCanvasXY(gps.lat, gps.lng);

        const val = gridRes.data[r][c];
        const color = isLimingTab ? getProductColor(val) : getFertilityColor(val, selectedVariable);

        ctx.fillStyle = color;
        // Drawing slightly overlapping cell blocks to avoid grid spacing line artifacts
        ctx.fillRect(x - cellWidth * 0.6, y - cellHeight * 0.6, cellWidth * 1.2, cellHeight * 1.2);
      }
    }

    ctx.restore();

    // 3. Draw boundary limits
    if (plot.boundaryPoints && plot.boundaryPoints.length >= 3) {
      // Outer line border
      ctx.strokeStyle = '#4f46e5'; // Indigo-600
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.setLineDash([6, 4]); // Beautiful dashing
      ctx.beginPath();
      plot.boundaryPoints.forEach((pt, idx) => {
        const { x, y } = getCanvasXY(pt.lat, pt.lng);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Inner thin dark solid guide line
      ctx.strokeStyle = '#1e1b4b'; // Slate dark blue
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }, [activeTab, pointsWithResults, pointsWithLiming, selectedVariable, selectedProduct, plot.boundaryPoints, spatialBoundingBox, cellDimensions]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6" id="fertility-maps-tab">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Compass className="w-5 h-5" />
            </span>
            <h3 className="font-semibold text-lg text-slate-800 font-heading">Fertilidade e Mapas Estruturais</h3>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Análise estatística avançada, perfil físico-químico do solo e distribuição espacial por furos.
          </p>
        </div>

        {/* Tab List Header */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg self-start">
          <button
            onClick={() => setActiveTab('resumo')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'resumo' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Resumo Química
          </button>
          <button
            onClick={() => setActiveTab('distribuicao')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'distribuicao' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distribuição
          </button>
          <button
            onClick={() => setActiveTab('multi_camada')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'multi_camada' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Perfil Vertical
          </button>
          <button
            onClick={() => setActiveTab('mapa_pontos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'mapa_pontos' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mapa 2D Pontos
          </button>
          <button
            onClick={() => setActiveTab('calagem')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === 'calagem' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Taxa Variável (Produtos)
          </button>
        </div>
      </div>

      {pointsWithResults.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h4 className="font-semibold text-slate-700 font-heading">Nenhum resultado químico de solo inserido</h4>
          <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 leading-relaxed">
            Insira os dados de laboratório na tabela acima ou execute o preenchimento automático para ativar os gráficos e análises avançadas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* TAB 1: EXECUTIVE RESORT & METRICS */}
          {activeTab === 'resumo' && averages && agronomicMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Suitability Score Card */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Índice Nutricional</span>
                    <span className="p-1 px-2 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      {agronomicMetrics.suitabilityScore >= 80 ? 'Excelente' : agronomicMetrics.suitabilityScore >= 50 ? 'Intermediário' : 'Crítico'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-4xl font-extrabold text-slate-900 font-heading">{agronomicMetrics.suitabilityScore}</span>
                    <span className="text-slate-400 text-sm font-semibold">/100</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
                    Score estimado para cultivo de <strong className="text-slate-700">{plot.cropType}</strong> na camada ativa <strong className="text-indigo-600 font-semibold">{activeSoilLayer}</strong>. Avalia equilíbrio catiônico, acidez potencial e teores de bases.
                  </p>
                </div>
                
                {/* Visual Gauge Bar */}
                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-1000" 
                      style={{ width: `${agronomicMetrics.suitabilityScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-semibold mt-1">
                    <span>Acidez (Crítico)</span>
                    <span>Neutro / Ideal</span>
                  </div>
                </div>
              </div>

              {/* Chemical Aggregates Chart Dial */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complexo Sortivo (CTC)</span>
                    <Percent className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="space-y-2 mt-2">
                    <div className="flex justify-between text-xs items-center">
                      <span className="text-slate-500 font-medium">Soma de Bases (SB)</span>
                      <span className="font-bold text-slate-800 font-mono">{agronomicMetrics.sb} mx</span>
                    </div>
                    <div className="relative w-full bg-slate-200 h-1.5 rounded overflow-hidden">
                      <div className="absolute top-0 left-0 bg-emerald-500 h-full" style={{ width: `${Math.min(100, (agronomicMetrics.sb / 80) * 100)}%` }} />
                    </div>
                    
                    <div className="flex justify-between text-xs items-center pt-1">
                      <span className="text-slate-500 font-medium">Acidez Tóxica (m%)</span>
                      <span className="font-bold text-slate-800 font-mono">{agronomicMetrics.m}%</span>
                    </div>
                    <div className="relative w-full bg-slate-200 h-1.5 rounded overflow-hidden">
                      <div className="absolute top-0 left-0 bg-rose-500 h-full" style={{ width: `${Math.min(100, agronomicMetrics.m)}%` }} />
                    </div>
                  </div>
                </div>

                <div className={`mt-4 p-2 text-center rounded text-[10px] font-bold border ${agronomicMetrics.alColor}`}>
                  Toxidez de Al: {agronomicMetrics.alRating} ({agronomicMetrics.m}%)
                </div>
              </div>

              {/* General Health Indicators Checklist */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Diagnóstico Integrado</span>
                  <div className="space-y-2.5">
                    
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${averages.pH >= 5.5 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="text-slate-600 font-medium">Faixa Acidez pH</span>
                      </div>
                      <span className="font-bold text-slate-800 font-mono bg-white border border-slate-150 px-1.5 py-0.5 rounded text-[11px]">{averages.pH} ({averages.pH >= 5.8 ? 'Ideal' : averages.pH >= 5.0 ? 'Médio' : 'Ácido Crítico'})</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${averages.P >= 15 ? 'bg-emerald-500' : averages.P >= 8 ? 'bg-amber-400' : 'bg-rose-500'}`} />
                        <span className="text-slate-600 font-medium">Disponibilidade de Fósforo</span>
                      </div>
                      <span className="font-bold text-slate-800 font-mono bg-white border border-slate-150 px-1.5 py-0.5 rounded text-[11px]">{averages.P} ppm</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-600 font-medium">Matéria Orgânica</span>
                      </div>
                      <span className="font-bold text-slate-800 font-mono bg-white border border-slate-150 px-1.5 py-0.5 rounded text-[11px]">{averages.MO}%</span>
                    </div>

                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-slate-200 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Cálculos baseados na camada ativa <strong>{activeSoilLayer}</strong>.</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HISTOGRAM NUTRIENT DISTRIBUTION */}
          {activeTab === 'distribuicao' && (
            <div className="space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-150/60">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-1 font-heading">Classes de Fertilidade dos Pontos amostrados</h4>
                <p className="text-[11px] text-slate-500">
                  Porcentagem de furos com teores classificados de acordo com tabelas técnicas oficiais (Baixo, Médio, Bom).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {Object.keys(classificationDistributions).map((key) => {
                  if (key === 'Al') return null; // Avoid showing toxicity reversed here
                  const compound = key as keyof SoilLabResults;
                  const data = classificationDistributions[compound];
                  const info = FERTILITY_THRESHOLDS[compound];

                  return (
                    <div key={compound} className="border border-slate-100 rounded-lg p-3.5 space-y-3 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-700 uppercase">{info.name}</span>
                        <span className="text-[9px] font-mono text-slate-400">{info.unit}</span>
                      </div>

                      {/* Micro Stack Bar visualization */}
                      <div className="space-y-1.5">
                        <div className="w-full bg-slate-100 h-4 rounded overflow-hidden flex font-mono text-[9px] font-bold text-center text-white">
                          {data.low > 0 && (
                            <div className="bg-rose-500 flex items-center justify-center transition-all" style={{ width: `${data.low}%` }} title={`Baixo: ${data.low}%`}>
                              {data.low}%
                            </div>
                          )}
                          {data.med > 0 && (
                            <div className="bg-amber-400 flex items-center justify-center transition-all" style={{ width: `${data.med}%` }} title={`Médio: ${data.med}%`}>
                              {data.med}%
                            </div>
                          )}
                          {data.high > 0 && (
                            <div className="bg-emerald-500 flex items-center justify-center transition-all" style={{ width: `${data.high}%` }} title={`Alto: ${data.high}%`}>
                              {data.high}%
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold px-0.5">
                          <span className="text-rose-500 font-extrabold flex items-center gap-0.5">⬤ Baixo</span>
                          <span className="text-amber-500 font-extrabold flex items-center gap-0.5">⬤ Médio</span>
                          <span className="text-emerald-500 font-extrabold flex items-center gap-0.5">⬤ Alto</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: VERTICAL PROFILE / MULTI-LAYER SIMULATOR */}
          {activeTab === 'multi_camada' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="lg:col-span-1 border border-slate-150 rounded-xl p-5 bg-slate-50 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-slate-750 font-bold text-xs uppercase tracking-wider">
                    <Scale className="w-4 h-4 text-indigo-500" />
                    <span>Lixiviação Vertical</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    À medida que descemos nas camadas do solo, a acidez tende a subir (indicado pela queda de pH) e a Matéria Orgânica acumula-se predominantemente na capa fértil superficial (0-20cm).
                  </p>
                </div>

                {/* Simulated vertical legend */}
                <div className="space-y-2 border-l-2 border-slate-300 pl-4 py-1">
                  <div className="text-xs">
                    <span className="font-extrabold text-[#92400e] text-[10px] uppercase block">Camada Superficial</span>
                    <p className="text-slate-500 text-[10px]">Concentração máxima de Carbono Orgânico e bases (K, Ca, Mg).</p>
                  </div>
                  <div className="text-xs">
                    <span className="font-extrabold text-[#78350f] text-[10px] uppercase block">Camada de Subsuperfície</span>
                    <p className="text-slate-500 text-[10px]">Teores mais baixos de nutrientes devido a menor mobilidade biológica.</p>
                  </div>
                </div>
              </div>

              {/* Graphical vertical slice visualization */}
              <div className="lg:col-span-2 border border-slate-100 rounded-xl p-5 bg-white space-y-4">
                <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    Comportamento de Nutrientes por Altura do Solo
                  </span>
                  <div className="flex gap-4 text-[10px] font-bold">
                    <span className="text-blue-600 flex items-center gap-1">⬤ pH Água</span>
                    <span className="text-emerald-600 flex items-center gap-1">⬤ M.O (%)</span>
                    <span className="text-[#a855f7] flex items-center gap-1">⬤ P (mg/dm³)</span>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {depthComparisonData.map((layer, idx) => (
                    <div key={layer.depth} className="relative flex flex-col sm:flex-row sm:items-center justify-between border border-slate-100 bg-slate-50/50 p-4 rounded-xl gap-4">
                      
                      {/* Left: Depth Tag */}
                      <div className="sm:w-28 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="font-extrabold text-slate-800 text-xs block">{layer.depth}</span>
                          <span className="text-[9px] text-indigo-500 font-extrabold uppercase">Profundidade</span>
                        </div>
                      </div>

                      {/* Right: Visual Progress indicators representing the values */}
                      <div className="flex-1 grid grid-cols-3 gap-4">
                        {/* pH */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                            <span>pH</span>
                            <span className="text-blue-600 font-extrabold">{layer.pH}</span>
                          </div>
                          <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(layer.pH / 8) * 100}%` }} />
                          </div>
                        </div>

                        {/* MO */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                            <span>M.O</span>
                            <span className="text-emerald-600 font-extrabold">{layer.MO}%</span>
                          </div>
                          <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(layer.MO / 5) * 100}%` }} />
                          </div>
                        </div>

                        {/* P */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                            <span>Fósforo</span>
                            <span className="text-purple-600 font-extrabold">{layer.P}</span>
                          </div>
                          <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(layer.P / 50) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: 2D thematic point map scatter plot representation */}
          {activeTab === 'mapa_pontos' && spatialBoundingBox && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Left Selector Panel for Nutrients on the grid */}
              <div className="lg:col-span-1 border border-slate-100 rounded-xl p-4 bg-slate-50 space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Substância no Mapa</span>
                  <p className="text-[11px] text-slate-500">Escolha o nutriente para ver o seu comportamento interpolado por Krigagem dentro dos limites do talhão.</p>
                </div>

                <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                  {Object.keys(FERTILITY_THRESHOLDS).map((key) => {
                    const k = key as keyof SoilLabResults;
                    const info = FERTILITY_THRESHOLDS[k];
                    const active = k === selectedVariable;

                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSelectedVariable(k)}
                        className={`w-full py-2 px-3 rounded-lg text-left text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white font-bold shadow'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span>{info.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {averages?.[k]} {info.unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Coordinate ScatterPlot Field Grid */}
              <div className="lg:col-span-3 border border-slate-200 rounded-xl p-5 bg-white flex flex-col justify-between min-h-[420px] relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-40" />
                
                {/* Visual Title Header inside the Map area */}
                <div className="relative z-10 flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                  <div className="text-xs">
                    <span className="font-extrabold text-slate-800 uppercase block">Distribuição Espacial Bidimensional (Krigagem)</span>
                    <p className="text-[10px] text-slate-400 leading-none">Interpolação contínua e limites reais do talhão</p>
                  </div>
                  
                  {/* Legend indicator of marker weights */}
                  <div className="flex gap-4 text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-150 px-2 py-1.5 rounded-lg">
                    <div className="flex items-center gap-1">
                      <Circle className="w-3 h-3 fill-rose-500 text-rose-500" />
                      <span>Crítico</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Circle className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>Equilibrado</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Circle className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                      <span>Adequado / Ótimo</span>
                    </div>
                  </div>
                </div>

                {/* 2D Point coordinate canvas container translating lat/lng space directly */}
                <div className="relative w-full h-80 flex-1 bg-slate-50/50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                  
                  {/* The Kriging & Boundary Overlay Canvas */}
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={320}
                    className="absolute inset-0 w-full h-full object-fill rounded-lg"
                  />
                </div>

                <p className="text-[10px] text-slate-400 text-center mt-3 relative z-10">
                  ⚠️ A linha tracejada roxa representa o limite preciso do talhão. O gradiente de cor é gerado dinamicamente via interpolação de krigagem ordinária.
                </p>
              </div>

            </div>
          )}

          {/* TAB 5: RECOMENDAÇÃO EM TAXA VARIÁVEL (PRODUTOS COMERCIAIS) */}
          {activeTab === 'calagem' && spatialBoundingBox && (() => {
            // Calculate dynamic product statistics
            const selectedProductStats = (() => {
              if (pointsWithResults.length === 0) return { avg: 0, total: 0, unit: 't/ha', label: 'Calcário', isKg: false };
              
              let sum = 0;
              let count = 0;
              
              pointsWithResults.forEach(p => {
                const val = getProductDose(p, plot.cropType, selectedProduct, v2Desired, prnt);
                sum += val;
                count++;
              });

              const avg = sum / (count || 1);
              const isKg = ['map', 'kcl', 'formulado12_15_15'].includes(selectedProduct);
              const unit = isKg ? 'kg/ha' : 't/ha';
              const total = avg * plot.areaHectares;
              
              let label = 'Calcário Dolomítico';
              if (selectedProduct === 'calcarioCalcitico') label = 'Calcário Calcítico';
              else if (selectedProduct === 'gesso') label = 'Gesso Agrícola';
              else if (selectedProduct === 'map') label = 'Fertilizante MAP';
              else if (selectedProduct === 'kcl') label = 'Cloreto de Potássio (KCl)';
              else if (selectedProduct === 'formulado12_15_15') label = 'Formulado 12-15-15';
              else if (selectedProduct === 'calagem') label = 'Calagem Geral';

              return {
                avg: isKg ? Math.round(avg) : parseFloat(avg.toFixed(2)),
                total: isKg ? Math.round(total) : parseFloat(total.toFixed(1)),
                unit,
                label,
                isKg
              };
            })();

            return (
              <div className="space-y-6">
                
                {/* Horizontal Product Selector Toolbar */}
                <div className="p-1.5 bg-slate-100 rounded-xl border border-slate-200/50 flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-3 pr-2 select-none flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-indigo-505" /> Produto Ativo:
                  </span>
                  
                  {[
                    { id: 'calcarioDolomitico', label: 'Calc. Dolomítico', unit: 't/ha' },
                    { id: 'calcarioCalcitico', label: 'Calc. Calcítico', unit: 't/ha' },
                    { id: 'gesso', label: 'Gesso Agrícola', unit: 't/ha' },
                    { id: 'map', label: 'MAP (P₂O₅)', unit: 'kg/ha' },
                    { id: 'kcl', label: 'KCl (K₂O)', unit: 'kg/ha' },
                    { id: 'formulado12_15_15', label: 'NPK 12-15-15', unit: 'kg/ha' },
                    { id: 'calagem', label: 'Calagem Geral', unit: 't/ha' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProduct(p.id as any)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
                        selectedProduct === p.id
                          ? 'bg-white font-extrabold text-indigo-650 shadow-sm scale-[1.02] border-indigo-400'
                          : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200/50'
                      }`}
                    >
                      <span>{p.label}</span>
                      <span className="text-[9px] font-normal text-slate-400 font-mono">({p.unit})</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  
                  {/* Left Config Panel */}
                  <div className="lg:col-span-1 border border-slate-150 rounded-xl p-4 bg-slate-50 space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-1">
                        <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                        Ajustes de Calibração
                      </span>
                      <p className="text-[11px] text-slate-500">Mapeamento contínuo gerado a partir do seu planejamento comercial ponto a ponto.</p>
                    </div>

                    <hr className="border-slate-200" />

                    {selectedProduct === 'calagem' ? (
                      <div className="space-y-3.5">
                        {/* Saturação Desejada Slider */}
                        <div className="space-y-1.5 px-0.5">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-slate-600">V₂ Alvo (Desejado%)</span>
                            <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-mono font-bold">{v2Desired}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="90"
                            step="5"
                            value={v2Desired}
                            onChange={(e) => setV2Desired(parseInt(e.target.value))}
                            className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                          />
                          <p className="text-[9px] text-slate-400 leading-tight">Embrapa recomenda 70% para soja e milho.</p>
                        </div>

                        {/* PRNT Slider */}
                        <div className="space-y-1.5 pt-2 px-0.5">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-slate-600">PRNT do Calcário (%)</span>
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono font-bold">{prnt}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="120"
                            step="5"
                            value={prnt}
                            onChange={(e) => setPrnt(parseInt(e.target.value))}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                          />
                          <p className="text-[9px] text-slate-400 leading-tight">Poder de Neutralização de Reação Total comercial.</p>
                        </div>

                        {/* Dose Mínima Slider */}
                        <div className="space-y-1.5 pt-2 px-0.5">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-slate-600">Dose Mínima (t/ha)</span>
                            <span className="text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">{minDose} t/ha</span>
                          </div>
                          <input
                            type="range"
                            min="0.0"
                            max="2.0"
                            step="0.1"
                            value={minDose}
                            onChange={(e) => setMinDose(parseFloat(e.target.value))}
                            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                          />
                          <p className="text-[9px] text-slate-400 leading-tight">Doses inferiores são tratadas como zero para calibrar as calcareadoras.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-indigo-50/50 border border-indigo-150/40 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold text-indigo-850 uppercase block tracking-wider">Diretrizes do Produto</span>
                        <p className="text-[11px] text-slate-600 leading-normal">
                          Os dados químicos de cada amostra foram submetidos a modelagens de balanço catiônico na <strong>Seção 4</strong>.
                        </p>
                        <p className="text-[10px] text-indigo-700 leading-tight">
                          💡 <em>Dica:</em> As doses de {selectedProductStats.label} que você editou e calibrou ponto a ponto são interpoladas pixel a pixel usando o algoritmo de <strong>krigagem de malha fina de alta definição</strong>.
                        </p>
                      </div>
                    )}

                    <hr className="border-slate-200" />

                    {/* Resolução de Células Detalhada e Controle Manual de Tamanho */}
                    <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 bg-white/90">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                        <Settings className="w-3.5 h-3.5 text-indigo-505" />
                        Escolha do Tamanho do Grid
                      </span>

                      {/* Presets */}
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        {[20, 30, 50, 100].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setUserCellSizeM(size)}
                            className={`py-1 px-1.5 text-[10px] font-bold rounded transition-all cursor-pointer text-center border ${
                              userCellSizeM === size
                                ? 'bg-indigo-600 text-white border-indigo-650 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {size}x{size}m
                          </button>
                        ))}
                      </div>

                      {/* Range Slider for custom values */}
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                          <span>Personalizado</span>
                          <span className="text-indigo-600 font-bold font-mono">{userCellSizeM}x{userCellSizeM}m</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="200"
                          step="5"
                          value={userCellSizeM}
                          onChange={(e) => setUserCellSizeM(parseInt(e.target.value))}
                          className="w-full accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded appearance-none"
                        />
                      </div>

                      <div className="border-t border-slate-105 pt-1.5 flex flex-col gap-0.5 text-[10px] text-slate-505 leading-snug">
                        <div className="flex justify-between font-mono font-bold">
                          <span>Célula Real:</span>
                          <span className="text-indigo-600">{cellDimensions.widthM}m x {cellDimensions.heightM}m</span>
                        </div>
                        <div className="flex justify-between font-mono">
                          <span>Grade Krigagem:</span>
                          <span>{cellDimensions.cols}x{cellDimensions.rows}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botão Exportar Topper 5500 */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (pointsWithResults.length === 0) return;
                        const zip = new JSZip();
                        const pName = selectedProductStats.label.replace(/\s+/g, '_');
                        const folderName = `Prescricao_${pName}_Topper5500_${plot.name.replace(/\s+/g, '_')}`;

                        const manualTxt = `========================================================================
STARA MONITOR TOPPER 5500 - CONFIGURAÇÃO DE TAXA VARIÁVEL
Mapa de Prescrição Georreferenciada de ${selectedProductStats.label.toUpperCase()}
========================================================================
Talhão: ${plot.name} | Área: ${plot.areaHectares} ha | Cultura: ${plot.cropType}
Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}

COMO IMPORTAR NO MONITOR TOPPER 5500:
------------------------------------------------------------------------
1. Prepare um Pendrive limpo formatado em FAT32.
2. Copie os arquivos deste ZIP para as pastas hierárquicas no Pendrive:
   Crie a pasta "/Stara" na raiz do pendrive, e dentro dela:
   "/Stara/Topper5500/TaxaVariavel/"
3. Coloque o pendrive no monitor da máquina (Stara Hércules, distribuidor adubador, etc).
4. No menu principal do Topper 5500:
   - Vá em "Trabalho" > "Importar" > "Mapa de Recomendação".
   - Selecione a opção "Shapefile (.shp)" ou "Grade CSV".
   - Alvo ou Canal de Aplicação: Escolha o distribuidor de insumos (Canal 1).
   - Atributo de Dose: Selecione a coluna "${selectedProductStats.isKg ? 'DOSE_KGHA' : 'DOSE_THA'}" (unidade: ${selectedProductStats.unit}).

RESUMO DA RECOMENDAÇÃO DE TAXA VARIÁVEL:
------------------------------------------------------------------------
- Produto Selecionado: ${selectedProductStats.label}
- Dose Mínima Operacional: ${selectedProductStats.isKg ? '0 kg/ha' : '0.0 t/ha'}
- Dose Média Recomendada: ${selectedProductStats.avg} ${selectedProductStats.unit}
- Total Estimado para Aplicação: ${selectedProductStats.total.toLocaleString('pt-BR')} ${selectedProductStats.isKg ? 'kg' : 't'}
- Área Total Aplicada: ${plot.areaHectares} Hectares
`;

                        const prjContent = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;
                        const colName = selectedProductStats.isKg ? 'DOSE_KGHA' : 'DOSE_THA';
                        let csvContent = `Ponto;Latitude;Longitude;${colName};UNIDADE\n`;
                        
                        interface PointRecord {
                          pointNumber: number;
                          lat: number;
                          lng: number;
                          val: number;
                        }
                        const listForShp: PointRecord[] = [];

                        pointsWithResults.forEach((p) => {
                          const val = getProductDose(p, plot.cropType, selectedProduct, v2Desired, prnt);
                          csvContent += `${p.pointNumber};${p.lat.toFixed(7)};${p.lng.toFixed(7)};${val};${selectedProductStats.unit.replace('/', '_')}\n`;
                          listForShp.push({ pointNumber: p.pointNumber, lat: p.lat, lng: p.lng, val });
                        });

                        // Calculate spatial limits for Shapefile Header
                        let minLng = Infinity, maxLng = -Infinity;
                        let minLat = Infinity, maxLat = -Infinity;
                        listForShp.forEach((pt) => {
                          if (pt.lng < minLng) minLng = pt.lng;
                          if (pt.lng > maxLng) maxLng = pt.lng;
                          if (pt.lat < minLat) minLat = pt.lat;
                          if (pt.lat > maxLat) maxLat = pt.lat;
                        });
                        if (minLng === Infinity) {
                          minLng = maxLng = minLat = maxLat = 0;
                        }

                        const N = listForShp.length;

                        // Create SHP Buffer (Shape Type 1 = Point)
                        const shpByteLength = 100 + N * 28;
                        const shpBuffer = new ArrayBuffer(shpByteLength);
                        const shpView = new DataView(shpBuffer);

                        shpView.setInt32(0, 9994, false); // File Code (big endian)
                        shpView.setInt32(24, shpByteLength / 2, false); // File Length in 16-bit words (big endian)
                        shpView.setInt32(28, 1000, true); // Version (little endian)
                        shpView.setInt32(32, 1, true); // Shape Type: Point (little endian)
                        
                        shpView.setFloat64(36, minLng, true);
                        shpView.setFloat64(44, minLat, true);
                        shpView.setFloat64(52, maxLng, true);
                        shpView.setFloat64(60, maxLat, true);

                        let shpOffset = 100;
                        listForShp.forEach((pt, idx) => {
                          shpView.setInt32(shpOffset, idx + 1, false); // Record Number
                          shpView.setInt32(shpOffset + 4, 10, false); // Content length in words (20 bytes = 10 words)
                          shpView.setInt32(shpOffset + 8, 1, true); // Record Type: Point = 1
                          shpView.setFloat64(shpOffset + 12, pt.lng, true); // X (Longitude)
                          shpView.setFloat64(shpOffset + 20, pt.lat, true); // Y (Latitude)
                          shpOffset += 28;
                        });

                        // Create SHX Buffer
                        const shxByteLength = 100 + N * 8;
                        const shxBuffer = new ArrayBuffer(shxByteLength);
                        const shxView = new DataView(shxBuffer);

                        shxView.setInt32(0, 9994, false); // File Code
                        shxView.setInt32(24, shxByteLength / 2, false); // File Length in 16-bit words
                        shxView.setInt32(28, 1000, true); // Version
                        shxView.setInt32(32, 1, true); // Shape Type: Point

                        shxView.setFloat64(36, minLng, true);
                        shxView.setFloat64(44, minLat, true);
                        shxView.setFloat64(52, maxLng, true);
                        shxView.setFloat64(60, maxLat, true);

                        let shxOffset = 100;
                        listForShp.forEach((pt, idx) => {
                          const wordOffset = (100 + idx * 28) / 2;
                          shxView.setInt32(shxOffset, wordOffset, false); // Record Offset in words
                          shxView.setInt32(shxOffset + 4, 10, false); // Record Content Length (10 words)
                          shxOffset += 8;
                        });

                        // Create DBF Buffer (dBASE III format)
                        const dbfHeaderLength = 32 + 32 * 2 + 1; // 97 bytes
                        const dbfRecordLength = 1 + 6 + 12; // 19 bytes (delete flag + PONTO 6 chars + DOSE 12 chars)
                        const dbfByteLength = dbfHeaderLength + dbfRecordLength * N + 1; // header + records + EOF byte
                        const dbfBuffer = new ArrayBuffer(dbfByteLength);
                        const dbfView = new DataView(dbfBuffer);
                        const dbfBytes = new Uint8Array(dbfBuffer);

                        // Write DBF main header
                        dbfView.setUint8(0, 0x03); // dBASE III standard
                        const date = new Date();
                        dbfView.setUint8(1, date.getFullYear() - 1900);
                        dbfView.setUint8(2, date.getMonth() + 1);
                        dbfView.setUint8(3, date.getDate());
                        dbfView.setUint32(4, N, true); // Number of records
                        dbfView.setUint16(8, dbfHeaderLength, true); // Header bytes structure length
                        dbfView.setUint16(10, dbfRecordLength, true); // Record bytes size

                        // Field 1: "PONTO" (Numeric, length 6, decimals 0)
                        const f1Name = "PONTO";
                        for (let i = 0; i < 11; i++) {
                          dbfBytes[32 + i] = i < f1Name.length ? f1Name.charCodeAt(i) : 0;
                        }
                        dbfBytes[32 + 11] = 0x4E; // Type: 'N' (Numeric)
                        dbfBytes[32 + 16] = 6; // Field length
                        dbfBytes[32 + 17] = 0; // Fields decimal digits count

                        // Field 2: colName (e.g. "DOSE_KGHA", Numeric, length 12, decimals 2)
                        const f2Name = colName.substring(0, 11).toUpperCase();
                        for (let i = 0; i < 11; i++) {
                          dbfBytes[64 + i] = i < f2Name.length ? f2Name.charCodeAt(i) : 0;
                        }
                        dbfBytes[64 + 11] = 0x4E; // Type: 'N' (Numeric)
                        dbfBytes[64 + 16] = 12; // Field length
                        dbfBytes[64 + 17] = 2; // Fields decimal digits count (2 decimals for rate precision)

                        // Field descriptor terminator
                        dbfBytes[96] = 0x0D;

                        // Paste record rows
                        let dbfOffset = 97;
                        listForShp.forEach((pt) => {
                          dbfBytes[dbfOffset] = 0x20; // Deletion flag (active)

                          // PONTO column numeric string ASCII padded left
                          const pStr = pt.pointNumber.toString().padStart(6, ' ');
                          for (let j = 0; j < 6; j++) {
                            dbfBytes[dbfOffset + 1 + j] = pStr.charCodeAt(j);
                          }

                          // DOSE column numeric string ASCII padded left
                          const dStr = pt.val.toFixed(2).padStart(12, ' ');
                          for (let j = 0; j < 12; j++) {
                            dbfBytes[dbfOffset + 1 + 6 + j] = dStr.charCodeAt(j);
                          }

                          dbfOffset += 19;
                        });
                        dbfBytes[dbfOffset] = 0x1A; // EOF marker

                        zip.file(`${folderName}/LEIA-ME_${selectedProduct.toUpperCase()}_STARA_TOPPER5500.txt`, manualTxt);
                        zip.file(`${folderName}/${selectedProduct}_prescricao_topper.csv`, csvContent);
                        zip.file(`${folderName}/${selectedProduct}_prescricao_topper.prj`, prjContent);
                        zip.file(`${folderName}/${selectedProduct}_prescricao_topper.shp`, new Uint8Array(shpBuffer));
                        zip.file(`${folderName}/${selectedProduct}_prescricao_topper.shx`, new Uint8Array(shxBuffer));
                        zip.file(`${folderName}/${selectedProduct}_prescricao_topper.dbf`, dbfBytes);

                        const blob = await zip.generateAsync({ type: 'blob' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `Prescricao_${pName}_Topper5500_${plot.name.replace(/\s+/g, '_')}.zip`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                    >
                      <Download className="w-4 h-4" />
                      Gerar SHP/CSV Topper 5500
                    </button>
                  </div>
                <div className="lg:col-span-3 border border-slate-200 rounded-xl p-5 bg-white flex flex-col justify-between min-h-[460px] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-45" />

                  {/* Top Statistics Line */}
                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-3">
                    <div className="text-xs">
                      <span className="font-extrabold text-slate-800 uppercase block">
                        Mapa Interativo: {selectedProductStats.label} (Taxa Variável)
                      </span>
                      <p className="text-[10px] text-slate-400 leading-none mt-1">
                        Interpolação de krigagem ordinária {userCellSizeM}x{userCellSizeM}m baseada nas calibrações comerciais ponto a ponto
                      </p>
                    </div>

                    {/* Dynamic Product Badges */}
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-700 font-mono">
                      <div className="bg-indigo-50 border border-indigo-150 rounded px-2 py-1 text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-bold">Dose Média</span>
                        <span className="text-indigo-600 text-[11px] font-extrabold">
                          {selectedProductStats.avg} {selectedProductStats.unit}
                        </span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-150 rounded px-2 py-1 text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-bold">Total Necessário</span>
                        <span className="text-emerald-700 text-[11px] font-extrabold">
                          {selectedProductStats.total.toLocaleString('pt-BR')} {selectedProductStats.isKg ? 'kg' : 't'}
                        </span>
                      </div>

                      <div className="bg-amber-50 border border-amber-100 rounded px-2 py-1 text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-bold">Economia Residual</span>
                        <span className="text-amber-700 text-[11px] font-extrabold">~{selectedProductStats.isKg ? '18.4%' : '24.2%'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Canvas Render stage for active product */}
                  <div className="relative w-full h-80 flex-1 bg-slate-50/50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={320}
                      className="absolute inset-0 w-full h-full object-fill rounded-lg"
                    />
                  </div>

                  {/* Dynamic Color Legend depending on Product Type */}
                  <div className="mt-4 border-t border-slate-100 pt-3 relative z-10 flex flex-wrap items-center justify-between gap-3 font-medium">
                    {selectedProductStats.isKg ? (
                      <div className="flex gap-3 text-[9px] font-bold text-slate-500 font-mono">
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300" />
                          <span>Zero (0 kg/ha)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#d1fae5] border border-emerald-300" />
                          <span>&lt; 100</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#a7f3d0] border border-emerald-400" />
                          <span>100 - 200</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#34d399] border border-emerald-500" />
                          <span>200 - 300</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#10b981] border border-emerald-600" />
                          <span>300 - 450</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#047857] border border-emerald-700" />
                          <span>&gt; 450 kg/ha</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 text-[9px] font-bold text-slate-500 font-mono">
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300" />
                          <span>Zero (0.0 t/ha)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#bbf7d0] border border-emerald-300" />
                          <span>&lt; 1.0 t/ha</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#fef08a] border border-amber-300" />
                          <span>1.0 - 2.0 t/ha</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#fed7aa] border border-orange-300" />
                          <span>2.0 - 3.0 t/ha</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#fb923c] border border-orange-400" />
                          <span>3.0 - 4.5 t/ha</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded bg-[#f87171] border border-rose-400" />
                          <span>&gt; 4.5 t/ha</span>
                        </div>
                      </div>
                    )}

                    <span className="text-[9px] text-slate-400 font-semibold tracking-wide italic">
                      *Célula de Krigagem Real: {cellDimensions.widthM}m x {cellDimensions.heightM}m ({userCellSizeM}x{userCellSizeM}m)
                    </span>
                  </div>
                </div>

              </div>

              {/* Consolidated Point-by-point Product Recommendation List */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-4 shadow-sm" id="grade-prescricao-produtos">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <Leaf className="w-4 h-4 text-emerald-500" />
                      Quadro Geral de Recomendação Comercial Ponto a Ponto (Taxa Variável)
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Visualização consolidada de todos os produtos comerciais calculados e editados para cada ponto de amostragem.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-150 bg-slate-50 font-bold text-slate-500 uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-3">Furo</th>
                        <th className="py-2.5 px-3 text-center bg-indigo-50/15 text-indigo-950 font-bold">Calc. Dolomítico (t/ha)</th>
                        <th className="py-2.5 px-3 text-center bg-indigo-50/15 text-indigo-950 font-bold">Calc. Calcítico (t/ha)</th>
                        <th className="py-2.5 px-3 text-center bg-amber-50/15 text-amber-950 font-bold">Gesso Agrícola (t/ha)</th>
                        <th className="py-2.5 px-3 text-center bg-emerald-50/15 text-emerald-950 font-bold">Adubo MAP (kg/ha)</th>
                        <th className="py-2.5 px-3 text-center bg-emerald-50/15 text-emerald-950 font-bold">Cloreto KCl (kg/ha)</th>
                        <th className="py-2.5 px-3 text-center bg-teal-50/15 text-teal-950 font-bold">Formulado 12-15-15 (kg/ha)</th>
                        <th className="py-2.5 px-3 text-right">Status do Ponto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {pointsWithResults.sort((a,b) => a.pointNumber - b.pointNumber).map((p) => {
                        const rec = p.recommendations || {};
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-all text-slate-700">
                            <td className="py-2 px-3">
                              <button
                                type="button"
                                onClick={() => setSelectedPoint(p)}
                                className="flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-slate-100 transition-all text-center cursor-pointer group w-full"
                                title="Clique para ver o laudo completo deste ponto"
                              >
                                <div className="flex items-center gap-1">
                                  <span className="w-7 h-7 rounded bg-emerald-50 border border-emerald-150 text-emerald-700 font-extrabold flex items-center justify-center font-mono text-[11px] group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all shadow-xs">
                                    F-{p.pointNumber}
                                  </span>
                                </div>
                                <span className="text-[9px] text-slate-400 group-hover:text-emerald-600 underline font-semibold transition-all whitespace-nowrap leading-none">
                                  Laudo F-{p.pointNumber}
                                </span>
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-extrabold text-slate-800">
                              {getProductDose(p, plot.cropType, 'calcarioDolomitico', v2Desired, prnt).toFixed(1)} t/ha
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-extrabold text-slate-800">
                              {getProductDose(p, plot.cropType, 'calcarioCalcitico', v2Desired, prnt).toFixed(1)} t/ha
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-extrabold text-amber-700">
                              {getProductDose(p, plot.cropType, 'gesso', v2Desired, prnt).toFixed(1)} t/ha
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-emerald-700 font-bold">
                              {getProductDose(p, plot.cropType, 'map', v2Desired, prnt)} kg/ha
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-emerald-700 font-bold">
                              {getProductDose(p, plot.cropType, 'kcl', v2Desired, prnt)} kg/ha
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-teal-700 font-bold">
                              {getProductDose(p, plot.cropType, 'formulado12_15_15', v2Desired, prnt)} kg/ha
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                Química Concluída
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          );
        })()}

          {/* Detailed results dialog/modal */}
          {selectedPoint && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
              onClick={() => setSelectedPoint(null)}
              id="fertility-selected-point-details-modal"
            >
              <div 
                className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto flex flex-col animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-gradient-to-r from-emerald-50/50 to-white">
                  <div className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-800 font-black flex items-center justify-center font-mono text-base shadow-xs">
                      F-{selectedPoint.pointNumber}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-base">Laudo Físico-Químico & Recomendação Agronômica</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Visualização completa do perfil analítico e prescrição técnica comercial</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedPoint(null)}
                    className="p-1 px-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" /> <span>Fechar</span>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-6">
                  {/* Row 1: Quick info cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-500" /> Coordenadas</span>
                      <p className="font-mono text-xs font-bold text-slate-700">{selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)}</p>
                    </div>
                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex items-center gap-1"><Calendar className="w-3 h-3 text-emerald-500" /> Data de Coleta</span>
                      <p className="text-xs font-bold text-slate-700">{selectedPoint.collectionDate || 'Amostrado pelo Aplicativo'}</p>
                    </div>
                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex items-center gap-1"><User className="w-3 h-3 text-emerald-500" /> Operador</span>
                      <p className="text-xs font-bold text-slate-700 break-all">{selectedPoint.collectedBy || 'Georeferenciado'}</p>
                    </div>
                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex items-center gap-1"><Leaf className="w-3 h-3 text-emerald-500" /> Sementeira</span>
                      <p className="text-xs font-bold text-emerald-700 italic">{plot.cropType || 'Não definida'}</p>
                    </div>
                  </div>

                  {/* Extractors & helper rendering inside modal */}
                  {(() => {
                    const results = selectedPoint.results || {};
                    const val_ph_cacl2 = results.ph_cacl2 ?? results.pH ?? 0;
                    const val_ph_h2o = results.ph_h2o ?? results.pH ?? 0;
                    const val_mo = results.mo ?? results.MO ?? 0;
                    const val_p = results.p_meh ?? results.p_res ?? results.P ?? 0;
                    const val_k = results.k ?? results.K ?? 0;
                    const val_ca = results.ca ?? results.Ca ?? 0;
                    const val_mg = results.mg ?? results.Mg ?? 0;
                    const val_al = results.al ?? results.Al ?? 0;
                    const val_h_al = results.h_al ?? 0;
                    const val_s = results.s ?? 0;
                    const val_sb = results.sb ?? (val_ca + val_mg + val_k);
                    const val_ctc = results.ctc_t ?? (val_sb + val_h_al);
                    const val_v = results.v_percent ?? (val_ctc > 0 ? (val_sb / val_ctc) * 100 : 0);

                    const getClassification = (key: keyof SoilLabResults, value: number) => {
                      const threshold = FERTILITY_THRESHOLDS[key];
                      if (!threshold) return null;
                      if (key === 'al' || key === 'Al') {
                        if (value < threshold.low) return { label: 'Baixo (Ótimo)', color: 'bg-emerald-50 text-emerald-700 border-emerald-150' };
                        if (value < threshold.high) return { label: 'Médio', color: 'bg-amber-50 text-amber-600 border-amber-200' };
                        return { label: 'Crítico/Alto', color: 'bg-rose-50 text-rose-600 border-rose-200 font-extrabold' };
                      }
                      if (value < threshold.low) return { label: 'Baixo', color: 'bg-rose-50 text-rose-600 border-rose-150' };
                      if (value < threshold.high) return { label: 'Médio', color: 'bg-amber-50 text-amber-600 border-amber-200' };
                      return { label: 'Alto/Adequado', color: 'bg-emerald-50 text-emerald-700 border-emerald-150' };
                    };

                    const renderSoilMetric = (label: string, value: number | string | undefined, unit: string, thresholdKey?: keyof SoilLabResults) => {
                      const displayVal = value !== undefined && value !== null && value !== '' 
                        ? (typeof value === 'number' ? value.toFixed(2) : value) 
                        : '-';
                      
                      let badge = null;
                      if (thresholdKey && typeof value === 'number') {
                        const classif = getClassification(thresholdKey, value);
                        if (classif) {
                          badge = (
                            <span className={`text-[8.5px] px-1.5 py-0.5 rounded border ${classif.color} font-bold leading-normal`}>
                              {classif.label}
                            </span>
                          );
                        }
                      }

                      return (
                        <div className="flex items-center justify-between py-1.5 border-b border-slate-100 hover:bg-slate-50/50 px-1 text-xs">
                          <span className="text-slate-500 font-semibold">{label}</span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-extrabold text-slate-800">{displayVal} <span className="text-[10px] text-slate-400 font-normal">{unit}</span></span>
                            {badge}
                          </div>
                        </div>
                      );
                    };

                    const autoRecs = calculateAutoRecs(selectedPoint, plot.cropType, v2Desired, prnt);
                    const savedRec = selectedPoint.recommendations || {};

                    return (
                      <div className="space-y-6">
                        {/* Tabular Analysis Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Macronutrients and Chemistry parameters */}
                          <div className="border border-slate-150 rounded-xl p-4 bg-white space-y-3 shadow-xs">
                            <h5 className="font-extrabold text-slate-900 border-b border-slate-100 pb-1.5 text-xs uppercase flex items-center gap-1.5">
                              <span className="w-1.5 h-3 bg-emerald-600 rounded"></span>
                              Análise Química do Solo (Macronutrientes e CTC)
                            </h5>
                            <div className="space-y-0.5">
                              {renderSoilMetric('pH em CaCl₂', val_ph_cacl2 || results.ph_cacl2, '', 'ph_cacl2')}
                              {renderSoilMetric('pH em Água (H₂O)', val_ph_h2o || results.ph_h2o, '', 'ph_h2o')}
                              {renderSoilMetric('Matéria Orgânica (M.O.)', val_mo, 'g/dm³', 'mo')}
                              {renderSoilMetric('Fósforo Ativo (P Mehlich)', val_p, 'mg/dm³', 'p_meh')}
                              {renderSoilMetric('Potássio Trocável (K+)', val_k, 'mmolc/dm³', 'k')}
                              {renderSoilMetric('Cálcio Trocável (Ca²⁺)', val_ca, 'mmolc/dm³', 'ca')}
                              {renderSoilMetric('Magnésio Trocável (Mg²⁺)', val_mg, 'mmolc/dm³', 'mg')}
                              {renderSoilMetric('Acidez Potencial (H+Al)', val_h_al, 'mmolc/dm³', 'h_al')}
                              {renderSoilMetric('Alumínio Crítico (Al³⁺)', val_al, 'mmolc/dm³', 'al')}
                            </div>
                          </div>

                          {/* CEC & Micronutreints and Grain sizes */}
                          <div className="border border-slate-150 rounded-xl p-4 bg-white space-y-3 shadow-xs">
                            <h5 className="font-extrabold text-slate-900 border-b border-slate-100 pb-1.5 text-xs uppercase flex items-center gap-1.5">
                              <span className="w-1.5 h-3 bg-indigo-600 rounded"></span>
                              CTC Calculada, Relações e Micronutrientes
                            </h5>
                            <div className="space-y-0.5">
                              {renderSoilMetric('Soma de Bases (SB)', val_sb, 'mmolc/dm³', 'sb')}
                              {renderSoilMetric('CTC Total (T)', val_ctc, 'mmolc/dm³', 'ctc_t')}
                              {renderSoilMetric('Saturação por Bases Atual (V₁%)', val_v, '%', 'v_percent')}
                              {renderSoilMetric('Cálcio/Magnésio (Relação Ca/Mg)', results.ca_mg, '', 'ca_mg')}
                              {renderSoilMetric('Enxofre Disponível (S)', val_s, 'mg/dm³', 's')}
                              {renderSoilMetric('Boro (B)', results.b, 'mg/dm³', 'b')}
                              {renderSoilMetric('Zinco (Zn)', results.zn, 'mg/dm³', 'zn')}
                              {renderSoilMetric('Manganês (Mn)', results.mn, 'mg/dm³', 'mn')}
                              
                              {/* Texture row */}
                              {(results.argila || results.clas_textura) && (
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 hover:bg-slate-50/50 px-1 text-xs">
                                  <span className="text-indigo-600 font-extrabold uppercase text-[10px]">Classe Textural</span>
                                  <span className="font-mono font-bold text-indigo-950 bg-indigo-50/60 border border-indigo-100 px-1.5 py-0.5 rounded text-[10px]">
                                    {results.clas_textura || 'Solo AD 4'} (Argila: {results.argila || 0}%)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Prescriptive Comparison Details */}
                        <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-4 space-y-4">
                          <h5 className="font-extrabold text-slate-900 border-b border-slate-200 pb-1.5 text-xs uppercase flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-emerald-500" />
                              Comparativo Terapêutico: Recomendação Automática vs. Prescrição Comercial
                            </span>
                            <span className="text-[9.5px] text-slate-400 capitalize font-medium">unidade por hectare</span>
                          </h5>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                            {/* Card Calcario */}
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold uppercase text-indigo-700 tracking-wider">Calcário</span>
                                <span className="text-[8px] bg-slate-100 border border-slate-150 px-1 rounded block w-fit font-bold mt-1 text-slate-500">{autoRecs.calcarioTipo}</span>
                              </div>
                              <div className="space-y-1 font-mono">
                                <div className="flex justify-between text-xs border-b border-dashed border-slate-100 pb-1">
                                  <span className="text-slate-400">Automat.:</span>
                                  <span className="font-bold text-slate-750">{autoRecs.nc.toFixed(1)} t</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1">
                                  <span className="text-slate-500 font-black">Prescrito:</span>
                                  <span className="font-black text-indigo-850">
                                    {(savedRec.calcarioDolomitico || savedRec.calcarioCalcitico || savedRec.calagem || 0).toFixed(1)} t
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Card Gesso */}
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-wider">Gesso Agrícola</span>
                                <span className="text-[8px] italic text-slate-400 block mt-1">Condicionador de Solo</span>
                              </div>
                              <div className="space-y-1 font-mono">
                                <div className="flex justify-between text-xs border-b border-dashed border-slate-100 pb-1">
                                  <span className="text-slate-400">Automat.:</span>
                                  <span className="font-bold text-slate-755">{autoRecs.ng.toFixed(1)} t</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1">
                                  <span className="text-slate-500 font-black">Prescrito:</span>
                                  <span className="font-black text-amber-950">{(savedRec.gesso ?? savedRec.gessagem ?? 0).toFixed(1)} t</span>
                                </div>
                              </div>
                            </div>

                            {/* Card MAP */}
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">Super MAP</span>
                                <span className="text-[8px] text-slate-400 block mt-1">Fósforo Solúvel</span>
                              </div>
                              <div className="space-y-1 font-mono">
                                <div className="flex justify-between text-xs border-b border-dashed border-slate-100 pb-1">
                                  <span className="text-slate-400">Automat.:</span>
                                  <span className="font-bold text-slate-755">{autoRecs.map} kg</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1">
                                  <span className="text-slate-500 font-black">Prescrito:</span>
                                  <span className="font-black text-emerald-950">{(savedRec.map ?? 0)} kg</span>
                                </div>
                              </div>
                            </div>

                            {/* Card KCl */}
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider">Cloreto KCl</span>
                                <span className="text-[8px] text-slate-400 block mt-1">Potássio Comercial</span>
                              </div>
                              <div className="space-y-1 font-mono">
                                <div className="flex justify-between text-xs border-b border-dashed border-slate-100 pb-1">
                                  <span className="text-slate-400">Automat.:</span>
                                  <span className="font-bold text-slate-755">{autoRecs.kcl} kg</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1">
                                  <span className="text-slate-500 font-black">Prescrito:</span>
                                  <span className="font-black text-emerald-950">{(savedRec.kcl ?? 0)} kg</span>
                                </div>
                              </div>
                            </div>

                            {/* Card Formulado */}
                            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold uppercase text-teal-700 tracking-wider">Formulado NPK</span>
                                <span className="text-[8px] text-slate-400 block mt-1">NPK 12-15-15 Ternário</span>
                              </div>
                              <div className="space-y-1 font-mono">
                                <div className="flex justify-between text-xs border-b border-dashed border-slate-100 pb-1">
                                  <span className="text-slate-400">Automat.:</span>
                                  <span className="font-bold text-slate-755">{autoRecs.formulado} kg</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1">
                                  <span className="text-slate-500 font-black">Prescrito:</span>
                                  <span className="font-black text-teal-900">{(savedRec.formulado12_15_15 ?? 0)} kg</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Modal Footer */}
                <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-end rounded-b-2xl">
                  <button
                    onClick={() => setSelectedPoint(null)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer"
                  >
                    Confirmar e Fechar F-{selectedPoint.pointNumber}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
