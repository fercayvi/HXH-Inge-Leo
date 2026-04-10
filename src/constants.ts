import { OperationalStatus, ShiftConfig } from './types';

export const BASE_PLAN = 4.1;
export const MAX_PRODUCTION = 4.3;

export const STATUS_FACTORS: Record<OperationalStatus, number> = {
  'Arranque': 0.8,
  'Proceso': 1.0,
  'Sin proceso': 0.1,
  'Lavado': 0.0,
  'Fin/cambio': 0.9,
};

export const SHIFTS: ShiftConfig[] = [
  {
    number: 1,
    start: '06:30',
    end: '14:30',
    hours: [
      '06:30 - 07:30',
      '07:30 - 08:30',
      '08:30 - 09:30',
      '09:30 - 10:30',
      '10:30 - 11:30',
      '11:30 - 12:30',
      '12:30 - 13:30',
      '13:30 - 14:30',
    ],
  },
  {
    number: 2,
    start: '14:30',
    end: '22:30',
    hours: [
      '14:30 - 15:30',
      '15:30 - 16:30',
      '16:30 - 17:30',
      '17:30 - 18:30',
      '18:30 - 19:30',
      '19:30 - 20:30',
      '20:30 - 21:30',
      '21:30 - 22:30',
    ],
  },
  {
    number: 3,
    start: '22:30',
    end: '06:30',
    hours: [
      '22:30 - 23:30',
      '23:30 - 00:30',
      '00:30 - 01:30',
      '01:30 - 02:30',
      '02:30 - 03:30',
      '03:30 - 04:30',
      '04:30 - 05:30',
      '05:30 - 06:30',
    ],
  },
];

export const LINES = ['Línea 1', 'Línea 2', 'Línea 3'];
export const SKUS = ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004'];
