// Interface for account settings
export interface AccountSettings {
  starting_balance: number;
  current_balance: number;
  last_updated: string;
}

// Interface for partial exits
export interface PartialExit {
  exit_price: number;
  exit_date: string;
  shares_sold: number;
  profit_loss: number;
  notes?: string;
}

// Interface for API trade data
export interface ApiTrade {
  id: number;
  ticker: string;
  trade_type: 'long' | 'short';
  status: 'planned' | 'active' | 'closed' | 'canceled';
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

// Interface for frontend trade data (extends API data with display fields)
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

// Interface for dashboard metrics
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
