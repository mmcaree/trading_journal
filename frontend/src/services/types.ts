// Enums for trade properties
export type InstrumentType = 'stock' | 'options';
export type OptionType = 'call' | 'put';

// Re-export all types from the central api.ts file
export type {
  AccountSettings,
  PartialExit,
  ApiTrade,
  Trade,
  DashboardData
} from '../types/api';
