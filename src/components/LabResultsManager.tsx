import React, { useState } from 'react';
import { SamplingPoint, SoilLabResults } from '../types';
import { Beaker, Eye, Plus, Check, RefreshCw, Undo, Save, Layers, X, Upload, FileText, Info, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';

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

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedCSV, setPastedCSV] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{ pointNumber: number; values: { field: string; displayField: string; parsedVal: number | string }[] }[]>([]);
  const [parsedPointsRaw, setParsedPointsRaw] = useState<Record<number, Partial<SoilLabResults>>>({});

  const handleDownloadCSVTemplate = () => {
    const headers = [
      'Ponto', 'pH_CaCl2', 'pH_H2O', 'M.O._g_dm3', 'P_res_mg_dm3',
      'K_mmolc_dm3', 'Ca_mmolc_dm3', 'Mg_mmolc_dm3', 'Al_mmolc_dm3',
      'H+Al_mmolc_dm3', 'S_mg_dm3', 'B_mg_dm3', 'Cu_mg_dm3', 'Fe_mg_dm3',
      'Mn_mg_dm3', 'Zn_mg_dm3', 'Argila_percent', 'Silte_percent', 'Tipo_Solo'
    ];
    
    let csvRows = [headers.join(';')];
    
    const activePoints = points && points.length > 0 ? points : Array.from({ length: 5 }, (_, i) => ({ pointNumber: i + 1 }));
    
    activePoints.forEach((p) => {
      const currentRes = (p as any).results || {};
      const row = [
        p.pointNumber,
        (currentRes.ph_cacl2 ?? 5.70).toString().replace('.', ','),
        (currentRes.ph_h2o ?? 6.30).toString().replace('.', ','),
        (currentRes.mo ?? 36.00).toString().replace('.', ','),
        (currentRes.p_res ?? 76.00).toString().replace('.', ','),
        (currentRes.k ?? 9.50).toString().replace('.', ','),
        (currentRes.ca ?? 52.10).toString().replace('.', ','),
        (currentRes.mg ?? 22.90).toString().replace('.', ','),
        (currentRes.al ?? 0.00).toString().replace('.', ','),
        (currentRes.h_al ?? 43.43).toString().replace('.', ','),
        (currentRes.s ?? 9.00).toString().replace('.', ','),
        (currentRes.b ?? 0.48).toString().replace('.', ','),
        (currentRes.cu ?? 12.80).toString().replace('.', ','),
        (currentRes.fe ?? 30.00).toString().replace('.', ','),
        (currentRes.mn ?? 107.40).toString().replace('.', ','),
        (currentRes.zn ?? 7.20).toString().replace('.', ','),
        (currentRes.argila ?? 62.50).toString().replace('.', ','),
        (currentRes.silte ?? 21.20).toString().replace('.', ','),
        (currentRes.tipo_solo ?? 'AD 4')
      ];
      csvRows.push(row.join(';'));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `modelo_analise_laboratorio_furos.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSVText = (text: string) => {
    setIsAddingLayer(false);
    setImportError(null);
    
    if (!text.trim()) {
      setImportError('O arquivo ou texto está vazio.');
      return;
    }
    
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      setImportError('O arquivo deve conter pelo menos uma linha de cabeçalho e uma linha de dados.');
      return;
    }
    
    const firstLine = lines[0];
    const delimiter = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
    
    const splitWithQuotes = (row: string) => {
      let result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    const headers = splitWithQuotes(firstLine).map(h => h.replace(/^["']|["']$/g, '').trim());
    
    const normalizeHeader = (h: string): string => {
      let norm = h.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_+\-*.]/g, ''); // Preserva o ponto (.) para chaves como 'm.o.'
      
      // Remover sufixos de unidades que geram falsos positivos de colisão de substring (ex: '_mg_dm3' contém 'mg')
      norm = norm
        .replace(/_mg_dm3$/, '')
        .replace(/_mg_dm3_t$/, '')
        .replace(/_g_dm3$/, '')
        .replace(/_mmolc_dm3$/, '')
        .replace(/_percent$/, '')
        .replace(/_percento$/, '')
        .replace(/_pct$/, '')
        .replace(/_pctg$/, '')
        .replace(/_t_ha$/, '')
        .replace(/_ppm$/, '')
        .replace(/_mgdm3$/, '')
        .replace(/_mmolcdm3$/, '');
        
      return norm;
    };
    
    const headerMappings: Record<string, keyof SoilLabResults> = {
      'ponto': 'pointNumber' as any,
      'amostra': 'pointNumber' as any,
      'furo': 'pointNumber' as any,
      'id': 'pointNumber' as any,
      'ph': 'ph_cacl2',
      'ph_cacl2': 'ph_cacl2',
      'ph-cacl2': 'ph_cacl2',
      'ph_h2o': 'ph_h2o',
      'ph-h2o': 'ph_h2o',
      'ph_kcl': 'ph_kcl',
      'mo': 'mo',
      'mo_g_dm3': 'mo',
      'm.o.': 'mo',
      'm_o': 'mo',
      'materia_organica': 'mo',
      'materia organica': 'mo',
      'p': 'p_res',
      'p_res': 'p_res',
      'p-res': 'p_res',
      'p_meh': 'p_meh',
      'p_rem': 'p_rem',
      'k': 'k',
      'k+': 'k',
      'potassio': 'k',
      'ca': 'ca',
      'ca2+': 'ca',
      'ca 2+': 'ca',
      'calcio': 'ca',
      'mg': 'mg',
      'mg2+': 'mg',
      'mg 2+': 'mg',
      'magnesio': 'mg',
      'al': 'al',
      'al3+': 'al',
      'al 3+': 'al',
      'aluminio': 'al',
      'h_al': 'h_al',
      'h+al': 'h_al',
      'h-al': 'h_al',
      'acidez_potencial': 'h_al',
      's': 's',
      'enxofre': 's',
      'b': 'b',
      'boro': 'b',
      'cu': 'cu',
      'cobre': 'cu',
      'fe': 'fe',
      'ferro': 'fe',
      'mn': 'mn',
      'manganes': 'mn',
      'zn': 'zn',
      'zinco': 'zn',
      'argila': 'argila',
      'silte': 'silte',
      'areia': 'areia_total',
      'areia_total': 'areia_total',
      'areia_grossa': 'areia_grossa',
      'areia_fina': 'areia_fina',
      'tipo_solo': 'tipo_solo'
    };
    
    const mappedCols: { header: string; field: keyof SoilLabResults | 'pointNumber'; index: number }[] = [];
    
    headers.forEach((h, idx) => {
      const norm = normalizeHeader(h);
      let field: any = undefined;
      
      if (headerMappings[norm]) {
        field = headerMappings[norm];
      } else {
        // Fallback robusto para evitar colisão de substrings pequenas em unidades de medida (ex: 'mg' de magnésio dentro do sufixo '_mg_')
        const matchedKey = Object.keys(headerMappings).find(k => {
          if (k === norm) return true;
          // Permite de forma precisa se começa ou termina com a chave delimitada por underscores
          if (norm.startsWith(k + '_') || norm.endsWith('_' + k)) {
            return true;
          }
          // Para chaves mais longas (tamanho > 3), permite uma busca livre por substring se precedida/sucedida por underscore
          if (k.length > 3 && norm.includes('_' + k + '_')) {
            return true;
          }
          return false;
        });
        if (matchedKey) {
          field = headerMappings[matchedKey];
        }
      }
      
      if (field) {
        mappedCols.push({ header: h, field, index: idx });
      }
    });
    
    const pointCol = mappedCols.find(c => c.field === 'pointNumber');
    if (!pointCol) {
      setImportError('Não foi possível identificar a coluna de Identificação do Ponto (ex: Ponto, Amostra, Furo) no cabeçalho do arquivo CSV.');
      return;
    }
    
    const resultsByPoint: Record<number, Partial<SoilLabResults>> = {};
    const previewRows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const rowContent = splitWithQuotes(lines[i]).map(c => c.replace(/^["']|["']$/g, '').trim());
      if (rowContent.length === 0 || (rowContent.length === 1 && !rowContent[0])) {
        continue;
      }
      
      const rawPointNumStr = rowContent[pointCol.index];
      if (!rawPointNumStr) continue;
      
      const pointNumMatch = rawPointNumStr.match(/\d+/);
      if (!pointNumMatch) continue;
      const pointNum = parseInt(pointNumMatch[0]);
      
      const rValues: Partial<SoilLabResults> = {};
      const displayValues: any[] = [];
      
      mappedCols.forEach(col => {
        if (col.field === 'pointNumber') return;
        
        const rawVal = rowContent[col.index];
        if (rawVal === undefined || rawVal === '') return;
        
        const fieldName = col.field as keyof SoilLabResults;
        const isStringField = ['ph_kcl', 'p_rem', 'areia_grossa', 'areia_fina', 'tipo_solo'].includes(fieldName);
        
        if (isStringField) {
          (rValues as any)[fieldName] = rawVal;
          displayValues.push({ field: fieldName, displayField: col.header, parsedVal: rawVal });
        } else {
          const numVal = parseFloat(rawVal.replace(',', '.'));
          if (!isNaN(numVal)) {
            (rValues as any)[fieldName] = numVal;
            displayValues.push({ field: fieldName, displayField: col.header, parsedVal: numVal });
          }
        }
      });
      
      resultsByPoint[pointNum] = rValues;
      previewRows.push({
        pointNumber: pointNum,
        values: displayValues
      });
    }
    
    if (Object.keys(resultsByPoint).length === 0) {
      setImportError('Nenhum dado válido de furos pôde ser extraído das linhas do arquivo CSV.');
      return;
    }
    
    setParsedPointsRaw(resultsByPoint);
    setParsedPreview(previewRows);
  };

  const handleConfirmImport = () => {
    const updated = points.map((p) => {
      const importData = parsedPointsRaw[p.pointNumber];
      if (importData) {
        const mergedRaw = {
          ...(p.results || {}),
          ...importData
        };
        
        const results = calculateSoilResults(mergedRaw);
        
        return {
          ...p,
          isCollected: true,
          collectionDate: p.collectionDate || new Date().toISOString().split('T')[0],
          results
        };
      }
      return p;
    });
    
    onChangePoints(updated);
    setIsImportModalOpen(false);
    setPastedCSV('');
    setParsedPreview([]);
    setParsedPointsRaw({});
  };

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
    // Helper para verificar/fazer parse de números reais
    const parseNum = (v: any): number | null => {
      if (v === undefined || v === null || v === '' || v === 'ns') return null;
      const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      return isNaN(num) ? null : num;
    };

    // Helper para arredondamento
    const roundTo = (val: number, decimals: number): number => {
      return parseFloat(val.toFixed(decimals));
    };

    const ph_cacl2 = parseNum(raw.ph_cacl2) ?? 'ns';
    const ph_h2o = parseNum(raw.ph_h2o) ?? 'ns';
    const ph_kcl = raw.ph_kcl !== undefined && raw.ph_kcl !== '' ? raw.ph_kcl : 'ns';
    const mo = parseNum(raw.mo) ?? 'ns';
    const p_meh = parseNum(raw.p_meh) ?? 'ns';
    const p_res = parseNum(raw.p_res) ?? 'ns';
    const p_rem = raw.p_rem !== undefined && raw.p_rem !== '' ? raw.p_rem : 'ns';
    
    const k_val = parseNum(raw.k);
    const ca_val = parseNum(raw.ca);
    const mg_val = parseNum(raw.mg);
    const al_val = parseNum(raw.al);
    const h_al_val = parseNum(raw.h_al);

    const k = k_val ?? 'ns';
    const ca = ca_val ?? 'ns';
    const mg = mg_val ?? 'ns';
    const al = al_val ?? 'ns';
    const h_al = h_al_val ?? 'ns';
    
    const s = parseNum(raw.s) ?? 'ns';
    const b = parseNum(raw.b) ?? 'ns';
    const cu = parseNum(raw.cu) ?? 'ns';
    const fe = parseNum(raw.fe) ?? 'ns';
    const mn = parseNum(raw.mn) ?? 'ns';
    const zn = parseNum(raw.zn) ?? 'ns';

    const argila_val = parseNum(raw.argila);
    const silte_val = parseNum(raw.silte);
    
    const argila = argila_val ?? 'ns';
    const silte = silte_val ?? 'ns';
    const areia_grossa = raw.areia_grossa !== undefined && raw.areia_grossa !== '' ? raw.areia_grossa : 'ns';
    const areia_fina = raw.areia_fina !== undefined && raw.areia_fina !== '' ? raw.areia_fina : 'ns';

    // Cálculos de soma de bases, CTC e saturações
    const sb = (k_val !== null && ca_val !== null && mg_val !== null)
      ? roundTo(k_val + ca_val + mg_val, 2)
      : 'ns';

    const ctc_t = (sb !== 'ns' && h_al_val !== null)
      ? roundTo(sb + h_al_val, 2)
      : 'ns';

    const v_percent = (ctc_t !== 'ns' && ctc_t > 0 && sb !== 'ns')
      ? roundTo((sb / ctc_t) * 100, 2)
      : 'ns';

    // Relações e saturações catiônicas
    const ca_mg = (ca_val !== null && mg_val !== null && mg_val > 0)
      ? roundTo(ca_val / mg_val, 2)
      : 'ns';

    const ca_k = (ca_val !== null && k_val !== null && k_val > 0)
      ? roundTo(ca_val / k_val, 2)
      : 'ns';

    const mg_k = (mg_val !== null && k_val !== null && k_val > 0)
      ? roundTo(mg_val / k_val, 2)
      : 'ns';

    const ca_t = (ctc_t !== 'ns' && ctc_t > 0 && ca_val !== null)
      ? roundTo((ca_val / ctc_t) * 100, 2)
      : 'ns';

    const mg_t = (ctc_t !== 'ns' && ctc_t > 0 && mg_val !== null)
      ? roundTo((mg_val / ctc_t) * 100, 2)
      : 'ns';

    const k_t = (ctc_t !== 'ns' && ctc_t > 0 && k_val !== null)
      ? roundTo((k_val / ctc_t) * 100, 2)
      : 'ns';

    // Areia total automática (%)
    const areia_total = (argila_val !== null && silte_val !== null)
      ? roundTo(100 - (argila_val + silte_val), 1)
      : 'ns';

    // CLAS. TEXTURA baseada no triângulo de texturas arenoso/argiloso brasileiro
    let clas_textura = 'ns';
    if (argila_val !== null) {
      if (argila_val > 60) {
        clas_textura = 'MUITO ARGILOSO';
      } else if (argila_val > 35) {
        clas_textura = 'ARGILOSO';
      } else if (argila_val > 15) {
        clas_textura = 'TEXTURA MEDIA';
      } else {
        clas_textura = 'ARENOSO';
      }
    }

    const tipo_solo = raw.tipo_solo !== undefined && raw.tipo_solo !== '' ? String(raw.tipo_solo) : 'AD 4';

    // Campos legados para compatibilidade com mapas e gráficos (sempre números com fallbacks coerentes)
    const legacy_ph = typeof ph_cacl2 === 'number' ? ph_cacl2 : (typeof ph_h2o === 'number' ? ph_h2o : 5.7);
    const legacy_mo = typeof mo === 'number' ? roundTo(mo / 10, 2) : 3.6;
    const legacy_p = typeof p_res === 'number' ? p_res : (typeof p_meh === 'number' ? p_meh : 76);
    const legacy_k = typeof k === 'number' ? k : 9.5;
    const legacy_ca = typeof ca === 'number' ? ca : 52.1;
    const legacy_mg = typeof mg === 'number' ? mg : 22.9;
    const legacy_al = typeof al === 'number' ? al : 0;

    return {
      pH: legacy_ph,
      MO: legacy_mo,
      P: legacy_p,
      K: legacy_k,
      Ca: legacy_ca,
      Mg: legacy_mg,
      Al: legacy_al,

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
        const currentRes = p.results || {};

        let cleanVal: any = val;
        const stringFields = ['ph_kcl', 'p_rem', 'areia_grossa', 'areia_fina', 'clas_textura', 'tipo_solo'];
        
        if (!stringFields.includes(field)) {
          if (val === '' || val === 'ns') {
            cleanVal = 'ns';
          } else {
            cleanVal = parseFloat(val);
            if (isNaN(cleanVal)) {
              cleanVal = 'ns';
            }
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
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:shadow-sm cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Laudo de Laboratório (.csv)
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

      {/* MODAL DE IMPORTAÇÃO DE LAUDO DO LABORATÓRIO */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-heading">
                <div className="p-2 bg-emerald-50 rounded bg-emerald-100/60 border border-emerald-205 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Importar Análises do Laboratório</h3>
                  <p className="text-slate-500 text-xs mt-0.5">Importe de planilhas CSV, Excel ou cole dados tabulares enviados pelo laboratório.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setPastedCSV('');
                  setParsedPreview([]);
                  setImportError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              
              {/* Modelo & Orientações */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-indigo-50/50 border border-indigo-100 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-indigo-650 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-indigo-950 text-xs">Instruções para Importação</p>
                      <ul className="list-disc list-inside mt-1.5 space-y-1 text-[11px] text-indigo-900 leading-relaxed">
                        <li>Certifique-se de que a planilha possui cabeçalhos para cada variável do laboratório.</li>
                        <li>A coluna do identificador do ponto deve conter as palavras <strong>Ponto</strong>, <strong>Amostra</strong> ou <strong>Furo</strong>.</li>
                        <li>O sistema identificará furos existentes por número (ex: "Furo 1" ou "1" correspondem ao Ponto 1).</li>
                        <li>Semicólons (<code>;</code>) ou vírgulas (<code>,</code>) são suportados como delimitados, e números podem usar vírgula como decimal (<code>5,70</code>).</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-205 rounded-lg p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Planilha Modelo</p>
                    <p className="text-slate-500 text-[11px]">Baixe um arquivo de exemplo com o formato exato preenchível.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadCSVTemplate}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-md text-xs font-semibold cursor-pointer transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Modelo CSV</span>
                  </button>
                </div>
              </div>

              {/* Área de Entrada (Upload de arquivo ou Paste de Texto) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Upload via Arquivo com Drag n Drop */}
                <div className="flex flex-col space-y-1.5">
                  <label className="font-semibold text-slate-700">1. Enviar Arquivo CSV</label>
                  <div 
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const text = event.target?.result as string;
                          setPastedCSV(text);
                          parseCSVText(text);
                        };
                        reader.readAsText(file);
                      }
                    }}
                    className="flex-1 min-h-[140px] border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/20 rounded-xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all relative group"
                  >
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const text = event.target?.result as string;
                            setPastedCSV(text);
                            parseCSVText(text);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                    <p className="font-semibold text-slate-700 text-xs">Arraste seu CSV aqui ou clique para buscar</p>
                    <p className="text-[10px] text-slate-500 mt-1">Aceita arquivos codificados em UTF-8 (.csv)</p>
                  </div>
                </div>

                {/* Copiar e colar direto */}
                <div className="flex flex-col space-y-1.5">
                  <label className="font-semibold text-slate-700">Ou colar dados tabulares aqui</label>
                  <textarea
                    placeholder="Ponto;pH_CaCl2;M.O.;P_res;K;Ca;Mg;Al;H_Al;Argila;Silte&#10;1;5,70;36,00;76,00;9,50;52,10;22,90;0,00;43,43;62,50;21,20&#10;2;5,60;35,50;72,00;9,10;51,00;22,00;0,10;45,00;61,00;22,00"
                    value={pastedCSV}
                    onChange={(e) => {
                      setPastedCSV(e.target.value);
                      parseCSVText(e.target.value);
                    }}
                    className="w-full flex-1 h-[140px] px-3 py-2 border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono text-[11px] bg-white text-slate-805 leading-normal"
                  />
                </div>
              </div>

              {/* Erro de importação se houver */}
              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-xs">Erro de Estrutura do CSV</p>
                    <p className="text-[11px] leading-tight mt-0.5">{importError}</p>
                  </div>
                </div>
              )}

              {/* Preview dos dados identificados */}
              {parsedPreview.length > 0 && !importError && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800 text-xs">2. Resumo de Dados Identificados</p>
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-2 py-0.5 rounded text-[10px]">
                      {parsedPreview.length} furos reconhecidos
                    </span>
                  </div>
                  
                  <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-inner max-h-[160px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase">
                          <th className="py-1.5 px-3">Ponto Alvo</th>
                          <th className="py-1.5 px-3">Atributos Extraídos</th>
                          <th className="py-1.5 px-3 text-center">Status no Talhão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-600">
                        {parsedPreview.map((pt) => {
                          const existsInPlot = points.some(p => p.pointNumber === pt.pointNumber);
                          return (
                            <tr key={pt.pointNumber} className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-bold text-slate-900">
                                Ponto {pt.pointNumber}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-slate-500 break-all">
                                {pt.values.map((v: any) => `${v.displayField}: ${v.parsedVal}`).join(' | ')}
                              </td>
                              <td className="py-1.5 px-3 text-center">
                                {existsInPlot ? (
                                  <span className="inline-flex text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded uppercase">
                                    Encontrado
                                  </span>
                                ) : (
                                  <span className="inline-flex text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded uppercase" title="Este furo não existe no desenho atual do talhão e será ignorado na importação.">
                                    Ponto Extra
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-slate-500 font-medium">
                Os dados importados substituirão as análises dos furos correspondentes.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setPastedCSV('');
                    setParsedPreview([]);
                    setImportError(null);
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-150 active:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={parsedPreview.length === 0 || !!importError}
                  onClick={handleConfirmImport}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm select-none transition-all cursor-pointer ${
                    parsedPreview.length === 0 || !!importError
                      ? 'bg-slate-200 text-slate-400 border border-slate-200 pointer-events-none cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border border-emerald-600'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar Importação</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
