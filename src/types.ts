export interface Client {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
}

export interface Farm {
  id: string;
  clientId: string;
  name: string;
  city: string;
  state: string;
  areaHectares: number;
}

export interface Plot {
  id: string;
  farmId: string;
  name: string;
  areaHectares: number;
  cropType: string;
  boundaryPoints: { lat: number; lng: number }[];
}

export interface SoilLabResults {
  // Legacy fields (kept for full backward compatibility with interpolation/GIS maps)
  pH: number;        // pH CaCl2 ou H2O (padrão antigo)
  MO: number;        // Matéria Orgânica (%) (padrão antigo)
  P: number;         // Fósforo (mg/dm³) (padrão antigo)
  K: number;         // Potássio (mmolc/dm³) (padrão antigo)
  Ca: number;        // Cálcio (mmolc/dm³) (padrão antigo)
  Mg: number;        // Magnésio (mmolc/dm³) (padrão antigo)
  Al: number;        // Alumínio (mmolc/dm³) (padrão antigo)

  // Novas variáveis calibradas de acordo com a tabela oficial anexa
  ph_cacl2?: number | string;      // pH CaCl2
  ph_h2o?: number | string;        // pH H2O
  ph_kcl?: number | string; // pH KCl (aceita numérico ou "ns")
  mo?: number | string;            // M.O. (g/dm³)
  p_meh?: number | string;         // P meh (mg/dm³)
  p_res?: number | string;         // P res (mg/dm³)
  p_rem?: number | string; // P rem (mg/dm³, aceita "ns")
  k?: number | string;             // K+ (mmolc/dm³)
  ca?: number | string;            // Ca 2+ (mmolc/dm³)
  mg?: number | string;            // Mg 2+ (mmolc/dm³)
  al?: number | string;            // Al 3+ (mmolc/dm³)
  h_al?: number | string;          // H+Al (mmolc/dm³)
  sb?: number | string;            // SB (Soma de Bases) (mmolc/dm³)
  ctc_t?: number | string;         // CTC (T) total (mmolc/dm³)
  v_percent?: number | string;     // V% (Saturação bases) (%)
  s?: number | string;             // S (Enxofre) (mg/dm³)
  ca_mg?: number | string;         // Relação Ca/Mg (saturação/relação)
  ca_k?: number | string;          // Relação Ca/K (saturação/relação)
  mg_k?: number | string;          // Relação Mg/K (saturação/relação)
  b?: number | string;             // B (Boro) (mg/dm³)
  cu?: number | string;            // Cu (Cobre) (mg/dm³ Mehlich)
  fe?: number | string;            // Fe (Ferro) (mg/dm³ Mehlich)
  mn?: number | string;            // Mn (Manganês) (mg/dm³ Mehlich)
  zn?: number | string;            // Zn (Zinco) (mg/dm³ Mehlich)
  ca_t?: number | string;          // Ca/T (%)
  mg_t?: number | string;          // Mg/T (%)
  k_t?: number | string;           // K/T (%)
  argila?: number | string;        // Argila (%)
  silte?: number | string;         // Silte (%)
  areia_total?: number | string;   // Areia Total (%)
  areia_grossa?: number | string; // Areia Grossa (%, aceita "ns")
  areia_fina?: number | string;   // Areia Fina (%, aceita "ns")
  clas_textura?: string;  // Classe Textural (ex: "MUITO ARGILOSO")
  tipo_solo?: string;     // Tipo de solo (ex: "AD 4")
}

export interface Subsample {
  id: string;
  depth: string; // "0-20cm", "20-40cm", "40-60cm" ou personalizada
  isCollected: boolean;
  collectionDate?: string;
  collectedBy?: string;
  results?: SoilLabResults;
}

export interface SamplingPoint {
  id: string;
  plotId: string;
  monthYear?: string; // Ano/Mês da amostragem (ex: "05/2026" ou "Mai/2026")
  pointNumber: number;
  lat: number;
  lng: number;
  isCollected: boolean;
  collectionDate?: string;
  collectedBy?: string;
  results?: SoilLabResults;
  subsamples?: Subsample[];
  zone?: string; // Nome ou ID da Zona de Manejo (ex: "Zona Alta", "Zona Baixa")
  recommendations?: {
    calagem?: number;      // t/ha
    gessagem?: number;     // t/ha
    n?: number;            // kg/ha
    p?: number;            // kg/ha
    k?: number;            // kg/ha
    formula?: string;      // ex: 04-14-08
    gesso?: number;                // t/ha
    calcarioDolomitico?: number;   // t/ha
    calcarioCalcitico?: number;    // t/ha
    map?: number;                  // kg/ha
    kcl?: number;                  // kg/ha
    formulado12_15_15?: number;    // kg/ha
  };
}

export interface PlotPeriod {
  id: string;
  plotId: string;
  monthYear: string; // Mês/Ano do projeto, ex: "05/2026", "11/2025"
  cropType: string;  // Cultura comercial recomendada/vigente
  notes?: string;
  creationDate: string;
  desiredV2?: number;      // V2 Alvo/Desejado % para recomendação
  prnt?: number;           // PRNT do Calcário % para recomendação
  minDose?: number;        // Dose Mínima de calcário t/ha
  userCellSizeM?: number;  // Tamanho do grid em metros
  fieldReady?: boolean;    // Se o projeto está pronto para ir a campo
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  farmId: string;
  plotId: string;
  monthYear?: string; // Vinculado a mês/ano
  creationDate: string;
  status: 'planejado' | 'coletando' | 'concluido';
  type: 'grade' | 'zona';
  gridSizeMeters?: number; // p. ex., 100 metros (1 ha)
}

