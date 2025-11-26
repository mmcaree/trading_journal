/**
 * Comprehensive TypeScript interfaces for all API responses and data types
 * This file eliminates the use of 'any' types throughout the application
 */

// =====================================================
// ERROR TYPES
// =====================================================

export interface ApiError {
  detail?: string;
  message?: string;
  status?: number;
}

export interface AxiosErrorResponse {
  response?: {
    status: number;
    data: ApiError;
    statusText?: string;
  };
  message: string;
  code?: string;
}

export interface ValidationError {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

// =====================================================
// AUTH & USER TYPES
// =====================================================

export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  bio?: string;
  profile_picture_url?: string;
  updated_at?: string;
  timezone?: string;
  
  // Notification settings
  email_notifications_enabled?: boolean;
  daily_email_enabled?: boolean;
  daily_email_time?: string;
  weekly_email_enabled?: boolean;
  weekly_email_time?: string;
  
  // 2FA status
  two_factor_enabled?: boolean;
  
  // Trading settings
  default_account_size?: number;
  current_account_balance?: number;
  initial_account_balance?: number;
  
  // Admin system
  role?: 'STUDENT' | 'INSTRUCTOR';
}

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UserUpdateData {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  bio?: string;
  email?: string;
  timezone?: string;
  default_account_size?: number;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export interface UserExportData {
  user: User;
  positions: Position[];
  events: PositionEvent[];
  journal_entries: JournalEntry[];
  export_date: string;
}

// =====================================================
// TRADING TYPES
// =====================================================

export type InstrumentType = 'stock' | 'options' | 'STOCK' | 'OPTIONS';
export type OptionType = 'call' | 'put' | 'CALL' | 'PUT';
export type TradeType = 'long' | 'short';
export type TradeStatus = 'planned' | 'active' | 'closed' | 'canceled' | 'Open' | 'Closed' | 'open';

// =====================================================
// ACCOUNT SETTINGS
// =====================================================

export interface AccountSettings {
  starting_balance: number;
  current_balance: number;
  last_updated: string;
}

// =====================================================
// POSITION TYPES
// =====================================================

export interface Position {
  id: number;
  ticker: string;
  instrument_type?: 'STOCK' | 'OPTIONS';
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  status: 'open' | 'closed';
  current_shares: number;
  avg_entry_price?: number;
  total_cost: number;
  total_realized_pnl: number;
  current_stop_loss?: number;
  current_take_profit?: number;
  opened_at: string;
  closed_at?: string;
  notes?: string;
  lessons?: string;
  mistakes?: string;
  events_count: number;
  return_percent?: number;
  original_risk_percent?: number;
  current_risk_percent?: number;
  original_shares?: number;
  account_value_at_entry?: number;
  // Options-specific fields
  strike_price?: number;
  expiration_date?: string;
  option_type?: 'CALL' | 'PUT';
  // Optional event history
  events?: PositionEvent[];
  tags?: PositionTag[];
}

export interface PositionEvent {
  id: number;
  event_type: 'buy' | 'sell';
  event_date: string;
  shares: number;
  price: number;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
  source: string;
  realized_pnl?: number;
  position_shares_before?: number;
  position_shares_after?: number;
}

export interface PositionDetails {
  position: Position;
  events: PositionEvent[];
  metrics: {
    total_bought: number;
    total_sold: number;
    avg_buy_price: number;
    avg_sell_price: number;
    realized_pnl: number;
    current_value: number;
    total_events: number;
  };
}

export interface CreatePositionData {
  ticker: string;
  instrument_type?: 'STOCK' | 'OPTIONS';
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  notes?: string;
  account_balance_at_entry?: number;
  // Options-specific fields
  strike_price?: number;
  expiration_date?: string;
  option_type?: 'CALL' | 'PUT';
  initial_event: {
    event_type: 'buy';
    shares: number;
    price: number;
    event_date?: string;
    stop_loss?: number;
    take_profit?: number;
    notes?: string;
  };
}

export interface AddEventData {
  event_type: 'buy' | 'sell';
  shares: number;
  price: number;
  event_date?: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

export interface EventUpdateData {
  shares?: number;
  price?: number;
  event_date?: string;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string;
}

export interface PositionUpdateData {
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  notes?: string;
  lessons?: string;
  mistakes?: string;
}

// =====================================================
// LEGACY TRADE TYPES (for gradual migration)
// =====================================================

export interface PartialExit {
  exit_price: number;
  exit_date: string;
  shares_sold: number;
  profit_loss: number;
  notes?: string;
}

export interface ApiTrade {
  id: number;
  ticker: string;
  trade_type: TradeType;
  status: TradeStatus;
  instrument_type: InstrumentType;
  strike_price?: number;
  expiration_date?: string;
  option_type?: OptionType;
  entry_price: number;
  entry_date: string;
  entry_notes?: string;
  exit_price?: number;
  exit_date?: string;
  exit_notes?: string;
  position_size: number;
  stop_loss: number;
  take_profit?: number;
  risk_per_share: number;
  total_risk: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  strategy: string;
  setup_type: string;
  timeframe: string;
  market_conditions?: string;
  tags?: string[];
  partial_exits?: PartialExit[];
}

export interface Trade extends ApiTrade {
  displayStatus: string;
  displayDirection: string;
  displayDate: string;
  remaining_shares?: number;
  position_value?: number;
  risk_reward_ratio?: number;
  mistakes?: string;
  lessons?: string;
}

// =====================================================
// PENDING ORDERS
// =====================================================

export interface PendingOrder {
  id: number;
  symbol: string;
  side: string;
  status: string;
  shares: number;
  price?: number;
  order_type?: string;
  placed_time: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

// =====================================================
// JOURNAL TYPES
// =====================================================

export type JournalEntryType = 'note' | 'lesson' | 'mistake' | 'analysis';

export interface JournalEntry {
  id: number;
  entry_type: JournalEntryType;
  content: string;
  entry_date: string;
  created_at: string;
  updated_at: string;
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalEntryCreate {
  entry_type: JournalEntryType;
  content: string;
  entry_date?: string;
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalEntryUpdate {
  entry_type?: JournalEntryType;
  content?: string;
  entry_date?: string;
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalResponse {
  success?: boolean;
  message?: string;
}

// =====================================================
// IMAGE & MEDIA TYPES
// =====================================================

export interface ImageUploadResponse {
  success: boolean;
  image_url: string;
  filename: string;
}

export interface ImageUpdateResponse {
  success: boolean;
  message: string;
}

// =====================================================
// NOTIFICATION TYPES
// =====================================================

export interface NotificationSettings {
  email_notifications_enabled: boolean;
  weekly_email_enabled: boolean;
  weekly_email_time?: string;
}

export interface TwoFactorSetup {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

export interface BackupCodesResponse {
  backup_codes: string[];
}

// =====================================================
// IMPORT/EXPORT TYPES
// =====================================================

export interface ValidationResult {
  valid: boolean;
  total_events: number;
  filled_events?: number;
  pending_events?: number;
  unique_symbols: number;
  date_range: {
    earliest: string | null;
    latest: string | null;
  };
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats?: {
    positionsProcessed: number;
    eventsCreated: number;
    duration: number;
  };
  errors?: string[];
}

// =====================================================
// DASHBOARD & ANALYTICS TYPES
// =====================================================

export interface DashboardData {
  totalTrades: number;
  openTrades: number;
  winRate: number;
  profitLoss: number;
  equityCurve: Array<{ date: string; equity: number }>;
  setupPerformance: Array<{ name: string; value: number; color: string }>;
  recentTrades: Array<{
    id: number;
    ticker: string;
    entryDate: string;
    status: string;
    profitLoss: number | null;
  }>;
}

export interface LifetimeTickerAnalytics {
  ticker: string;
  totalPositions: number;
  lifetimeWinRate: number;
  lifetimePnL: number;
  averageReturnPerPosition: number;
  bestPosition: {
    id: number;
    returnPercent: number;
    pnl: number;
    daysHeld: number;
  } | null;
  worstPosition: {
    id: number;
    returnPercent: number;
    pnl: number;
    daysHeld: number;
  } | null;
  averageDaysHeld: number;
  totalVolumeTraded: number;
  successByStrategy: Array<{
    strategy: string;
    winRate: number;
    avgReturn: number;
    positionsCount: number;
  }>;
  riskAdjustedReturn: number;
  openPositionsCount: number;
  closedPositionsCount: number;
}

// =====================================================
// DEBUG & TESTING TYPES
// =====================================================

export interface ApiConnectionStatus {
  status: 'success' | 'error';
  message: string;
}

export interface AuthStatusResponse {
  status: 'authenticated' | 'unauthenticated' | 'error';
  message: string;
  tokenExists?: boolean;
  tokenValue?: string;
  error?: string;
}

export interface AnalyticsDebugData {
  [key: string]: unknown;
}

// =====================================================
// NOTES TYPES
// =====================================================

export interface NotesUpdateResponse {
  success: boolean;
  message: string;
}

export interface ProfilePictureUploadResponse {
  profile_picture_url: string;
}

// =====================================================
// GENERIC RESPONSE TYPES
// =====================================================

export interface SuccessResponse {
  success: boolean;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// =====================================================
// CACHE TYPES
// =====================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface PositionTag {
  id: number;
  name: string;
  color: string;
}
