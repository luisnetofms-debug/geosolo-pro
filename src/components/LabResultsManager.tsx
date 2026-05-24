import React, { useState } from 'react';
import { SamplingPoint, SoilLabResults } from '../types';
import { Beaker, Eye, Plus, Check, RefreshCw, Undo, Save, Layers, X } from 'lucide-react';

interface LabResultsManagerProps {
  points: SamplingPoint[];
  onChangePoints: (updatedPoints: SamplingPoint[]) => void;
  activeSoilLayer: string;
  setActiveSoilLayer: (layer: string) => void;
  soilLayers: string[];
  setSoilLayers: (layers: string[]) => void;
}

export default function LabResultsManager({ 
  points, 
  onChangePoints,
  activeSoilLayer,
  setActiveSoilLayer,
  soilLayers,
  setSoilLayers
}: LabResultsManagerProps) {

  const [newLayerName, setNewLayerName] = useState('');
  const [isAddingLayer, setIsAddingLayer] = useState(false);

  const handleAddCustomLayer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newLayerName.trim();
    if (!cleanName) return;
    if (soilLayers.includes(cleanName)) {
      return;
    }
    setSoilLayers([...soilLayers, cleanName]);
    setActiveSoilLayer(cleanName);
    setNewLayerName('');
    setIsAddingLayer(false);
  };

  // Estrelando a função de cálculo das relações do solo de acordo com fórmulas oficiais (Embrapa)
  const calculateSoilResults = (raw: Partial<SoilLabResults>): SoilLabResults => {
    const ph_cacl2 = typeof raw.ph_cacl2 === 'number' ? raw.ph_cacl2 : 5.7;
    const ph_h2o = typeof raw.ph_h2o === 'number' ? raw.ph_h2o : 6.3;
    const ph_kcl = raw.ph_kcl !== undefined ? raw.ph_kcl : 'ns';
    const mo = typeof raw.mo === 'number' ? raw.mo : 36;
    const p_meh = typeof raw.p_meh === 'number' ? raw.p_meh : 36.4;
    const p_res = typeof raw.p_res === 'number' ? raw.p_res : 76;
    const p_rem = raw.p_rem !== undefined ? raw.p_rem : 'ns';
    const k = typeof raw.k === 'number' ? raw.k : 9.5;
    const ca = typeof raw.ca === 'number' ? raw.ca : 52.1;
    const mg = typeof raw.mg === 'number' ? raw.mg : 22.9;
    const al = typeof raw.al === 'number' ? raw.al : 0;
    const h_al = typeof raw.h_al === 'number' ? raw.h_al : 43.43;
    
    const s = typeof raw.s === 'number' ? raw.s : 9;
    const b = typeof raw.b === 'number' ? raw.b : 0.48;
    const cu = typeof raw.cu === 'number' ? raw.cu : 12.8;
    const fe = typeof raw.fe === 'number' ? raw.fe : 30;
    const mn = typeof raw.mn === 'number' ? raw.mn : 107.4;
    const zn = typeof raw.zn === 'number' ? raw.zn : 7.2;

    const argila = typeof raw.argila === 'number' ? raw.argila : 62.5;
    const silte = typeof raw.silte === 'number' ? raw.silte : 21.2;
    const areia_grossa = raw.areia_grossa !== undefined ? raw.areia_grossa : 'ns';
    const areia_fina = raw.areia_fina !== undefined ? raw.areia_fina : 'ns';

    // Cálculos de soma de bases, CTC e saturações
    const sb = parseFloat((k + ca + mg).toFixed(2));
    const ctc_t = parseFloat((sb + h_al).toFixed(2));
    const v_percent = ctc_t > 0 ? parseFloat(((sb / ctc_t) * 100).toFixed(2)) : 0;

    // Relações e saturações catiônicas
    const ca_mg = mg > 0 ? parseFloat((ca / mg).toFixed(2)) : 0;
    const ca_k = k > 0 ? parseFloat((ca / k).toFixed(2)) : 0;
    const mg_k = k > 0 ? parseFloat((mg / k).toFixed(2)) : 0;

    const ca_t = ctc_t > 0 ? parseFloat(((ca / ctc_t) * 100).toFixed(2)) : 0;
    const mg_t = ctc_t > 0 ? parseFloat(((mg / ctc_t) * 100).toFixed(2)) : 0;
    const k_t = ctc_t > 0 ? parseFloat(((k / ctc_t) * 100).toFixed(2)) : 0;

    // Areia total automática (%)
    const areia_total = parseFloat((100 - (argila + silte)).toFixed(1));

    // CLAS. TEXTURA baseada no triângulo de texturas arenoso/argiloso brasileiro
    let clas_textura = 'ARGILOSO';
    if (argila > 60) {
      clas_textura = 'MUITO ARGILOSO';
    } else if (argila > 35) {
      clas_textura = 'ARGILOSO';
    } else if (argila > 15) {
      clas_textura = 'TEXTURA MEDIA';
    } else {
      clas_textura = 'ARENOSO';
    }

    const tipo_solo = raw.tipo_solo !== undefined ? String(raw.tipo_solo) : 'AD 4';

    return {
      pH: ph_cacl2,
      MO: parseFloat((mo / 10).toFixed(2)), // 36 g/dm³ = 3.6%
      P: p_res,
      K: k,
      Ca: ca,
      Mg: mg,
      Al: al,

      ph_cacl2,
      ph_h2o,
      ph_kcl,
      mo,
      p_meh,
      p_res,
      p_rem,
      k,
      ca,
      mg,
      al,
      h_al,
      sb,
      ctc_t,
      v_percent,
      s,
      ca_mg,
      ca_k,
      mg_k,
      b,
      cu,
      fe,
      mn,
      zn,
      ca_t,
      mg_t,
      k_t,
      argila,
      silte,
      areia_total,
      areia_grossa,
      areia_fina,
      clas_textura,
      tipo_solo
    };
  };

  // Auto-generate realistic agricultural soil analysis database results to save time
  const handleAutoGenerateCoherentResults = () => {
    const updated = points.map((p) => {
      if (!p.isCollected) {
        // Collect it now for previewing
        const today = new Date().toISOString().split('T')[0];
        p = { ...p, isCollected: true, collectionDate: today };
      }
      
      // Criamos variabilidade suave de acordo com as coordenadas do furo
      const latFactor = Math.sin((p.lat + 21.1) * 3140);
      const lngFactor = Math.cos((p.lng + 47.8) * 3140);
      
      const ph_cacl2 = parseFloat((5.7 + (latFactor + lngFactor) * 0.15).toFixed(2));
      const ph_h2o = parseFloat((ph_cacl2 + 0.6 + (latFactor - lngFactor) * 0.05).toFixed(2));
      const ph_kcl = 'ns';
      
      const mo = parseFloat((36 + (latFactor - lngFactor) * 3).toFixed(1));
      const p_meh = parseFloat((36.4 + (latFactor * lngFactor) * 8).toFixed(1));
      const p_res = parseFloat((76 + (latFactor * lngFactor) * 10).toFixed(1));
      const p_rem = 'ns';
      
      const k = parseFloat((9.5 + (lngFactor) * 1.5).toFixed(1));
      const ca = parseFloat((52.1 + (latFactor) * 8).toFixed(1));
      const mg = parseFloat((22.9 + (latFactor + lngFactor) * 4).toFixed(1));
      const al = ph_cacl2 < 5.0 ? parseFloat(Math.max(0, (5.2 - ph_cacl2) * 1.5).toFixed(1)) : 0;
      const h_al = parseFloat((43.43 + (latFactor - lngFactor) * 4).toFixed(2));
      
      const s = parseFloat((9.0 + (latFactor) * 1.5).toFixed(1));
      const b = parseFloat((0.48 + (lngFactor) * 0.08).toFixed(2));
      const cu = parseFloat((12.8 + (latFactor) * 2).toFixed(1));
      const fe = parseFloat((30.0 + (lngFactor) * 4).toFixed(1));
      const mn = parseFloat((107.4 + (latFactor) * 12).toFixed(1));
      const zn = parseFloat((7.2 + (lngFactor) * 1).toFixed(1));
      
      const argila = parseFloat((62.5 + (latFactor) * 4).toFixed(1));
      const silte = parseFloat((21.2 + (lngFactor) * 2).toFixed(1));
      
      const results = calculateSoilResults({
        ph_cacl2,
        ph_h2o,
        ph_kcl,
        mo,
        p_meh,
        p_res,
        p_rem,
        k,
        ca,
        mg,
        al,
        h_al,
        s,
        b,
        cu,
        fe,
        mn,
        zn,
        argila,
        silte,
        areia_grossa: 'ns',
        areia_fina: 'ns',
        tipo_solo: 'AD 4'
      });

      return { ...p, results };
    });

    onChangePoints(updated);
  };

  const handleUpdateField = (pointId: string, field: keyof SoilLabResults, val: string) => {
    const updated = points.map((p) => {
      if (p.id === pointId) {
        // Puxa ou inicializa resultados vazios de acordo com o padrão
        const currentRes = p.results || {
          pH: 5.7, MO: 3.6, P: 76, K: 9.5, Ca: 52.1, Mg: 22.9, Al: 0,
          ph_cacl2: 5.7, ph_h2o: 6.3, ph_kcl: 'ns', mo: 36, p_meh: 36.4,
          p_res: 76, p_rem: 'ns', k: 9.5, ca: 52.1, mg: 22.9, al: 0, h_al: 43.43,
          sb: 84.5, ctc_t: 127.93, v_percent: 66.05, s: 9, ca_mg: 2.28, ca_k: 5.48,
          mg_k: 2.41, b: 0.48, cu: 12.8, fe: 30, mn: 107.4, zn: 7.2,
          ca_t: 40.73, mg_t: 17.90, k_t: 7.43, argila: 62.5, silte: 21.2,
          areia_total: 16.3, areia_grossa: 'ns', areia_fina: 'ns',
          clas_textura: 'MUITO ARGILOSO', tipo_solo: 'AD 4'
        };

        let cleanVal: any = val;
        const stringFields = ['ph_kcl', 'p_rem', 'areia_grossa', 'areia_fina', 'clas_textura', 'tipo_solo'];
        
        if (!stringFields.includes(field)) {
          cleanVal = val === '' ? 0 : parseFloat(val);
          if (isNaN(cleanVal)) {
            cleanVal = 0;
          }
        }

        const rawUpdated = {
          ...currentRes,
          [field]: cleanVal
        };

        const results = calculateSoilResults(rawUpdated);

        return { 
          ...p, 
          isCollected: true, // Auto-marca para visualização se preencheu
          collectionDate: p.collectionDate || new Date().toISOString().split('T')[0],
          results 
        };
      }
      return p;
    });
    onChangePoints(updated);
  };

  const clearAllResults = () => {
    const updated = points.map((p) => ({
      ...p,
      results: undefined
    }));
    onChangePoints(updated);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 mb-5 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-lg text-slate-800">Resultados da Análise Química (Laboratório completo)</h3>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Visualização, preenchimento e simulação das variáveis físicas e químicas de cada furo de solo de acordo com a planilha padrão.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={clearAllResults}
            className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer"
          >
            Limpar Análises
          </button>
          <button
            type="button"
            onClick={handleAutoGenerateCoherentResults}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Simular Resultados Completos (Tabela)
          </button>
        </div>
      </div>

      {/* SELETOR DE CAMADAS / PROFUNDIDADES (Subamostras) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50 border border-slate-100 rounded-lg p-3.5 mb-5 shadow-inner">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-xs sm:text-sm">
            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Camada Ativa de Solo (Subamostras)</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Selecione a camada de solo para mapear e interpolar todos os dados químicos e físicos simultaneamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {soilLayers.map((layer) => {
            const isActive = layer === activeSoilLayer;
            return (
              <button
                key={layer}
                type="button"
                onClick={() => setActiveSoilLayer(layer)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {layer}
              </button>
            );
          })}

          {isAddingLayer ? (
            <form onSubmit={handleAddCustomLayer} className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Ex: 60-80cm"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                className="px-2 py-1 border border-indigo-200 rounded text-xs text-slate-700 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                autoFocus
              />
              <button
                type="submit"
                className="p-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded text-xs font-semibold cursor-pointer"
                title="Confirmar"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingLayer(false);
                  setNewLayerName('');
                }}
                className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-xs font-semibold cursor-pointer"
                title="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsAddingLayer(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-md text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Camada
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white md:max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
        <table className="w-full text-left text-xs text-slate-600 border-collapse table-fixed min-w-[2800px]">
          <colgroup>
            <col style={{ width: '144px', minWidth: '144px', maxWidth: '144px' }} />
            <col style={{ width: '112px', minWidth: '112px', maxWidth: '112px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '64px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '144px' }} />
            <col style={{ width: '112px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 shadow-sm">
            {/* Headers do Grupo de Propriedades */}
            <tr className="bg-slate-100 text-[10px] text-slate-600 font-bold uppercase tracking-wider border-b border-slate-300">
              <th colSpan={2} style={{ minWidth: '256px', maxWidth: '256px', width: '256px' }} className="py-2 px-3 bg-slate-200 text-slate-800 border-r border-slate-300 font-extrabold text-left sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                Furo / Coleta
              </th>
              <th colSpan={3} className="py-2 px-2 bg-red-105/80 text-red-900 border-r border-slate-300 text-center font-bold">
                Acidez e pH
              </th>
              <th colSpan={4} className="py-2 px-2 bg-amber-105/70 text-amber-900 border-r border-slate-300 text-center font-bold">
                Matéria Orgânica e Fósforo
              </th>
              <th colSpan={5} className="py-2 px-2 bg-sky-105/70 text-sky-900 border-r border-slate-300 text-center font-bold">
                Cátions de Troca (mmolc/dm³)
              </th>
              <th colSpan={3} className="py-2 px-2 bg-indigo-105/70 text-indigo-900 border-r border-slate-300 text-center font-bold">
                Cálculos do Solo
              </th>
              <th colSpan={12} className="py-2 px-2 bg-emerald-105/70 text-emerald-950 border-r border-slate-300 text-center font-bold">
                Micronutrientes (mg/dm³) e Relações Catiônicas
              </th>
              <th colSpan={5} className="py-2 px-2 bg-orange-105/65 text-orange-900 border-r border-slate-300 text-center font-bold">
                Granulometria Física (% de matéria seca)
              </th>
              <th colSpan={2} className="py-2 px-2 bg-fuchsia-105/70 text-fuchsia-950 text-center font-bold">
                Classificação Final
              </th>
            </tr>
            {/* Linha das Variáveis Individuais com Unidade de Grandeza */}
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold border-t border-slate-200 text-center">
              {/* Amostra */}
              <th style={{ minWidth: '144px', maxWidth: '144px', width: '144px' }} className="py-2 px-3 text-left w-36 bg-slate-50 border-r border-slate-200 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                Amostra
              </th>
              <th style={{ minWidth: '112px', maxWidth: '112px', width: '112px' }} className="py-2 px-2 w-28 bg-slate-50 border-r border-slate-300 sticky left-[144px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                Status
              </th>
              {/* pH */}
              <th className="py-2 px-1 w-20 bg-red-50/40 border-r border-slate-200">pH CaCl2</th>
              <th className="py-2 px-1 w-20 bg-red-50/40 border-r border-slate-200">pH H2O</th>
              <th className="py-2 px-1 w-20 bg-red-50/40 border-r border-slate-300">pH KCl</th>
              {/* M.O e Fósforo */}
              <th className="py-2 px-1 w-24 bg-amber-50/30 border-r border-slate-200">M.O.<br /><span className="text-[9px] font-normal text-slate-400">g/dm³</span></th>
              <th className="py-2 px-1 w-24 bg-amber-50/30 border-r border-slate-200">P meh<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-24 bg-amber-50/30 border-r border-slate-200">P res<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-24 bg-amber-50/30 border-r border-slate-300">P rem<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              {/* Cátions */}
              <th className="py-2 px-1 w-20 bg-sky-50/30 border-r border-slate-200">K+<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-sky-50/30 border-r border-slate-200">Ca 2+<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-sky-50/30 border-r border-slate-200">Mg 2+<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-sky-50/30 border-r border-slate-200">Al 3+<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-24 bg-sky-50/30 border-r border-slate-300">H+Al<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              {/* Índices */}
              <th className="py-2 px-1 w-24 bg-indigo-50/30 border-r border-slate-200">SB<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-24 bg-indigo-50/30 border-r border-slate-200">CTC (T)<br /><span className="text-[9px] font-normal text-slate-400">mmolc/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-indigo-50/30 border-r border-slate-300">V%<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              {/* Micronutrientes e Relações */}
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">S<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-200">Ca/Mg<br /><span className="text-[9px] font-normal text-slate-400">Relação</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-200">Ca/K<br /><span className="text-[9px] font-normal text-slate-400">Relação</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-200">Mg/K<br /><span className="text-[9px] font-normal text-slate-400">Relação</span></th>
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">B<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">Cu<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">Fe<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">Mn<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-20 bg-emerald-50/30 border-r border-slate-200">Zn<br /><span className="text-[9px] font-normal text-slate-400">mg/dm³</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-200">Ca/T<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-200">Mg/T<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-16 bg-emerald-50/30 border-r border-slate-300">K/T<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              {/* Física */}
              <th className="py-2 px-1 w-20 bg-orange-50/30 border-r border-slate-200">Argila<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-20 bg-orange-50/30 border-r border-slate-200">Silte<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-24 bg-orange-50/30 border-r border-slate-200">Areia Total<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-24 bg-orange-50/30 border-r border-slate-200">Areia Grossa<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              <th className="py-2 px-1 w-24 bg-orange-50/30 border-r border-slate-300">Areia Fina<br /><span className="text-[9px] font-normal text-slate-400">%</span></th>
              {/* Tipo */}
              <th className="py-2 px-1 w-36 bg-fuchsia-50/20 border-r border-slate-200">CLAS. TEXTURA</th>
              <th className="py-2 px-1 w-28 bg-fuchsia-50/20">TIPO SOLO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150">
            {points.map((p) => {
              // Valores reais com fallback seguro para chaves ausentes (evita 'undefined' para inputs controlados)
              const rawRes: Partial<SoilLabResults> = p.results || {};
              const res = {
                ph_cacl2: rawRes.ph_cacl2 ?? '',
                ph_h2o: rawRes.ph_h2o ?? '',
                ph_kcl: rawRes.ph_kcl ?? 'ns',
                mo: rawRes.mo ?? '',
                p_meh: rawRes.p_meh ?? '',
                p_res: rawRes.p_res ?? '',
                p_rem: rawRes.p_rem ?? 'ns',
                k: rawRes.k ?? '',
                ca: rawRes.ca ?? '',
                mg: rawRes.mg ?? '',
                al: rawRes.al ?? '',
                h_al: rawRes.h_al ?? '',
                sb: rawRes.sb ?? '',
                ctc_t: rawRes.ctc_t ?? '',
                v_percent: rawRes.v_percent ?? '',
                s: rawRes.s ?? '',
                ca_mg: rawRes.ca_mg ?? '',
                ca_k: rawRes.ca_k ?? '',
                mg_k: rawRes.mg_k ?? '',
                b: rawRes.b ?? '',
                cu: rawRes.cu ?? '',
                fe: rawRes.fe ?? '',
                mn: rawRes.mn ?? '',
                zn: rawRes.zn ?? '',
                ca_t: rawRes.ca_t ?? '',
                mg_t: rawRes.mg_t ?? '',
                k_t: rawRes.k_t ?? '',
                argila: rawRes.argila ?? '',
                silte: rawRes.silte ?? '',
                areia_total: rawRes.areia_total ?? '',
                areia_grossa: rawRes.areia_grossa ?? 'ns',
                areia_fina: rawRes.areia_fina ?? 'ns',
                clas_textura: rawRes.clas_textura ?? 'MUITO ARGILOSO',
                tipo_solo: rawRes.tipo_solo ?? 'AD 4'
              };

              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  {/* Identificação fixada à esquerda */}
                  <td style={{ minWidth: '144px', maxWidth: '144px', width: '144px' }} className="py-2 px-3 bg-slate-50 border-r border-slate-200 font-bold text-slate-850 text-left sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <span className="text-slate-900">Ponto {p.pointNumber}</span>
                    <span className="block text-[9px] font-mono text-slate-400 font-normal">
                      Lat: {p.lat.toFixed(5)}
                    </span>
                  </td>

                  <td style={{ minWidth: '112px', maxWidth: '112px', width: '112px' }} className="py-2 px-2 bg-slate-50 border-r border-slate-300 text-center sticky left-[144px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    {p.isCollected ? (
                      <span className="inline-flex text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase">
                        Pronto
                      </span>
                    ) : (
                      <span className="inline-flex text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                        Amostra
                      </span>
                    )}
                  </td>

                  {/* pH CaCl2 */}
                  <td className="py-1 px-1 text-center bg-red-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="5.7"
                      value={res.ph_cacl2}
                      onChange={(e) => handleUpdateField(p.id, 'ph_cacl2', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none"
                    />
                  </td>

                  {/* pH H2O */}
                  <td className="py-1 px-1 text-center bg-red-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="6.3"
                      value={res.ph_h2o}
                      onChange={(e) => handleUpdateField(p.id, 'ph_h2o', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none"
                    />
                  </td>

                  {/* pH KCl (String friendly) */}
                  <td className="py-1 px-1 text-center bg-red-50/10 border-r border-slate-300">
                    <input
                      type="text"
                      placeholder="ns"
                      value={res.ph_kcl}
                      onChange={(e) => handleUpdateField(p.id, 'ph_kcl', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none"
                    />
                  </td>

                  {/* MO (g/dm³) */}
                  <td className="py-1 px-1 text-center bg-amber-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="36"
                      value={res.mo}
                      onChange={(e) => handleUpdateField(p.id, 'mo', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                    />
                  </td>

                  {/* P meh */}
                  <td className="py-1 px-1 text-center bg-amber-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="36.4"
                      value={res.p_meh}
                      onChange={(e) => handleUpdateField(p.id, 'p_meh', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                    />
                  </td>

                  {/* P res */}
                  <td className="py-1 px-1 text-center bg-amber-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="76"
                      value={res.p_res}
                      onChange={(e) => handleUpdateField(p.id, 'p_res', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                    />
                  </td>

                  {/* P rem */}
                  <td className="py-1 px-1 text-center bg-amber-50/10 border-r border-slate-300">
                    <input
                      type="text"
                      placeholder="ns"
                      value={res.p_rem}
                      onChange={(e) => handleUpdateField(p.id, 'p_rem', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-amber-400 focus:outline-none"
                    />
                  </td>

                  {/* K+ */}
                  <td className="py-1 px-1 text-center bg-sky-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="9.5"
                      value={res.k}
                      onChange={(e) => handleUpdateField(p.id, 'k', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-805 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    />
                  </td>

                  {/* Ca 2+ */}
                  <td className="py-1 px-1 text-center bg-sky-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="52.1"
                      value={res.ca}
                      onChange={(e) => handleUpdateField(p.id, 'ca', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    />
                  </td>

                  {/* Mg 2+ */}
                  <td className="py-1 px-1 text-center bg-sky-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="22.9"
                      value={res.mg}
                      onChange={(e) => handleUpdateField(p.id, 'mg', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none font-medium"
                    />
                  </td>

                  {/* Al 3+ */}
                  <td className="py-1 px-1 text-center bg-sky-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0"
                      value={res.al}
                      onChange={(e) => handleUpdateField(p.id, 'al', e.target.value)}
                      className={`w-16 px-1.5 py-1 text-center bg-white border text-slate-800 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none ${res.al && Number(res.al) > 2 ? 'border-rose-300 text-rose-800 font-bold bg-rose-50' : 'border-slate-200'}`}
                    />
                  </td>

                  {/* H+Al */}
                  <td className="py-1 px-1 text-center bg-sky-50/10 border-r border-slate-300">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="43.43"
                      value={res.h_al}
                      onChange={(e) => handleUpdateField(p.id, 'h_al', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    />
                  </td>

                  {/* SB (Soma de Bases) - READ-ONLY */}
                  <td className="py-1 px-1 text-center bg-indigo-50/5 border-r border-slate-200">
                    <input
                      type="text"
                      value={res.sb !== '' && res.sb !== undefined ? Number(res.sb).toFixed(2) : '-'}
                      readOnly
                      className="w-20 px-1.5 py-1 text-center bg-slate-100 border border-slate-200/60 text-indigo-700 font-bold rounded cursor-not-allowed text-[11px]"
                      title="SB = K + Ca + Mg"
                    />
                  </td>

                  {/* CTC (T) - READ-ONLY */}
                  <td className="py-1 px-1 text-center bg-indigo-50/5 border-r border-slate-200">
                    <input
                      type="text"
                      value={res.ctc_t !== '' && res.ctc_t !== undefined ? Number(res.ctc_t).toFixed(2) : '-'}
                      readOnly
                      className="w-20 px-1.5 py-1 text-center bg-slate-100 border border-slate-200/60 text-slate-800 font-bold rounded cursor-not-allowed text-[11px]"
                      title="CTC Total (T) = SB + (H+Al)"
                    />
                  </td>

                  {/* V% - READ-ONLY */}
                  <td className="py-1 px-1 text-center bg-indigo-50/5 border-r border-slate-300">
                    <div className={`w-16 px-1 py-1 text-center rounded font-bold text-xs select-none mx-auto ${res.v_percent && Number(res.v_percent) >= 60 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-805 border border-rose-200'}`}>
                      {res.v_percent !== '' && res.v_percent !== undefined ? `${Number(res.v_percent).toFixed(1)}%` : '-'}
                    </div>
                  </td>

                  {/* S */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="9"
                      value={res.s}
                      onChange={(e) => handleUpdateField(p.id, 's', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Relação Ca/Mg (READ Only) */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-200 text-[11px] font-semibold text-slate-700">
                    <span className="inline-block bg-slate-50 border border-slate-200 px-1 py-0.5 rounded text-indigo-700">
                      {res.ca_mg !== '' && res.ca_mg !== undefined ? Number(res.ca_mg).toFixed(2) : '-'}
                    </span>
                  </td>

                  {/* Relação Ca/K (READ Only) */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-200 text-[11px] font-semibold text-slate-700">
                    <span className="inline-block bg-slate-50 border border-slate-200 px-1 py-0.5 rounded text-indigo-700">
                      {res.ca_k !== '' && res.ca_k !== undefined ? Number(res.ca_k).toFixed(2) : '-'}
                    </span>
                  </td>

                  {/* Relação Mg/K (READ Only) */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-200 text-[11px] font-semibold text-slate-700">
                    <span className="inline-block bg-slate-50 border border-slate-200 px-1 py-0.5 rounded text-indigo-700">
                      {res.mg_k !== '' && res.mg_k !== undefined ? Number(res.mg_k).toFixed(2) : '-'}
                    </span>
                  </td>

                  {/* B */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.48"
                      value={res.b}
                      onChange={(e) => handleUpdateField(p.id, 'b', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Cu */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="12.8"
                      value={res.cu}
                      onChange={(e) => handleUpdateField(p.id, 'cu', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Fe */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="1"
                      placeholder="30"
                      value={res.fe}
                      onChange={(e) => handleUpdateField(p.id, 'fe', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Mn */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="107.4"
                      value={res.mn}
                      onChange={(e) => handleUpdateField(p.id, 'mn', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Zn */}
                  <td className="py-1 px-1 text-center bg-emerald-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="7.2"
                      value={res.zn}
                      onChange={(e) => handleUpdateField(p.id, 'zn', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Ca/T % - computed */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-200 text-[10px] text-gray-500 font-medium">
                    {res.ca_t !== '' && res.ca_t !== undefined ? `${Number(res.ca_t).toFixed(1)}%` : '-'}
                  </td>

                  {/* Mg/T % - computed */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-200 text-[10px] text-gray-500 font-medium">
                    {res.mg_t !== '' && res.mg_t !== undefined ? `${Number(res.mg_t).toFixed(1)}%` : '-'}
                  </td>

                  {/* K/T % - computed */}
                  <td className="py-1 px-1 text-center bg-emerald-50/5 border-r border-slate-300 text-[10px] text-gray-500 font-medium font-bold">
                    {res.k_t !== '' && res.k_t !== undefined ? `${Number(res.k_t).toFixed(1)}%` : '-'}
                  </td>

                  {/* Argila (%) */}
                  <td className="py-1 px-1 text-center bg-orange-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="62.5"
                      value={res.argila}
                      onChange={(e) => handleUpdateField(p.id, 'argila', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none font-semibold"
                    />
                  </td>

                  {/* Silte (%) */}
                  <td className="py-1 px-1 text-center bg-orange-50/10 border-r border-slate-200">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="21.2"
                      value={res.silte}
                      onChange={(e) => handleUpdateField(p.id, 'silte', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none"
                    />
                  </td>

                  {/* Areia Total (%) - computed */}
                  <td className="py-1 px-1 text-center bg-orange-50/5 border-r border-slate-200">
                    <input
                      type="text"
                      value={res.areia_total !== '' && res.areia_total !== undefined ? `${Number(res.areia_total).toFixed(1)}%` : '-'}
                      readOnly
                      className="w-16 px-1 py-1 text-center bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded cursor-not-allowed text-[11px]"
                      title="Areia Total = 100 - (Argila + Silte)"
                    />
                  </td>

                  {/* Areia Grossa (string friendly like "ns") */}
                  <td className="py-1 px-1 text-center bg-orange-50/10 border-r border-slate-200">
                    <input
                      type="text"
                      placeholder="ns"
                      value={res.areia_grossa}
                      onChange={(e) => handleUpdateField(p.id, 'areia_grossa', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none"
                    />
                  </td>

                  {/* Areia Fina (string friendly) */}
                  <td className="py-1 px-1 text-center bg-orange-50/10 border-r border-slate-300">
                    <input
                      type="text"
                      placeholder="ns"
                      value={res.areia_fina}
                      onChange={(e) => handleUpdateField(p.id, 'areia_fina', e.target.value)}
                      className="w-16 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none"
                    />
                  </td>

                  {/* Classificação Textural - computed */}
                  <td className="py-1 px-2 text-center bg-fuchsia-50/5 border-r border-slate-200">
                    <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-purple-100 border border-purple-200 text-purple-800 truncate max-w-full">
                      {res.clas_textura || 'ARGILOSO'}
                    </span>
                  </td>

                  {/* Tipo solo (text input) */}
                  <td className="py-1 px-2 text-center bg-fuchsia-50/5">
                    <input
                      type="text"
                      placeholder="AD 4"
                      value={res.tipo_solo}
                      onChange={(e) => handleUpdateField(p.id, 'tipo_solo', e.target.value)}
                      className="w-20 px-1.5 py-1 text-center bg-white border border-slate-200 text-slate-800 rounded focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400 focus:outline-none font-bold"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