export interface KrigingConfig {
  variable: keyof SoilLabResults;
  model: 'exponential' | 'gaussian' | 'spherical';
  range: number;   // Alcance em metros (ajustado p/ o tamanho do talhão)
  sill: number;    // Patamar (variância global)
  nugget: number;  // Efeito pepita
}

// Valores de referência agrícolas padrão no Brasil
export const FERTILITY_THRESHOLDS: Record<keyof SoilLabResults, { low: number; medium: number; high: number; unit: string; name: string }> = {
  pH: { low: 5.0, medium: 5.8, high: 6.5, unit: '', name: 'pH (H2O)' },
  MO: { low: 1.5, medium: 3.0, high: 4.5, unit: '%', name: 'Matéria Orgânica' },
  P: { low: 10, medium: 25, high: 40, unit: 'mg/dm³', name: 'Fósforo (P)' },
  K: { low: 1.5, medium: 3.0, high: 6.0, unit: 'mmolc/dm³', name: 'Potássio (K)' },
  Ca: { low: 20, medium: 40, high: 70, unit: 'mmolc/dm³', name: 'Cálcio (Ca)' },
  Mg: { low: 5, medium: 10, high: 20, unit: 'mmolc/dm³', name: 'Magnésio (Mg)' },
  Al: { low: 2, medium: 5, high: 10, unit: 'mmolc/dm³', name: 'Teor de Alumínio' },

  ph_cacl2: { low: 4.5, medium: 5.2, high: 6.0, unit: '', name: 'pH CaCl2' },
  ph_h2o: { low: 5.0, medium: 5.8, high: 6.5, unit: '', name: 'pH H2O' },
  ph_kcl: { low: 4.0, medium: 4.8, high: 5.5, unit: '', name: 'pH KCl' },
  mo: { low: 15, medium: 30, high: 45, unit: 'g/dm³', name: 'M.O.' },
  p_meh: { low: 10, medium: 25, high: 40, unit: 'mg/dm³', name: 'P meh' },
  p_res: { low: 10, medium: 25, high: 45, unit: 'mg/dm³', name: 'P res' },
  p_rem: { low: 15, medium: 30, high: 50, unit: 'mg/dm³', name: 'P rem' },
  k: { low: 1.5, medium: 3.0, high: 6.0, unit: 'mmolc/dm³', name: 'K+' },
  ca: { low: 20, medium: 40, high: 70, unit: 'mmolc/dm³', name: 'Ca 2+' },
  mg: { low: 5, medium: 10, high: 20, unit: 'mmolc/dm³', name: 'Mg 2+' },
  al: { low: 2, medium: 5, high: 10, unit: 'mmolc/dm³', name: 'Al 3+' },
  h_al: { low: 20, medium: 40, high: 60, unit: 'mmolc/dm³', name: 'H+Al' },
  sb: { low: 30, medium: 60, high: 100, unit: 'mmolc/dm³', name: 'SB' },
  ctc_t: { low: 50, medium: 100, high: 150, unit: 'mmolc/dm³', name: 'CTC (T)' },
  v_percent: { low: 40, medium: 60, high: 80, unit: '%', name: 'V%' },
  s: { low: 5, medium: 10, high: 15, unit: 'mg/dm³', name: 'Enxofre (S)' },
  ca_mg: { low: 1.5, medium: 3.0, high: 5.0, unit: '', name: 'Ca/Mg' },
  ca_k: { low: 10, medium: 20, high: 30, unit: '', name: 'Ca/K' },
  mg_k: { low: 3, medium: 6, high: 10, unit: '', name: 'Mg/K' },
  b: { low: 0.20, medium: 0.50, high: 1.00, unit: 'mg/dm³', name: 'B' },
  cu: { low: 0.5, medium: 1.5, high: 3.0, unit: 'mg/dm³', name: 'Cu' },
  fe: { low: 15, medium: 30, high: 60, unit: 'mg/dm³', name: 'Fe' },
  mn: { low: 5, medium: 15, high: 30, unit: 'mg/dm³', name: 'Mn' },
  zn: { low: 1.0, medium: 2.0, high: 4.5, unit: 'mg/dm³', name: 'Zn' },
  ca_t: { low: 35, medium: 50, high: 65, unit: '%', name: 'Ca/T' },
  mg_t: { low: 10, medium: 15, high: 25, unit: '%', name: 'Mg/T' },
  k_t: { low: 2, medium: 4, high: 6, unit: '%', name: 'Relação K/CTC %' },
  argila: { low: 15, medium: 35, high: 60, unit: '%', name: 'Argila' },
  silte: { low: 10, medium: 20, high: 30, unit: '%', name: 'Silte' },
  areia_total: { low: 15, medium: 40, high: 70, unit: '%', name: 'Areia Total' },
  areia_grossa: { low: 10, medium: 25, high: 50, unit: '%', name: 'Areia Grossa' },
  areia_fina: { low: 10, medium: 25, high: 50, unit: '%', name: 'Areia Fina' },
  clas_textura: { low: 0, medium: 0, high: 0, unit: '', name: 'CLAS. TEXTURA' },
  tipo_solo: { low: 0, medium: 0, high: 0, unit: '', name: 'TIPO SOLO' },
};

export interface UserProfile {
  name: string;
  role: string;
  initials: string;
  unit: string;
  email: string;
  crea?: string;
  phone?: string;
}
