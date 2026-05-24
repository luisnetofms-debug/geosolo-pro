import { Client, Farm, Plot, SamplingPoint, Project } from './types';

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'cli-1',
    name: 'Luís Neto FMS',
    document: '123.456.789-00',
    phone: '(16) 99876-5432',
    email: 'luis.netofms@gmail.com'
  },
  {
    id: 'cli-2',
    name: 'Maria Helena Silva',
    document: '987.654.321-11',
    phone: '(34) 98765-4321',
    email: 'maria.silva@agro.com'
  }
];

export const INITIAL_FARMS: Farm[] = [
  {
    id: 'farm-1',
    clientId: 'cli-1',
    name: 'Fazenda Santa Fé',
    city: 'Ribeirão Preto',
    state: 'SP',
    areaHectares: 120
  },
  {
    id: 'farm-2',
    clientId: 'cli-2',
    name: 'Estância do Sol',
    city: 'Uberlândia',
    state: 'MG',
    areaHectares: 85
  }
];

// Coordinates in UTM-friendly location in SP, Brazil
// Approximate center: Lat -21.17, Lng -47.81
export const INITIAL_PLOTS: Plot[] = [
  {
    id: 'plot-1',
    farmId: 'farm-1',
    name: 'Talhão Soja Principal (G1)',
    areaHectares: 36,
    cropType: 'Soja',
    boundaryPoints: [
      { lat: -21.171, lng: -47.818 },
      { lat: -21.171, lng: -47.811 },
      { lat:-21.177, lng: -47.811 },
      { lat: -21.177, lng: -47.818 },
      { lat: -21.171, lng: -47.818 }
    ]
  },
  {
    id: 'plot-2',
    farmId: 'farm-2',
    name: 'Talhão Milho Safrinha',
    areaHectares: 24,
    cropType: 'Milho',
    boundaryPoints: [
      { lat: -18.911, lng: -48.271 },
      { lat: -18.911, lng: -48.265 },
      { lat: -18.915, lng: -48.265 },
      { lat: -18.915, lng: -48.271 },
      { lat: -18.911, lng: -48.271 }
    ]
  }
];

// 4x4 Grid samples for plot-1
export const INITIAL_SAMPLING_POINTS: SamplingPoint[] = [
  {
    id: 'pt-1',
    plotId: 'plot-1',
    pointNumber: 1,
    lat: -21.172,
    lng: -47.817,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 4.8, MO: 1.8, P: 8.5, K: 1.2, Ca: 18.0, Mg: 4.2, Al: 6.5 }
  },
  {
    id: 'pt-2',
    plotId: 'plot-1',
    pointNumber: 2,
    lat: -21.172,
    lng: -47.815,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 5.1, MO: 2.1, P: 12.0, K: 1.9, Ca: 24.0, Mg: 6.1, Al: 4.1 }
  },
  {
    id: 'pt-3',
    plotId: 'plot-1',
    pointNumber: 3,
    lat: -21.172,
    lng: -47.813,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 5.5, MO: 2.6, P: 18.2, K: 2.8, Ca: 38.0, Mg: 9.2, Al: 1.8 }
  },
  {
    id: 'pt-4',
    plotId: 'plot-1',
    pointNumber: 4,
    lat: -21.172,
    lng: -47.811,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 5.9, MO: 3.2, P: 28.5, K: 4.5, Ca: 56.0, Mg: 15.0, Al: 0.2 }
  },
  {
    id: 'pt-5',
    plotId: 'plot-1',
    pointNumber: 5,
    lat: -21.174,
    lng: -47.817,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 4.9, MO: 1.7, P: 9.0, K: 1.1, Ca: 20.0, Mg: 5.2, Al: 5.8 }
  },
  {
    id: 'pt-6',
    plotId: 'plot-1',
    pointNumber: 6,
    lat: -21.174,
    lng: -47.815,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 5.3, MO: 2.3, P: 14.5, K: 2.1, Ca: 29.0, Mg: 7.8, Al: 3.0 }
  },
  {
    id: 'pt-7',
    plotId: 'plot-1',
    pointNumber: 7,
    lat: -21.174,
    lng: -47.813,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 5.6, MO: 2.9, P: 22.4, K: 3.2, Ca: 45.0, Mg: 11.5, Al: 1.2 }
  },
  {
    id: 'pt-8',
    plotId: 'plot-1',
    pointNumber: 8,
    lat: -21.174,
    lng: -47.811,
    isCollected: true,
    collectionDate: '2026-05-20',
    results: { pH: 6.1, MO: 3.5, P: 32.0, K: 5.0, Ca: 62.0, Mg: 18.4, Al: 0.0 }
  },
  {
    id: 'pt-9',
    plotId: 'plot-1',
    pointNumber: 9,
    lat: -21.176,
    lng: -47.817,
    isCollected: true,
    collectionDate: '2026-05-21',
    results: { pH: 5.0, MO: 1.6, P: 7.2, K: 1.4, Ca: 17.0, Mg: 4.8, Al: 6.2 }
  },
  {
    id: 'pt-10',
    plotId: 'plot-1',
    pointNumber: 10,
    lat: -21.176,
    lng: -47.815,
    isCollected: true,
    collectionDate: '2026-05-21',
    results: { pH: 5.2, MO: 2.5, P: 16.0, K: 2.5, Ca: 32.0, Mg: 8.5, Al: 2.8 }
  },
  {
    id: 'pt-11',
    plotId: 'plot-1',
    pointNumber: 11,
    lat: -21.176,
    lng: -47.813,
    isCollected: true,
    collectionDate: '2026-05-21',
    results: { pH: 5.7, MO: 3.1, P: 24.1, K: 3.8, Ca: 49.0, Mg: 12.8, Al: 0.9 }
  },
  {
    id: 'pt-12',
    plotId: 'plot-1',
    pointNumber: 12,
    lat: -21.176,
    lng: -47.811,
    isCollected: true,
    collectionDate: '2026-05-21',
    results: { pH: 6.2, MO: 3.8, P: 35.8, K: 5.4, Ca: 68.0, Mg: 21.0, Al: 0.0 }
  },

  // Some planned/uncollected points on the boundary bottom-right to demonstrate collection
  {
    id: 'pt-13',
    plotId: 'plot-1',
    pointNumber: 13,
    lat: -21.1765,
    lng: -47.8175,
    isCollected: false
  },
  {
    id: 'pt-14',
    plotId: 'plot-1',
    pointNumber: 14,
    lat: -21.1765,
    lng: -47.8155,
    isCollected: false
  },
  {
    id: 'pt-15',
    plotId: 'plot-1',
    pointNumber: 15,
    lat: -21.1765,
    lng: -47.8135,
    isCollected: false
  },
  {
    id: 'pt-16',
    plotId: 'plot-1',
    pointNumber: 16,
    lat: -21.1765,
    lng: -47.8115,
    isCollected: false
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Amostragem Grade 1.5ha - Santa Fé',
    clientId: 'cli-1',
    farmId: 'farm-1',
    plotId: 'plot-1',
    creationDate: '2026-05-18',
    status: 'coletando',
    type: 'grade',
    gridSizeMeters: 120
  }
];
