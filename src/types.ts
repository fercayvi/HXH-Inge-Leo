export type OperationalStatus = 'Arranque' | 'Proceso' | 'Sin proceso' | 'Lavado' | 'Fin/cambio';

export interface ProductionRecord {
  id?: string;
  date: string;
  shift: 1 | 2 | 3;
  hour: string;
  line: string;
  supervisor: string;
  sku: string;
  status: OperationalStatus;
  plan: number;
  real: number;
  compliance: number;
  timestamp?: any;
}

export interface ShiftConfig {
  number: 1 | 2 | 3;
  start: string;
  end: string;
  hours: string[];
}

export interface Supervisor {
  id?: string;
  name: string;
  weeklyGoal: number;
  active: boolean;
  line: string;
}

export interface PlantSettings {
  lines: string[];
  lineConfigs: Record<string, { basePlan: number }>;
  statusFactors: Record<string, number>;
  maxProduction: number;
}
