import React, { useState, useEffect, useMemo } from 'react';
import { Client, Farm, Plot, SamplingPoint, SoilLabResults, FERTILITY_THRESHOLDS } from '../types';
import { 
  Download, 
  Save, 
  Copy, 
  RotateCcw, 
  AlertTriangle, 
  HelpCircle, 
  Leaf, 
  Printer, 
  Check, 
  Sparkles,
  ChevronDown,
  Percent,
  Eye,
  X,
  Compass,
  MapPin,
  Calendar,
  User,
  ExternalLink
} from 'lucide-react';

interface AIPanelProps {
  client: Client;
  farm: Farm;
  plot: Plot;
  points: SamplingPoint[];
  onChangePoints?: (updatedPoints: SamplingPoint[]) => Promise<void>;
  desiredV2?: number;
  setDesiredV2?: (v2: number) => void;
  prnt?: number;
  setPrnt?: (prnt: number) => void;
}

// Helper to calculate automatic agronomic recommendations on the fly point-by-point
export function calculateAutoRecs(p: SamplingPoint, cropType: string, desiredV2: number = 70, prnt: number = 80) {
  if (!p.results) {
    return {
      nc: 0,
      ng: 0,
      map: 0,
      kcl: 0,
      formulado: 0,
      v1: 0,
      T: 0,
      hAl: 0,
      mg: 0,
      pVal: 0,
      kVal: 0,
      calcarioTipo: 'Dolomítico' as const
    };
  }

  const pH = p.results.pH ?? p.results.ph_h2o ?? p.results.ph_cacl2 ?? 5.5;
  const Ca = p.results.Ca ?? p.results.ca ?? 0;
  const Mg = p.results.Mg ?? p.results.mg ?? 0;
  const K = p.results.K ?? p.results.k ?? 0;
  const P = p.results.P ?? p.results.p_meh ?? p.results.p_res ?? 0;

  const hAl = p.results.h_al ?? Math.max(0.2, parseFloat((12.0 - 1.8 * pH).toFixed(2)));
  const T = p.results.ctc_t ?? (Ca + Mg + K + hAl);
  const t = Ca + Mg + K;
  const v1 = T > 0 ? Math.min(100, (t / T) * 100) : 0;

  let nc = 0;
  if (desiredV2 > v1 && T > 0) {
    // Fórmula corrigida de calagem (NC em t/ha) utilizando SATURAÇÃO POR BASES:
    // NC = (v% desejado - v% atual solo) * CTC (T em cmolc/dm³) / PRNT
    // Como a CTC (T) no sistema está em mmolc/dm³, dividimos por 10, o que equivale a dividir por (PRNT * 10)
    nc = ((desiredV2 - v1) * T) / (prnt * 10);
  }
  nc = parseFloat(Math.max(0, nc).toFixed(1));

  let ng = parseFloat((nc * 0.4).toFixed(1));

  let mapVal = 0;
  const crop = (cropType || '').toLowerCase();
  if (crop.includes('soja') || crop.includes('soy')) {
    mapVal = P < 10 ? 150 : (P < 25 ? 90 : 30);
  } else if (crop.includes('milho') || crop.includes('corn') || crop.includes('sorgo')) {
    mapVal = P < 10 ? 190 : (P < 25 ? 120 : 45);
  } else {
    mapVal = P < 10 ? 160 : (P < 25 ? 100 : 35);
  }

  let kclVal = 0;
  if (K < 1.5) {
    kclVal = 120;
  } else if (K < 3.0) {
    kclVal = 80;
  } else {
    kclVal = 30;
  }

  let formuladoVal = 0;
  if (crop.includes('milho') || crop.includes('corn')) {
    formuladoVal = P < 25 ? 350 : 200;
  } else if (crop.includes('soja') || crop.includes('soy')) {
    formuladoVal = P < 25 ? 240 : 150;
  } else {
    formuladoVal = P < 25 ? 300 : 180;
  }

  const calcarioTipo = Mg < 8 ? ('Dolomítico' as const) : ('Calcítico' as const);

  return {
    nc,
    ng,
    map: mapVal,
    kcl: kclVal,
    formulado: formuladoVal,
    v1,
    T,
    hAl,
    mg: Mg,
    pVal: P,
    kVal: K,
    calcarioTipo
  };
}

