import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
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
  ExternalLink,
  Layers
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
  activeSoilLayer?: string;
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

  const parseNum = (v: any, fallback: number = 0): number => {
    if (v === undefined || v === null || v === '' || v === 'ns') return fallback;
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isNaN(num) ? fallback : num;
  };

  const pH = parseNum(p.results.pH ?? p.results.ph_h2o ?? p.results.ph_cacl2, 5.5);
  const Ca = parseNum(p.results.Ca ?? p.results.ca, 0);
  const Mg = parseNum(p.results.Mg ?? p.results.mg, 0);
  const K = parseNum(p.results.K ?? p.results.k, 0);
  const P = parseNum(p.results.P ?? p.results.p_meh ?? p.results.p_res, 0);

  const hAl = parseNum(p.results.h_al ?? Math.max(0.2, parseFloat((12.0 - 1.8 * pH).toFixed(2))));
  const T = parseNum(p.results.ctc_t ?? (Ca + Mg + K + hAl));
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
  activeSoilLayer = '0-20cm',
}: AIPanelProps) {
  // Local state for recommendation inputs to allow responsive editing before saving
  const [localPoints, setLocalPoints] = useState<SamplingPoint[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [showConfigHelper, setShowConfigHelper] = useState<boolean>(true);
  const [selectedPoint, setSelectedPoint] = useState<SamplingPoint | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);

  const [localDesiredV2, setLocalDesiredV2] = useState<number>(70);
  const [localPrnt, setLocalPrnt] = useState<number>(80);
  const [showPrintIframeWarning, setShowPrintIframeWarning] = useState<boolean>(false);

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

  const printTotals = useMemo(() => {
    let dolomiticoSum = 0;
    let calciticoSum = 0;
    let gessoSum = 0;
    let mapSum = 0;
    let kclSum = 0;
    let formuladoSum = 0;
    let count = 0;

    localPoints.forEach(p => {
      if (!p.results) return;
      count++;
      const savedRec = p.recommendations || {};
      const autoRecs = calculateAutoRecs(p, plot.cropType, desiredV2, prnt);

      dolomiticoSum += savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0);
      calciticoSum += savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0);
      gessoSum += savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng;
      mapSum += savedRec.map !== undefined ? savedRec.map : autoRecs.map;
      kclSum += savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl;
      formuladoSum += savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado;
    });

    const area = plot.areaHectares || 1;
    const avgDolomitico = count > 0 ? dolomiticoSum / count : 0;
    const avgCalcitico = count > 0 ? calciticoSum / count : 0;
    const avgGesso = count > 0 ? gessoSum / count : 0;
    const avgMap = count > 0 ? mapSum / count : 0;
    const avgKcl = count > 0 ? kclSum / count : 0;
    const avgFormulado = count > 0 ? formuladoSum / count : 0;

    return {
      count,
      area,
      avgDolomitico,
      avgCalcitico,
      avgGesso,
      avgMap,
      avgKcl,
      avgFormulado,
      totDolomitico: avgDolomitico * area,
      totCalcitico: avgCalcitico * area,
      totGesso: avgGesso * area,
      totMap: avgMap * area,
      totKcl: avgKcl * area,
      totFormulado: avgFormulado * area
    };
  }, [localPoints, plot.cropType, desiredV2, prnt, plot.areaHectares]);

  const handleCopyReportText = () => {
    let text = `LAUDO TÉCNICO DE RECOMENDAÇÃO AGRONÔMICA - GEOSOLO PRO\n`;
    text += `Cliente: ${client.name}\n`;
    text += `Fazenda: ${farm.name} (${farm.city} - ${farm.state})\n`;
    text += `Talhão: ${plot.name} (${plot.areaHectares} ha) - Cultura: ${plot.cropType}\n`;
    text += `Camada Analisada: ${activeSoilLayer} - PRNT: ${prnt}% - V2: ${desiredV2}%\n\n`;
    
    text += `Ponto;Calc. Dolomítico(t/ha);Calc. Calcítico(t/ha);Gesso(t/ha);MAP(kg/ha);KCl(kg/ha);Formulado 12-15-15(kg/ha)\n`;
    localPoints.sort((a,b) => a.pointNumber - b.pointNumber).forEach(p => {
      if (!p.results) return;
      const savedRec = p.recommendations || {};
      const autoRecs = calculateAutoRecs(p, plot.cropType, desiredV2, prnt);
      const cd = (savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0)).toFixed(1);
      const cc = (savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0)).toFixed(1);
      const g = (savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng).toFixed(1);
      const mapVal = Math.round(savedRec.map !== undefined ? savedRec.map : autoRecs.map);
      const kclVal = Math.round(savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl);
      const form = Math.round(savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado);
      
      text += `F-${p.pointNumber};${cd};${cc};${g};${mapVal};${kclVal};${form}\n`;
    });

    text += `\nCONSOLIDADO DE INSUMOS (Talhão Inteiro):\n`;
    text += `- Calcário Dolomítico Total: ${printTotals.totDolomitico.toFixed(1)} t (Média: ${printTotals.avgDolomitico.toFixed(1)} t/ha)\n`;
    text += `- Calcário Calcítico Total: ${printTotals.totCalcitico.toFixed(1)} t (Média: ${printTotals.avgCalcitico.toFixed(1)} t/ha)\n`;
    text += `- Gesso Agrícola Total: ${printTotals.totGesso.toFixed(1)} t (Média: ${printTotals.avgGesso.toFixed(1)} t/ha)\n`;
    text += `- Super MAP Total: ${(printTotals.totMap/1000).toFixed(2)} t (${Math.round(printTotals.totMap)} kg)\n`;
    text += `- Cloreto KCl Total: ${(printTotals.totKcl/1000).toFixed(2)} t (${Math.round(printTotals.totKcl)} kg)\n`;
    text += `- NPK 12-15-15 Total: ${(printTotals.totFormulado/1000).toFixed(2)} t (${Math.round(printTotals.totFormulado)} kg)\n`;

    navigator.clipboard.writeText(text).then(() => {
      alert('Resumo do laudo técnico copiado com sucesso para a sua área de transferência!');
    }).catch(err => {
      console.warn('Erro ao copiar texto:', err);
    });
  };

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

  // Helper to generate a high-fidelity client-side PDF using jsPDF
  const handlePrintLaudo = () => {
    try {
      const doc = new jsPDF("p", "mm", "a4");

      // Set document details
      doc.setProperties({
        title: `Laudo Tecnico ${plot.name}`,
        subject: 'Recomendação Agronômica - GeoSolo Pro',
        author: 'GeoSolo Pro',
        creator: 'GeoSolo Pro'
      });

      const primaryColor = [5, 150, 105]; // emerald-600
      const slateDark = [15, 23, 42]; // slate-900
      const slateMedium = [71, 85, 105]; // slate-600
      const slateLight = [241, 245, 249]; // slate-100
      const borderGray = [226, 232, 240]; // slate-200

      let y = 15;

      // Draw brand strip
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(15, y, 180, 4, 'F');
      
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text("GeoSolo Pro", 15, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text("LAUDO TÉCNICO DE RECOMENDAÇÃO AGRONÔMICA PONTO A PONTO", 15, y + 5);

      const emitDate = new Date().toLocaleDateString('pt-BR');
      const docCode = plot.id?.substring(0, 8).toUpperCase() || 'PL-RECS';
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text(`EMISSÃO: ${emitDate}`, 195, y, { align: 'right' });
      doc.text(`CÓDIGO: ${docCode}`, 195, y + 5, { align: 'right' });

      // Draw dividing thin line
      y += 9;
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.5);
      doc.line(15, y, 195, y);

      // Section: Metadata card
      y += 6;
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(15, y, 180, 26, 2, 2, 'F');
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(15, y, 180, 26, 2, 2, 'S');

      const colX = [18, 63, 108, 153];
      
      // Col 1: Cliente / Produtor
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("CLIENTE / PRODUTOR", colX[0], y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(client.name.substring(0, 20), colX[0], y + 12);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text(client.email.substring(0, 24), colX[0], y + 18);

      // Col 2: Propriedade / Fazenda
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("PROPRIEDADE / FAZENDA", colX[1], y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(farm.name.substring(0, 20), colX[1], y + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text(`${farm.city} - ${farm.state}`, colX[1], y + 18);

      // Col 3: Talhão Analisado
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("TALHÃO / ÁREA", colX[2], y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(plot.name.substring(0, 20), colX[2], y + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text(`${plot.areaHectares} ha • ${plot.cropType || 'Não def.'}`, colX[2], y + 18);

      // Col 4: Camada de Solo e Furos
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("ATRIBUTOS", colX[3], y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(`Layer: ${activeSoilLayer}`, colX[3], y + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.text(`Furos: ${printTotals.count} | V2: ${desiredV2}%`, colX[3], y + 18);

      y += 33;

      // Section Title: Tabela Ponto a Ponto
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(15, y, 2.5, 5, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text("PRESCRIÇÃO DE CORRETIVOS E ADUBOS (PONTO A PONTO)", 19.5, y + 4);

      y += 8;

      const tableHeaders = [
        "Furo", "Latitude", "Longitude", "Calc. Dol.", "Calc. Calc.", "Gesso", "MAP", "KCl", "NPK"
      ];
      const tableUnits = [
        "", "", "", "(t/ha)", "(t/ha)", "(t/ha)", "(kg/ha)", "(kg/ha)", "(kg/ha)"
      ];

      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(15, y, 180, 8, 'F');
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.line(15, y, 195, y);
      doc.line(15, y + 8, 195, y + 8);

      let curX = 15;
      const computedColPositions: number[] = [];
      const colW = [12, 26, 26, 19, 19, 18, 20, 20, 20]; // sums up to 180
      
      colW.forEach((w, idx) => {
        computedColPositions.push(curX);
        const headerText = tableHeaders[idx];
        const unitText = tableUnits[idx];
        const textX = curX + w / 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        
        if (idx >= 3) {
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        } else {
          doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
        }
        
        doc.text(headerText, textX, y + 3.5, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(unitText, textX, y + 6.8, { align: 'center' });
        
        curX += w;
      });

      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      const sortedPoints = [...localPoints].sort((a,b) => a.pointNumber - b.pointNumber);
      
      sortedPoints.forEach((p, lineIdx) => {
        if (!p.results) return;
        
        // Page overflow protection
        if (y > 270) {
          doc.addPage();
          y = 15;
          doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.rect(15, y, 180, 2, 'F');
          y += 6;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
          doc.text(`Laudo Técnico - Talhão: ${plot.name} (Continuação)`, 15, y);
          doc.text(`Página ${doc.getNumberOfPages()}`, 195, y, { align: 'right' });
          y += 6;
          
          doc.setFillColor(241, 245, 249);
          doc.rect(15, y, 180, 8, 'F');
          doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
          doc.line(15, y, 195, y);
          doc.line(15, y + 8, 195, y + 8);
          
          let subCurX = 15;
          colW.forEach((w, idx) => {
            const headerText = tableHeaders[idx];
            const unitText = tableUnits[idx];
            const textX = subCurX + w / 2;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            if (idx >= 3) {
              doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            } else {
              doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
            }
            doc.text(headerText, textX, y + 3.5, { align: 'center' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(148, 163, 184);
            doc.text(unitText, textX, y + 6.8, { align: 'center' });
            subCurX += w;
          });
          y += 8;
        }

        if (lineIdx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, y, 180, 6, 'F');
        }

        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.3);
        doc.line(15, y + 6, 195, y + 6);

        const savedRec = p.recommendations || {};
        const autoRecs = calculateAutoRecs(p, plot.cropType, desiredV2, prnt);
        const cd = (savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0));
        const cc = (savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0));
        const g = (savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng);
        const mapVal = (savedRec.map !== undefined ? savedRec.map : autoRecs.map);
        const kclVal = (savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl);
        const form = (savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado);

        const rowValues = [
          `F-${p.pointNumber}`,
          p.lat.toFixed(6),
          p.lng.toFixed(6),
          cd > 0 ? `${cd.toFixed(1)} t` : '-',
          cc > 0 ? `${cc.toFixed(1)} t` : '-',
          g > 0 ? `${g.toFixed(1)} t` : '-',
          mapVal > 0 ? `${Math.round(mapVal)} kg` : '-',
          kclVal > 0 ? `${Math.round(kclVal)} kg` : '-',
          form > 0 ? `${Math.round(form)} kg` : '-'
        ];

        rowValues.forEach((val, idx) => {
          const w = colW[idx];
          const textX = computedColPositions[idx] + w / 2;
          doc.setFont("helvetica", idx === 0 ? "bold" : "normal");
          doc.setTextColor(idx === 0 ? slateDark[0] : slateMedium[0], idx === 0 ? slateDark[1] : slateMedium[1], idx === 0 ? slateDark[2] : slateMedium[2]);
          doc.setFontSize(idx >= 1 && idx <= 2 ? 7 : 7.5);
          doc.text(val, textX, y + 4.2, { align: 'center' });
        });

        y += 6;
      });

      // Section: Consolidado Geral
      y += 10;
      if (y > 200) {
        doc.addPage();
        y = 15;
      }

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(15, y, 2.5, 5, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text("VOLUME TOTAL DE INSUMOS RECOMENDADOS PARA O TALHÃO", 19.5, y + 4);

      y += 8;

      const cardW = 57;
      const cardH = 16;
      const gap = 3;

      const totalsData = [
        { title: "CALCÁRIO DOLOMÍTICO", value: `${printTotals.totDolomitico.toFixed(1)} t`, sub: `Média: ${printTotals.avgDolomitico.toFixed(1)} t/ha` },
        { title: "CALCÁRIO CALCÍTICO", value: `${printTotals.totCalcitico.toFixed(1)} t`, sub: `Média: ${printTotals.avgCalcitico.toFixed(1)} t/ha` },
        { title: "GESSO AGRÍCOLA", value: `${printTotals.totGesso.toFixed(1)} t`, sub: `Média: ${printTotals.avgGesso.toFixed(1)} t/ha` },
        { title: "SUPER MAP (FÓSFORO)", value: `${(printTotals.totMap/1000).toFixed(2)} t`, sub: `${Math.round(printTotals.totMap)} kg total` },
        { title: "CLORETO KCl (POTÁSSIO)", value: `${(printTotals.totKcl/1000).toFixed(2)} t`, sub: `${Math.round(printTotals.totKcl)} kg total` },
        { title: "NPK FORMULADO 12-15-15", value: `${(printTotals.totFormulado/1000).toFixed(2)} t`, sub: `${Math.round(printTotals.totFormulado)} kg total` }
      ];

      totalsData.forEach((card, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        
        const cardX = 15 + col * (cardW + gap);
        const cardY = y + row * (cardH + gap);

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'F');
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'S');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(slateMedium[0], slateMedium[1], slateMedium[2]);
        doc.text(card.title, cardX + 3, cardY + 5.2);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(card.value, cardX + 3, cardY + 11);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(card.sub, cardX + 3, cardY + 14.2);
      });

      y += cardH * 2 + gap + 10;

      // Warnings card
      doc.setFillColor(254, 252, 232); // yellow-50
      doc.roundedRect(15, y, 180, 16, 1.5, 1.5, 'F');
      doc.setDrawColor(253, 224, 71); // yellow-300
      doc.roundedRect(15, y, 180, 16, 1.5, 1.5, 'S');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(133, 77, 14); // yellow-800
      doc.text("OBSERVAÇÕES IMPORTANTES:", 18, y + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(113, 63, 18);
      doc.text(`• Recomendações corporadas por compensação da saturação de bases desejada (V2) de ${desiredV2}%, com corretivos de PRNT médio de ${prnt}%.`, 18, y + 9);
      doc.text(`• A aplicação física uniforme ou em taxa variável deve ser acompanhada e validada por Engenheiro Agrônomo habilitado.`, 18, y + 13);

      y += 22;

      if (y > 265) {
        doc.addPage();
        y = 30;
      }
      
      doc.setDrawColor(slateMedium[0], slateMedium[1], slateMedium[2]);
      doc.setLineWidth(0.4);
      doc.line(110, y + 12, 180, y + 12);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text("GeoSolo Pro Agricultura de Precision", 15, y + 6);
      doc.text("Sistemas Digitais de Fertilidade Humana", 15, y + 10);
      
      doc.text("Responsável Técnico / Engenheiro Agrônomo", 145, y + 16, { align: 'center' });
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("Conselho Regional de Engenharia (CREA)", 145, y + 20, { align: 'center' });

      const filename = `LAUDO_TECNICO_${plot.name.toUpperCase().replace(/\s+/g, '_')}_${farm.name.toUpperCase().replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("PDF generation block occurred:", err);
      alert("Houve um contratempo ao gerar o PDF. Verifique os dados inseridos.");
    }
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
            Planejamento ponto a ponto de produtos específicos (Calcários Calcítico/Dolomítico, Gesso, MAP, KCl e Formulado NPK 12-15-15) associado à malha de amostragem de terra do talhão <strong>{plot.name}</strong> para a camada ativa <strong>{activeSoilLayer}</strong>.
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
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-600" />
            Gerar PDF do Laudo
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
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
                    <div className="space-y-0.5 border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex items-center gap-1"><Layers className="w-3 h-3 text-indigo-500" /> Camada Analisada</span>
                      <p className="text-xs font-bold text-indigo-700 font-mono">{activeSoilLayer}</p>
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
          {/* Iframe Print Permission Warning & Guide Modal */}
          {showPrintIframeWarning && (
            <div 
              className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-fade-in"
              id="iframe-print-warning-modal"
              onClick={() => setShowPrintIframeWarning(false)}
            >
              <div 
                className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-6 border border-slate-200 relative space-y-4 text-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3 text-left">
                  <span className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0">
                    <Printer className="w-6 h-6" />
                  </span>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-lg">Impressão via AI Studio</h4>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Por que o assistente de impressão não abriu imediatamente?</p>
                  </div>
                </div>

                <div className="text-slate-700 text-xs leading-relaxed space-y-3 pt-2 bg-slate-50 p-4 rounded-xl border border-slate-100 text-left">
                  <p>
                    O Google AI Studio renderiza o aplicativo de maneira segura dentro de um <strong>iframe isolado (sandboxed)</strong>. Por segurança, os navegadores modernos bloqueiam o comando de impressão (<code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-rose-600">window.print()</code>) iniciado de dentro desse contêiner incorporado.
                  </p>
                  <div className="space-y-2 border-t border-slate-200 pt-2.5">
                    <p className="font-bold text-slate-800">Siga estes simples passos para emitir seu Laudo Técnico em PDF:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-medium pl-1">
                      <li>Clique no botão <strong>"Abrir em Nova Aba"</strong> (o ícone de link/seta no <strong className="text-slate-800">canto superior direito externo da tela do AI Studio</strong>).</li>
                      <li>Com o sistema aberto em tela cheia na nova aba, selecione a aba <strong>"Diagnóstico IA"</strong>.</li>
                      <li>Clique em <strong>"Imprimir Laudo"</strong> no topo superior direito da tabela. O assistente de impressão e salvamento em PDF abrirá perfeitamente!</li>
                    </ol>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      setShowPrintIframeWarning(false);
                      try {
                        window.focus();
                        window.print();
                      } catch (e) {}
                    }}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all border border-slate-250 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Tentar Novamente Aqui
                  </button>
                  <button
                    onClick={() => setShowPrintIframeWarning(false)}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Compreendi, Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GORGEOUS PRINT PREVIEW MODAL */}
          {showPrintPreview && (
            <div 
              className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in"
              id="full-report-print-preview-modal"
            >
              {/* Modal control bar at the top */}
              <div className="max-w-5xl w-full mx-auto bg-slate-800 border border-slate-700 rounded-t-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl shrink-0 text-white select-none">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                    <Printer className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="font-extrabold text-white text-sm md:text-base leading-tight">Visualizador & Impressão de Laudo Técnico</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Layout dimensionado para folhas A4 e salvamento em PDF</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCopyReportText}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-650"
                    title="Copiar dados formatados para enviar ao WhatsApp ou Excel"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Dados (Texto)
                  </button>

                  <button
                    onClick={() => {
                      try {
                        window.focus();
                        window.print();
                      } catch (e) {
                        alert('Seu navegador bloqueou a impressão direta do iframe. Por favor, clique em "Abrir em Nova Aba" no topo direito do AI Studio para exportar normalmente.');
                      }
                    }}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-900/50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir / Salvar PDF
                  </button>

                  <button
                    onClick={() => setShowPrintPreview(false)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Fechar
                  </button>
                </div>
              </div>

              {/* Dica do Iframe */}
              <div className="max-w-5xl w-full mx-auto bg-amber-500/10 border-x border-slate-700 border-b border-amber-500/20 p-3.5 flex items-start gap-2 text-slate-300 text-[11px] shrink-0 text-left">
                <span className="text-amber-400 pt-0.5">💡</span>
                <p className="leading-normal">
                  <strong className="text-amber-400">Dica Importante:</strong> O Google AI Studio executa a aplicação dentro de um contêiner isolado (iframe). Para salvar este laudo técnico como <strong className="text-white">PDF</strong> ou imprimir fisicamente com total controle de margens, por favor clique no botão <strong className="text-amber-300">"Abrir em Nova Aba"</strong> (ícone de link/seta no canto superior direito externo da tela do AI Studio) para liberar as funções do navegador.
                </p>
              </div>

              {/* The printable document body on screen! Simulated A4 Sheet */}
              <div className="max-w-5xl w-full mx-auto bg-white text-slate-900 p-6 md:p-10 shadow-2xl rounded-b-2xl mb-8 flex-1 overflow-x-auto min-h-[11in]">
                <div className="w-full bg-white text-slate-850 text-xs font-sans min-w-[750px]">
                  
                  {/* Header */}
                  <div className="border-b-2 border-emerald-600 pb-4 mb-6 flex justify-between items-end text-left">
                    <div>
                      <h1 className="text-2xl font-black text-slate-900 tracking-tight">GeoSolo Pro</h1>
                      <p className="text-slate-500 font-bold text-[9px] tracking-wide uppercase">Laudo Técnico de Recomendação Agronômica</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-mono font-bold">EMISSÃO: {new Date().toLocaleDateString('pt-BR')}</p>
                      <p className="text-[10px] text-emerald-700 font-bold font-mono">CÓDIGO: {plot.id?.substring(0, 8).toUpperCase() || 'PL-RECS'}</p>
                    </div>
                  </div>

                  {/* Metadata Cards */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-4 gap-4 mb-6 text-left">
                    <div>
                      <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Cliente / Produtor</span>
                      <p className="font-bold text-slate-800 text-[11px] truncate">{client.name}</p>
                      <p className="text-[9px] text-slate-500 font-mono italic break-all">{client.email}</p>
                    </div>
                    <div>
                      <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Propriedade / Fazenda</span>
                      <p className="font-bold text-slate-800 text-[11px] truncate">{farm.name}</p>
                      <p className="text-[9px] text-slate-500">{farm.city} - {farm.state}</p>
                    </div>
                    <div>
                      <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Talhão Analisado</span>
                      <p className="font-bold text-slate-850 text-[11px] truncate">{plot.name}</p>
                      <p className="text-[9px] text-slate-500 font-bold">{plot.areaHectares} Hectares • {plot.cropType || 'Não definida'}</p>
                    </div>
                    <div>
                      <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider">Atributos de Amostragem</span>
                      <p className="font-bold text-slate-850 text-[11px]">Profundidade: <span className="font-mono text-indigo-700">{activeSoilLayer}</span></p>
                      <p className="text-[9px] text-slate-500 font-mono">Furos Analisados: {printTotals.count}</p>
                    </div>
                  </div>

                  {/* A4 Table of point-by-point recommendations */}
                  <h3 className="font-extrabold text-slate-850 text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <span className="w-1.5 h-3.5 bg-emerald-600 rounded-xs"></span>
                    Prescrição de Insumos Reguladores e Fertilizantes (Ponto a Ponto)
                  </h3>
                  
                  <div className="border border-slate-200 rounded-lg overflow-hidden mb-6 bg-white shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[9px] font-black uppercase">
                          <th className="py-2 px-3 text-center border-r border-slate-200 w-12">Furo</th>
                          <th className="py-2 px-2 border-r border-slate-200">Lat / Lng</th>
                          <th className="py-2 px-2 border-r border-slate-200 text-center text-amber-700 bg-amber-50/20">Calc. Dolo. <span className="text-[7px] text-slate-400 block lowercase">(t/ha)</span></th>
                          <th className="py-2 px-2 border-r border-slate-200 text-center text-amber-900 bg-amber-50/40">Calc. Calc. <span className="text-[7px] text-slate-400 block lowercase">(t/ha)</span></th>
                          <th className="py-2 px-2 border-r border-slate-200 text-center text-orange-700 bg-orange-50/20">Gesso <span className="text-[7px] text-slate-400 block lowercase">(t/ha)</span></th>
                          <th className="py-2 px-2 border-r border-slate-200 text-center text-emerald-800 bg-emerald-50/20">MAP <span className="text-[7px] text-slate-400 block lowercase">(kg/ha)</span></th>
                          <th className="py-2 px-2 border-r border-slate-200 text-center text-teal-800 bg-teal-50/20 font-bold">KCl <span className="text-[7px] text-slate-400 block lowercase">(kg/ha)</span></th>
                          <th className="py-2 px-2 text-center text-blue-900 bg-blue-50/20 font-bold">Formulado 12-15-15 <span className="text-[7px] text-slate-400 block lowercase">(kg/ha)</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {localPoints.sort((a,b) => a.pointNumber - b.pointNumber).map((p) => {
                          if (!p.results) return null;
                          const savedRec = p.recommendations || {};
                          const autoRecs = calculateAutoRecs(p, plot.cropType, desiredV2, prnt);

                          const cd = (savedRec.calcarioDolomitico !== undefined ? savedRec.calcarioDolomitico : (autoRecs.calcarioTipo === 'Dolomítico' ? autoRecs.nc : 0));
                          const cc = (savedRec.calcarioCalcitico !== undefined ? savedRec.calcarioCalcitico : (autoRecs.calcarioTipo === 'Calcítico' ? autoRecs.nc : 0));
                          const g = (savedRec.gesso !== undefined ? savedRec.gesso : autoRecs.ng);
                          const mapVal = (savedRec.map !== undefined ? savedRec.map : autoRecs.map);
                          const kclVal = (savedRec.kcl !== undefined ? savedRec.kcl : autoRecs.kcl);
                          const form = (savedRec.formulado12_15_15 !== undefined ? savedRec.formulado12_15_15 : autoRecs.formulado);

                          return (
                            <tr key={p.id} className="text-[9px] hover:bg-slate-50 font-medium text-slate-700">
                              <td className="py-1.5 px-3 text-center font-bold border-r border-slate-200 bg-slate-50 text-slate-900">F-{p.pointNumber}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 font-mono text-slate-400 select-all">{p.lat.toFixed(6)}, {p.lng.toFixed(6)}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-bold text-slate-800">{cd > 0 ? `${cd.toFixed(1)} t` : '-'}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-bold text-slate-850">{cc > 0 ? `${cc.toFixed(1)} t` : '-'}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-bold text-amber-900">{g > 0 ? `${g.toFixed(1)} t` : '-'}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-bold text-emerald-800">{mapVal > 0 ? `${Math.round(mapVal)} kg` : '-'}</td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-bold text-teal-850">{kclVal > 0 ? `${Math.round(kclVal)} kg` : '-'}</td>
                              <td className="py-1.5 px-2 text-center font-black text-blue-900">{form > 0 ? `${Math.round(form)} kg` : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Consolidado Global de Insumos */}
                  <h3 className="font-extrabold text-slate-850 text-xs mb-2 uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <span className="w-1.5 h-3.5 bg-emerald-600 rounded-xs"></span>
                    Volume Consolidado de Insumos (Necessidade Total do Talhão)
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    {/* Dolomitico Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-amber-850 uppercase block tracking-wider">Calcário Dolomítico</span>
                      <p className="text-lg font-black text-slate-900 tracking-tight leading-none mt-1">
                        {printTotals.totDolomitico.toFixed(1)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-400 block mt-1">Dose média: {printTotals.avgDolomitico.toFixed(1)} t/ha</span>
                    </div>

                    {/* Calcitico Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-slate-700 uppercase block tracking-wider">Calcário Calcítico</span>
                      <p className="text-lg font-black text-slate-900 tracking-tight leading-none mt-1">
                        {printTotals.totCalcitico.toFixed(1)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-400 block mt-1">Dose média: {printTotals.avgCalcitico.toFixed(1)} t/ha</span>
                    </div>

                    {/* Gesso Card */}
                    <div className="bg-slate-55 border border-slate-200 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-amber-900 uppercase block tracking-wider">Gesso Agrícola (Sulfato Ca/S)</span>
                      <p className="text-lg font-black text-slate-950 tracking-tight leading-none mt-1">
                        {printTotals.totGesso.toFixed(1)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-400 block mt-1">Dose média: {printTotals.avgGesso.toFixed(1)} t/ha</span>
                    </div>

                    {/* MAP Card */}
                    <div className="bg-emerald-50/20 border border-emerald-100 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-emerald-800 uppercase block tracking-wider">Super MAP (Fósforo)</span>
                      <p className="text-lg font-black text-emerald-950 tracking-tight leading-none mt-1">
                        {(printTotals.totMap/1000).toFixed(2)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-500 block mt-1">Total: {Math.round(printTotals.totMap)} kg</span>
                    </div>

                    {/* KCl Card */}
                    <div className="bg-teal-50/25 border border-teal-100 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-teal-800 uppercase block tracking-wider">Cloreto KCl (Potássio)</span>
                      <p className="text-lg font-black text-teal-950 tracking-tight leading-none mt-1">
                        {(printTotals.totKcl/1000).toFixed(2)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-500 block mt-1">Total: {Math.round(printTotals.totKcl)} kg</span>
                    </div>

                    {/* Formulado Card */}
                    <div className="bg-blue-50/20 border border-blue-100 rounded-xl p-3 text-left">
                      <span className="text-[8px] font-black text-blue-900 uppercase block tracking-wider">NPK Formulado 12-15-15</span>
                      <p className="text-lg font-black text-blue-950 tracking-tight leading-none mt-1">
                        {(printTotals.totFormulado/1000).toFixed(2)} <span className="text-xs font-bold text-slate-500">t</span>
                      </p>
                      <span className="text-[9px] text-slate-500 block mt-1">Total: {Math.round(printTotals.totFormulado)} kg</span>
                    </div>
                  </div>

                  {/* Notas de validação */}
                  <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 text-slate-600 text-[10px] space-y-2 text-left mb-6 leading-relaxed">
                    <p className="font-bold text-slate-800 uppercase text-[9px] tracking-wider">Observações Legais e Agronômicas Relevantes:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-500">
                      <li>As doses prescritas baseiam-se na compensação da saturação de bases desejada (<span className="font-bold text-slate-800">V₂ = {desiredV2}%</span>) com PRNT padrão de <span className="font-bold text-slate-800">{prnt}%</span> e profundidade analisada de <span className="font-bold text-indigo-700">{activeSoilLayer}</span>.</li>
                      <li>A recomendação de corretivos e fertilizantes visa manter e suprir os níveis críticos ideais para a cultura de <span className="font-extrabold text-emerald-800 italic">{plot.cropType || 'Não definida'}</span> baseada em recomendações oficiais regionais.</li>
                    </ul>
                  </div>

                  {/* Assinatura do Engenheiro Agrônomo responsável */}
                  <div className="pt-8 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500 text-left">
                    <div>
                      <p className="font-bold text-slate-800">GeoSolo Pro Agricultura de Precisão</p>
                      <p>Sistemas de Alta Precisão Agronômica</p>
                    </div>
                    <div className="text-center w-64 border-t border-slate-400 pt-1 mt-6">
                      <p className="font-bold text-slate-800">Assinatura do Responsável Técnico</p>
                      <p className="text-[9px] text-slate-400">CREA / Engenheiro Agrônomo</p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