export default function AIPanel({
  client,
  farm,
  plot,
  points,
  onChangePoints,
  desiredV2: propDesiredV2,
  setDesiredV2: propSetDesiredV2,
  prnt: propPrnt,
  setPrnt: propSetPrnt,
}: AIPanelProps) {
  // Local state for recommendation inputs to allow responsive editing before saving
  const [localPoints, setLocalPoints] = useState<SamplingPoint[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [showConfigHelper, setShowConfigHelper] = useState<boolean>(true);
  const [selectedPoint, setSelectedPoint] = useState<SamplingPoint | null>(null);

  const [localDesiredV2, setLocalDesiredV2] = useState<number>(70);
  const [localPrnt, setLocalPrnt] = useState<number>(80);

  const desiredV2 = propDesiredV2 !== undefined ? propDesiredV2 : localDesiredV2;
  const setDesiredV2 = propSetDesiredV2 || setLocalDesiredV2;
  const prnt = propPrnt !== undefined ? propPrnt : localPrnt;
  const setPrnt = propSetPrnt || setLocalPrnt;

  // Sync with prop updates
  useEffect(() => {
    setLocalPoints(JSON.parse(JSON.stringify(points)));
    setIsSaved(true);
  }, [points]);

  // Points that have laboratory results
  const pointsWithResults = useMemo(() => {
    return localPoints.filter(p => p.isCollected && p.results);
  }, [localPoints]);

  const hasLabResults = pointsWithResults.length > 0;

  // Calculates typical agronomic baselines based on soil analysis and selected crop
  const handleApplyAgronomicBaselines = () => {
    const updated = localPoints.map((pt) => {
      if (!pt.isCollected || !pt.results) return pt;

      const auto = calculateAutoRecs(pt, plot.cropType, desiredV2, prnt);
      const crop = plot.cropType.toLowerCase();
      const finalN = crop.includes('milho') ? 130 : (crop.includes('soja') ? 10 : 80);
      const baseP = (pt.results.P ?? pt.results.p_meh ?? pt.results.p_res ?? 0) < 10 ? 90 : ((pt.results.P ?? pt.results.p_meh ?? pt.results.p_res ?? 0) < 25 ? 55 : 20);
      const baseK = (pt.results.K ?? pt.results.k ?? 0) < 1.5 ? 80 : ((pt.results.K ?? pt.results.k ?? 0) < 3.0 ? 50 : 20);

      return {
        ...pt,
        recommendations: {
          calagem: auto.nc,
          gessagem: auto.ng,
          n: finalN,
          p: baseP,
          k: baseK,
          formula: '12-15-15',
          gesso: auto.ng,
          calcarioDolomitico: auto.calcarioTipo === 'Dolomítico' ? auto.nc : 0,
          calcarioCalcitico: auto.calcarioTipo === 'Calcítico' ? auto.nc : 0,
          map: auto.map,
          kcl: auto.kcl,
          formulado12_15_15: auto.formulado
        }
      };
    });

    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Clear all entered recommendation data
  const handleClearAll = () => {
    const updated = localPoints.map((pt) => ({
      ...pt,
      recommendations: undefined
    }));
    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Copy recommendation of the very first point to all other sampled points
  const handleCopyFirstPointToAll = () => {
    const sorted = [...localPoints].sort((a, b) => a.pointNumber - b.pointNumber);
    const firstPt = sorted.find(p => p.isCollected && p.results && p.recommendations);
    
    if (!firstPt || !firstPt.recommendations) {
      alert('Preencha a recomendação do primeiro furo antes de copiar.');
      return;
    }

    const recToCopy = firstPt.recommendations;

    const updated = localPoints.map((pt) => {
      if (!pt.isCollected || !pt.results) return pt;
      return {
        ...pt,
        recommendations: JSON.parse(JSON.stringify(recToCopy))
      };
    });

    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Updates a single field on a physical point's recommendation list
  const handleFieldChange = (pointId: string, field: keyof NonNullable<SamplingPoint['recommendations']>, value: any) => {
    const updated = localPoints.map((pt) => {
      if (pt.id !== pointId) return pt;
      
      const currentRec = pt.recommendations || { 
        calagem: 0, gessagem: 0, n: 0, p: 0, k: 0, formula: '', 
        gesso: 0, calcarioDolomitico: 0, calcarioCalcitico: 0, 
        map: 0, kcl: 0, formulado12_15_15: 0 
      };
      
      return {
        ...pt,
        recommendations: {
          ...currentRec,
          [field]: value
        }
      };
    });

    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Unified handler to update NC (Necessidade de Calcário), routing to dolomitico or calcitico
  const handleNCChange = (pointId: string, value: number, isDolomitico: boolean) => {
    const updated = localPoints.map((pt) => {
      if (pt.id !== pointId) return pt;
      const currentRec = pt.recommendations || { 
        calagem: 0, gessagem: 0, n: 0, p: 0, k: 0, formula: '12-15-15', 
        gesso: 0, calcarioDolomitico: 0, calcarioCalcitico: 0, 
        map: 0, kcl: 0, formulado12_15_15: 0 
      };
      return {
        ...pt,
        recommendations: {
          ...currentRec,
          calagem: value,
          calcarioDolomitico: isDolomitico ? value : 0,
          calcarioCalcitico: isDolomitico ? 0 : value
        }
      };
    });
    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Unified handler to update NG (Necessidade de Gesso), writing to both properties
  const handleNGChange = (pointId: string, value: number) => {
    const updated = localPoints.map((pt) => {
      if (pt.id !== pointId) return pt;
      const currentRec = pt.recommendations || { 
        calagem: 0, gessagem: 0, n: 0, p: 0, k: 0, formula: '12-15-15', 
        gesso: 0, calcarioDolomitico: 0, calcarioCalcitico: 0, 
        map: 0, kcl: 0, formulado12_15_15: 0 
      };
      return {
        ...pt,
        recommendations: {
          ...currentRec,
          gessagem: value,
          gesso: value
        }
      };
    });
    setLocalPoints(updated);
    setIsSaved(false);
  };

  // Save changes back to the main App.tsx component and persistent Cloud Firestore layer
  const handleSaveChanges = async () => {
    if (!onChangePoints) return;
    setSaveLoading(true);
    try {
      await onChangePoints(localPoints);
      setIsSaved(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar as recomendações no banco de dados.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Summary statistics computed based on local user changes
  const recStatAverages = useMemo(() => {
    if (pointsWithResults.length === 0) {
      return { 
        avgDolomitico: 0, avgCalcitico: 0, avgGesso: 0, avgMAP: 0, avgKCl: 0, avgFormulado: 0,
        totDolomitico: 0, totCalcitico: 0, totGesso: 0, totMAP: 0, totKCl: 0, totFormulado: 0,
        count: 0 
      };
    }
    
    let sumDolomitico = 0;
    let sumCalcitico = 0;
    let sumGesso = 0;
    let sumMAP = 0;
    let sumKCl = 0;
    let sumFormulado = 0;
    let countRecWithData = 0;

    pointsWithResults.forEach(pt => {
      if (pt.recommendations) {
        sumDolomitico += pt.recommendations.calcarioDolomitico || 0;
        sumCalcitico += pt.recommendations.calcarioCalcitico || 0;
        sumGesso += pt.recommendations.gesso || pt.recommendations.gessagem || 0;
        sumMAP += pt.recommendations.map || 0;
        sumKCl += pt.recommendations.kcl || 0;
        sumFormulado += pt.recommendations.formulado12_15_15 || 0;
        countRecWithData++;
      }
    });

    const d = countRecWithData || 1;
    const avgDolomitico = sumDolomitico / d;
    const avgCalcitico = sumCalcitico / d;
    const avgGesso = sumGesso / d;
    const avgMAP = sumMAP / d;
    const avgKCl = sumKCl / d;
    const avgFormulado = sumFormulado / d;

    return {
      avgDolomitico: parseFloat(avgDolomitico.toFixed(1)),
      avgCalcitico: parseFloat(avgCalcitico.toFixed(1)),
      avgGesso: parseFloat(avgGesso.toFixed(1)),
      avgMAP: Math.round(avgMAP),
      avgKCl: Math.round(avgKCl),
      avgFormulado: Math.round(avgFormulado),
      
      // Total estimates (Rate * Area)
      totDolomitico: parseFloat((avgDolomitico * plot.areaHectares).toFixed(1)),
      totCalcitico: parseFloat((avgCalcitico * plot.areaHectares).toFixed(1)),
      totGesso: parseFloat((avgGesso * plot.areaHectares).toFixed(1)),
      // In kg, converted to t if above 1000kg
      totMAP: Math.round(avgMAP * plot.areaHectares),
      totKCl: Math.round(avgKCl * plot.areaHectares),
      totFormulado: Math.round(avgFormulado * plot.areaHectares),
      count: countRecWithData
    };
  }, [pointsWithResults, plot.areaHectares]);

  // Export recommendations table to standard CSV
  const handleExportCSV = () => {
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Furo;Latitude;Longitude;Calc_Dolomitico_t_ha;Calc_Calcitico_t_ha;Gesso_t_ha;MAP_kg_ha;KCl_kg_ha;Formulado_12_15_15_kg_ha\n';
    
    localPoints.forEach((p) => {
      const cd = p.recommendations?.calcarioDolomitico ?? 0;
      const cc = p.recommendations?.calcarioCalcitico ?? 0;
      const g = p.recommendations?.gesso ?? p.recommendations?.gessagem ?? 0;
      const map = p.recommendations?.map ?? 0;
      const kcl = p.recommendations?.kcl ?? 0;
      const form = p.recommendations?.formulado12_15_15 ?? 0;
      csv += `${p.pointNumber};${p.lat.toFixed(7)};${p.lng.toFixed(7)};${cd};${cc};${g};${map};${kcl};${form}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Recomendacoes_Comerciais_${plot.name.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to trigger browser print dialog for nice tabular PDF print
  const handlePrintLaudo = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6" id="point-by-point-recommendation-panel">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Leaf className="w-5 h-5 text-emerald-600" />
            </span>
            <h3 className="font-semibold text-lg text-slate-800">Prescrição Técnica Comercial Comercializável (Ponto a Ponto)</h3>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Planejamento ponto a ponto de produtos específicos (Calcários Calcítico/Dolomítico, Gesso, MAP, KCl e Formulado NPK 12-15-15) associado à malha de amostragem de terra do talhão <strong>{plot.name}</strong>.
          </p>
        </div>

        {/* Status indicator and print/export buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!isSaved && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Alterações Pendentes
            </span>
          )}
          {isSaved && pointsWithResults.some(p => p.recommendations) && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-md font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
              <Check className="w-3 h-3" /> Dados Salvos
            </span>
          )}

          {onChangePoints && (
            <button
              onClick={handleSaveChanges}
              disabled={isSaved || saveLoading}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                isSaved 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-600 border border-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {saveLoading ? 'Salvando...' : 'Salvar no Banco'}
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-350 text-slate-700 rounded-lg text-xs font-bold transition-all hover:bg-slate-50 shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>

          <button
            onClick={handlePrintLaudo}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-350 text-emerald-700 hover:text-emerald-800 rounded-lg text-xs font-bold transition-all hover:bg-slate-50 shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Laudo
          </button>
        </div>
      </div>

      {!hasLabResults ? (
        <div className="text-center py-10 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 space-y-2">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h4 className="font-semibold text-slate-700">Falta de Dados Analíticos</h4>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 px-4">
            Preencha os resultados de análise laboratorial para pelo menos 1 furo na <strong>Seção 3 (Resultados de Análise Química do Solo)</strong> antes de formular as recomendações ponto a ponto.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Diagnostic Widget Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5" id="recommendation-widgets-summary">
            <div className="bg-indigo-50/40 border border-indigo-150/50 p-3 rounded-xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">Calc. Dolomítico</span>
              <p className="font-black text-indigo-700 text-base font-mono">{recStatAverages.avgDolomitico} <span className="text-[10px] font-semibold text-slate-500">t/ha</span></p>
              <p className="text-[9.5px] text-indigo-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totDolomitico || 0} t</p>
            </div>

            <div className="bg-indigo-50/40 border border-indigo-150/50 p-3 rounded-xl border-dashed">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">Calc. Calcítico</span>
              <p className="font-black text-indigo-700 text-base font-mono">{recStatAverages.avgCalcitico} <span className="text-[10px] font-semibold text-slate-500">t/ha</span></p>
              <p className="text-[9.5px] text-indigo-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totCalcitico || 0} t</p>
            </div>

            <div className="bg-amber-50/45 border border-amber-100/65 p-3 rounded-xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">Gesso</span>
              <p className="font-black text-amber-700 text-base font-mono">{recStatAverages.avgGesso} <span className="text-[10px] font-semibold text-slate-500">t/ha</span></p>
              <p className="text-[9.5px] text-amber-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totGesso || 0} t</p>
            </div>

            <div className="bg-emerald-50/40 border border-emerald-100/60 p-3 rounded-xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">Adubação MAP</span>
              <p className="font-black text-emerald-700 text-base font-mono">{recStatAverages.avgMAP} <span className="text-[10px] font-semibold text-slate-500">kg/ha</span></p>
              <p className="text-[9.5px] text-emerald-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totMAP.toLocaleString('pt-BR')} kg</p>
            </div>

            <div className="bg-emerald-50/40 border border-emerald-100/60 p-3 rounded-xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">KCl Cloreto</span>
              <p className="font-black text-emerald-700 text-base font-mono">{recStatAverages.avgKCl} <span className="text-[10px] font-semibold text-slate-500">kg/ha</span></p>
              <p className="text-[9.5px] text-emerald-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totKCl.toLocaleString('pt-BR')} kg</p>
            </div>

            <div className="bg-emerald-50/40 border border-emerald-100/60 p-3 rounded-xl">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wide">Formul. 12-15-15</span>
              <p className="font-black text-emerald-700 text-base font-mono">{recStatAverages.avgFormulado} <span className="text-[10px] font-semibold text-slate-500">kg/ha</span></p>
              <p className="text-[9.5px] text-emerald-600/80 leading-none mt-1 font-semibold italic">Est: {recStatAverages.totFormulado.toLocaleString('pt-BR')} kg</p>
            </div>
          </div>

          {/* Configurable Soil Correction Parameters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target base saturation (V2%) parameter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="desired-v2-range" className="text-xs font-extrabold text-slate-700 flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-emerald-500 rounded"></span>
                  <Percent className="w-3.5 h-3.5 text-emerald-600" />
                  Saturação por Bases Desejada (V₂%)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    id="desired-v2-input"
                    value={desiredV2}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(100, Number(e.target.value) || 0));
                      setDesiredV2(val);
                    }}
                    className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono font-extrabold text-xs text-slate-800 bg-slate-50 focus:bg-white transition-all shadow-2xs"
                    min="1"
                    max="100"
                  />
                  <span className="text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 font-mono">10%</span>
                <input
                  type="range"
                  id="desired-v2-range"
                  min="10"
                  max="100"
                  value={desiredV2}
                  onChange={(e) => setDesiredV2(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none hover:bg-slate-200 transition-all"
                />
                <span className="text-[10px] font-bold text-slate-400 font-mono">100%</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">O V₁% de cada amostra será elevado para este valor. O padrão recomendado é de 70% para grãos.</p>
            </div>

            {/* Limestone PRNT parameter */}
            <div className="space-y-2 md:border-l md:border-slate-100 md:pl-6">
              <div className="flex items-center justify-between">
                <label htmlFor="prnt-range" className="text-xs font-extrabold text-slate-700 flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-indigo-500 rounded"></span>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  PRNT do Calcário (%)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    id="prnt-input"
                    value={prnt}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(150, Number(e.target.value) || 0));
                      setPrnt(val);
                    }}
                    className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono font-extrabold text-xs text-slate-800 bg-slate-50 focus:bg-white transition-all shadow-2xs"
                    min="1"
                    max="150"
                  />
                  <span className="text-xs text-slate-400 font-bold">%</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 font-mono">30%</span>
                <input
                  type="range"
                  id="prnt-range"
                  min="30"
                  max="120"
                  value={prnt}
                  onChange={(e) => setPrnt(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none hover:bg-slate-200 transition-all"
                />
                <span className="text-[10px] font-bold text-slate-400 font-mono">120%</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Poder Relativo de Neutralização Total do Corretivo comercial. O padrão comercial de referência é 80%.</p>
            </div>
          </div>

          {/* Batch operations toolbar */}
          <div className="bg-slate-50/90 border border-slate-200/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-semibold select-none shadow-xs">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Ações Operacionais e Assistente de Recomendação Comercias:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyAgronomicBaselines}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-650 to-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                title="Gera doses de Calcário Dolomítico, Calcítico, Gesso, MAP, KCl e Formulado 12-15-15 baseadas nas faixas analíticas e exportadas por furos"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Assistente Técnico Comercial
              </button>

              <button
                type="button"
                onClick={handleCopyFirstPointToAll}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Copia a recomendação do primeiro furo com dados válidos para todas as demais células"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Ponto 1 p/ Todos
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-300 text-rose-600 hover:text-rose-700 rounded-lg text-xs font-bold transition-all hover:bg-rose-50/40 flex items-center gap-1 cursor-pointer"
                title="Limpar todos os campos de recomendação"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zerar Todos
              </button>
            </div>
          </div>

          {/* Interactive editing table */}
          <div className="border border-slate-150 rounded-xl overflow-hidden shadow-xs bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-extrabold uppercase tracking-widest text-[9px]">
                    <th className="py-3 px-3 w-20">Furo</th>
                    <th className="py-3 px-2 text-center bg-slate-100/30 w-28 text-[9px]">V₁% e Mg Atual</th>
                    
                    <th className="py-3 px-2 text-center bg-indigo-50/10 text-indigo-950 w-72 min-w-[260px]">
                      <div className="font-extrabold text-[10px]">NC - Calcário (t/ha)</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case mt-0.5">Automático (Fórmula) vs. Dose Corrigida</div>
                    </th>
                    
                    <th className="py-3 px-2 text-center bg-amber-50/10 text-amber-950 w-72 min-w-[260px]">
                      <div className="font-extrabold text-[10px]">NG - Gesso (t/ha)</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case mt-0.5">Automático (0.4 * NC) vs. Dose Corrigida</div>
                    </th>
                    
                    <th className="py-3 px-2 text-center bg-emerald-50/10 text-emerald-950 w-72 min-w-[260px]">
                      <div className="font-extrabold text-[10px]">P₃ - MAP (kg/ha)</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case mt-0.5">Automático (Regra P) vs. Dose Corrigida</div>
                    </th>
                    
                    <th className="py-3 px-2 text-center bg-emerald-50/10 text-emerald-950 w-72 min-w-[260px]">
                      <div className="font-extrabold text-[10px]">K₂ - KCl (kg/ha)</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case mt-0.5">Automático (Regra K) vs. Dose Corrigida</div>
                    </th>
                    
                    <th className="py-3 px-2 text-center bg-teal-50/10 text-teal-950 w-72 min-w-[260px]">
                      <div className="font-extrabold text-[10px]">Formulado NPK (kg/ha)</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case mt-0.5">Automático (12-15-15) vs. Dose Corrigida</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pointsWithResults.sort((a,b) => a.pointNumber - b.pointNumber).map((p) => {
                    const rec = p.recommendations || { 
                      calagem: 0, gessagem: 0, n: 0, p: 0, k: 0, formula: '', 
                      gesso: 0, calcarioDolomitico: 0, calcarioCalcitico: 0, 
                      map: 0, kcl: 0, formulado12_15_15: 0 
                    };
                    
                    // Live auto calculations based on current soil parameters
                    const auto = calculateAutoRecs(p, plot.cropType, desiredV2, prnt);
                    const isSoy = plot.cropType.toLowerCase().includes('soja') || plot.cropType.toLowerCase().includes('soy');
                    const isCorn = plot.cropType.toLowerCase().includes('milho') || plot.cropType.toLowerCase().includes('corn') || plot.cropType.toLowerCase().includes('sorgo');
                    
                    const correctedNC = rec.calcarioDolomitico || rec.calcarioCalcitico || rec.calagem || 0;
                    const correctedNG = rec.gesso || rec.gessagem || 0;
                    const correctedMAP = rec.map ?? 0;
                    const correctedKCL = rec.kcl ?? 0;
                    const correctedFormulado = rec.formulado12_15_15 ?? 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/40 transition-all font-medium text-slate-700">
                        {/* Point number identification */}
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
 
                        {/* Analysis indicators for support */}
                        <td className="py-2 px-2 text-center bg-slate-50/50">
                          <div className="flex flex-col items-center justify-center font-mono text-[9px] leading-tight gap-0.5">
                            <div className="flex justify-between w-full px-1 bg-white border border-slate-100 rounded">
                              <span className="text-slate-400">V₁%:</span>
                              <span className="text-slate-700 font-bold">{auto.v1.toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between w-full px-1 bg-white border border-slate-100 rounded">
                              <span className="text-slate-400">Mg:</span>
                              <span className={`font-bold ${auto.mg < 8 ? 'text-amber-600' : 'text-emerald-600'}`}>{auto.mg.toFixed(1)}</span>
                            </div>
                          </div>
                        </td>
 
                        {/* NC - Calcário */}
                        <td className="py-2 px-2 bg-indigo-50/5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* Auto calc column */}
                            <div className="flex-1 bg-slate-50 border border-slate-150 rounded-lg p-1.5 text-center min-w-[105px]" title={`NC = (${desiredV2} - V1) * T / (${prnt} * 10)\n(${desiredV2} - ${auto.v1.toFixed(0)}%) * ${auto.T.toFixed(1)} / (${prnt} * 10)`}>
                              <div className="text-[11px] font-bold text-slate-800 font-mono leading-none">
                                {auto.nc.toFixed(1)} <span className="text-[9px] text-slate-400 font-normal">t/ha</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium leading-none mt-1 select-none whitespace-nowrap">
                                ({desiredV2}-{auto.v1.toFixed(0)})*{auto.T.toFixed(1)}/({prnt}*10)
                              </div>
                              <div className={`inline-block text-[8px] px-1 rounded font-bold mt-1 scale-90 ${auto.calcarioTipo === 'Dolomítico' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
                                {auto.calcarioTipo}
                              </div>
                            </div>

                            {/* Manual input */}
                            <div className="flex flex-col items-center gap-0.5 select-none">
                              <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Corrige</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleNCChange(p.id, Math.max(0, parseFloat((correctedNC - 0.1).toFixed(1))), auto.calcarioTipo === 'Dolomítico')}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="15"
                                  step="0.1"
                                  value={correctedNC}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    handleNCChange(p.id, isNaN(val) ? 0 : Math.max(0, val), auto.calcarioTipo === 'Dolomítico');
                                  }}
                                  className="w-12 rounded border border-slate-200 py-0.5 font-mono text-center text-xs font-bold focus:border-indigo-500 h-6 bg-white text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleNCChange(p.id, parseFloat((correctedNC + 0.1).toFixed(1)), auto.calcarioTipo === 'Dolomítico')}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
 
                        {/* NG - Gesso */}
                        <td className="py-2 px-2 bg-amber-50/5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* Auto calc column */}
                            <div className="flex-1 bg-slate-50 border border-slate-150 rounded-lg p-1.5 text-center min-w-[105px]" title={`NG = 0.4 * NC\n0.4 * ${auto.nc.toFixed(1)}`}>
                              <div className="text-[11px] font-bold text-slate-800 font-mono leading-none">
                                {auto.ng.toFixed(1)} <span className="text-[9px] text-slate-400 font-normal">t/ha</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium leading-none mt-1 select-none whitespace-nowrap">
                                0.4 * {auto.nc.toFixed(1)} t
                              </div>
                              <div className="text-[8px] text-amber-600 font-bold mt-1 select-none">
                                Condicionador
                              </div>
                            </div>

                            {/* Manual input */}
                            <div className="flex flex-col items-center gap-0.5 select-none">
                              <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Corrige</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleNGChange(p.id, Math.max(0, parseFloat((correctedNG - 0.1).toFixed(1))))}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  step="0.1"
                                  value={correctedNG}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    handleNGChange(p.id, isNaN(val) ? 0 : Math.max(0, val));
                                  }}
                                  className="w-12 rounded border border-slate-200 py-0.5 font-mono text-center text-xs font-bold focus:border-amber-500 h-6 bg-white text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleNGChange(p.id, parseFloat((correctedNG + 0.1).toFixed(1)))}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
 
                        {/* MAP */}
                        <td className="py-2 px-2 bg-emerald-50/5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* Auto calc column */}
                            <div className="flex-1 bg-slate-50 border border-slate-150 rounded-lg p-1.5 text-center min-w-[105px]" title={`MAP baseado em P = ${auto.pVal.toFixed(1)} mg/dm³\n${isSoy ? 'Cultura: Soja (Regra P<10: 150, <25: 90, >=25: 30)' : isCorn ? 'Cultura: Milho (Regra P<10: 190, <25: 120, >=25: 45)' : 'Cultura padrão (Regra P<10: 160, <25: 100, >=25: 35)'}`}>
                              <div className="text-[11px] font-bold text-slate-800 font-mono leading-none">
                                {auto.map} <span className="text-[9px] text-slate-400 font-normal">kg/ha</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium leading-none mt-1 select-none">
                                P = {auto.pVal.toFixed(1)}
                              </div>
                              <div className="text-[7.5px] text-emerald-600 font-bold bg-emerald-50/40 rounded px-1 inline-block mt-1 select-none">
                                {isSoy ? 'Soja' : isCorn ? 'Milho' : 'Geral'}
                              </div>
                            </div>

                            {/* Manual input */}
                            <div className="flex flex-col items-center gap-0.5 select-none">
                              <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Corrige</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'map', Math.max(0, correctedMAP - 10))}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="800"
                                  step="10"
                                  value={correctedMAP}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleFieldChange(p.id, 'map', isNaN(val) ? 0 : Math.max(0, val));
                                  }}
                                  className="w-14 rounded border border-slate-200 py-0.5 font-mono text-center text-xs font-bold focus:border-emerald-500 h-6 bg-white text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'map', correctedMAP + 10)}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
 
                        {/* KCl */}
                        <td className="py-2 px-2 bg-emerald-50/5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* Auto calc column */}
                            <div className="flex-1 bg-slate-50 border border-slate-150 rounded-lg p-1.5 text-center min-w-[105px]" title={`KCl baseado em K = ${auto.kVal.toFixed(1)} mmolc/dm³\nRegras de Potássio:\nK < 1.5 => 120 kg/ha\n1.5 <= K < 3.0 => 80 kg/ha\nK >= 3.0 => 30 kg/ha`}>
                              <div className="text-[11px] font-bold text-slate-800 font-mono leading-none">
                                {auto.kcl} <span className="text-[9px] text-slate-400 font-normal">kg/ha</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium leading-none mt-1 select-none">
                                K = {auto.kVal.toFixed(1)}
                              </div>
                              <div className="text-[7.5px] text-emerald-600 font-bold bg-emerald-50/40 rounded px-1 inline-block mt-1 select-none">
                                {auto.kVal < 1.5 ? 'Baixo' : auto.kVal < 3.0 ? 'Médio' : 'Alto'}
                              </div>
                            </div>

                            {/* Manual input */}
                            <div className="flex flex-col items-center gap-0.5 select-none">
                              <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Corrige</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'kcl', Math.max(0, correctedKCL - 10))}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="600"
                                  step="10"
                                  value={correctedKCL}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleFieldChange(p.id, 'kcl', isNaN(val) ? 0 : Math.max(0, val));
                                  }}
                                  className="w-14 rounded border border-slate-200 py-0.5 font-mono text-center text-xs font-bold focus:border-emerald-500 h-6 bg-white text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'kcl', correctedKCL + 10)}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
 
                        {/* Formulado 12-15-15 */}
                        <td className="py-2 px-2 bg-teal-50/5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {/* Auto calc column */}
                            <div className="flex-1 bg-slate-50 border border-slate-150 rounded-lg p-1.5 text-center min-w-[105px]" title={`NPK 12-15-15 baseado em P = ${auto.pVal.toFixed(1)} mg/dm³\n${isSoy ? 'Regra Soja: P < 25 => 240, >= 25 => 150' : isCorn ? 'Regra Milho: P < 25 => 350, >= 25 => 200' : 'Regra Geral: P < 25 => 300, >= 25 => 180'}`}>
                              <div className="text-[11px] font-bold text-slate-800 font-mono leading-none">
                                {auto.formulado} <span className="text-[9px] text-slate-400 font-normal">kg/ha</span>
                              </div>
                              <div className="text-[8px] text-slate-400 font-medium leading-none mt-1 select-none">
                                P = {auto.pVal.toFixed(1)}
                              </div>
                              <div className="text-[7.5px] text-teal-650 font-bold bg-teal-50 rounded px-1 inline-block mt-1 select-none">
                                NPK 12-15-15
                              </div>
                            </div>

                            {/* Manual input */}
                            <div className="flex flex-col items-center gap-0.5 select-none">
                              <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Corrige</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'formulado12_15_15', Math.max(0, correctedFormulado - 10))}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="1000"
                                  step="10"
                                  value={correctedFormulado}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleFieldChange(p.id, 'formulado12_15_15', isNaN(val) ? 0 : Math.max(0, val));
                                  }}
                                  className="w-14 rounded border border-slate-200 py-0.5 font-mono text-center text-xs font-bold focus:border-teal-500 h-6 bg-white text-teal-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleFieldChange(p.id, 'formulado12_15_15', correctedFormulado + 10)}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold font-mono text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reference guidelines block */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <button
              type="button"
              onClick={() => setShowConfigHelper(!showConfigHelper)}
              className="flex items-center justify-between w-full font-bold text-slate-700 text-xs text-left cursor-pointer"
            >
              <span className="flex items-center gap-1">
                <HelpCircle className="w-4 h-4 text-emerald-500" />
                Dicionário e Guia de Fórmulas dos Fertilizantes e Corretivos Comerciais
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showConfigHelper ? 'rotate-180' : ''}`} />
            </button>

            {showConfigHelper && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-[11px] leading-relaxed text-slate-600 border-t border-slate-150">
                <div className="space-y-1">
                  <h5 className="font-extrabold text-slate-700 uppercase">1. Calcários (Dolomítico vs. Calcítico)</h5>
                  <p>
                    Recomendado para elevar o pH e a saturação por bases. O Calcário <strong>Dolomítico</strong> é direcionado para solos com deficiência acentuada de Magnésio (Mg &lt; 8.0). O Calcário <strong>Calcítico</strong> fornece cálcio puro e é usado quando o magnésio já se encontra em níveis adequados.
                  </p>
                </div>

                <div className="space-y-1 border-l border-slate-150 pl-0 md:pl-4">
                  <h5 className="font-extrabold text-slate-700 uppercase">2. Condicionador Gesso</h5>
                  <p>
                    O Gesso Agrícola (Sulfato de Cálcio) penetra profundamente em subsuperfície, fornecendo Cálcio e Enxofre nas camadas mais profundas promovendo o desenvolvimento do sistema radicular e resistência à seca.
                  </p>
                </div>

                <div className="space-y-1 border-l border-slate-150 pl-0 md:pl-4">
                  <h5 className="font-extrabold text-slate-700 uppercase">3. MAP, KCl e Formulado 12-15-15</h5>
                  <p>
                    Consistem nas principais fontes minerais altamente concentradas:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li><strong>MAP</strong>: Fosfato Monoamônico (11% N, 52% P₂O₅).</li>
                    <li><strong>KCl</strong>: Cloreto de Potássio (60% K₂O).</li>
                    <li><strong>Formulado 12-15-15</strong>: Fertilizante ternário balanceado contendo nitrogênio, fósforo e potássio na mesma proporção comercial.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Detailed results dialog/modal */}
          {selectedPoint && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
              onClick={() => setSelectedPoint(null)}
              id="selected-point-details-modal"
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

                    const autoRecs = calculateAutoRecs(selectedPoint, plot.cropType, desiredV2, prnt);
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
                                  <span className="font-bold text-slate-705">{autoRecs.nc.toFixed(1)} t</span>
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
                                  <span className="font-bold text-slate-705">{autoRecs.ng.toFixed(1)} t</span>
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
                                  <span className="font-bold text-slate-705">{autoRecs.map} kg</span>
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
                                  <span className="font-bold text-slate-705">{autoRecs.kcl} kg</span>
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
                                  <span className="font-bold text-slate-705">{autoRecs.formulado} kg</span>
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
