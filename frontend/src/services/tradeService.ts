import api, { API_URL } from './apiConfig';
import axios from 'axios';

export interface PartialExit {
  exit_price: number;
  exit_date: string;
  shares_sold: number;
  profit_loss: number;
  notes?: string;
}

export interface PositionEntry {
  id: number;
  entry_date: string;
  entry_price: number;
  shares: number;
  stop_loss: number;
  take_profit: number;
  cost: number;
  notes?: string;
}

export interface PositionExit {
  id: number;
  exit_date: string;
  exit_price: number;
  shares_sold: number;
  profit_loss: number;
  proceeds: number;
  notes?: string;
}

export interface PositionDetails {
  trade_group_id: string;
  ticker: string;
  entries: PositionEntry[];
  exits: PositionExit[];
  summary: {
    total_shares_bought: number;
    total_shares_sold: number;
    current_shares: number;
    avg_entry_price: number;
    total_cost: number;
    total_realized_pnl: number;
    entries_count: number;
    exits_count: number;
  };
}

export interface Trade extends ApiTrade {
  displayStatus: string;
  displayDirection: string;
  displayDate: string;
  
  created_at?: string;
  updated_at?: string;
  
  remaining_shares?: number;
  position_value?: number;
  risk_reward_ratio?: number;
  mistakes?: string;
  lessons?: string;
}

export interface TradeFormData {
  ticker: string;
  trade_type: 'long' | 'short';
  status: 'planned' | 'active' | 'closed' | 'canceled';
  entry_price: number;
  entry_date?: string;
  entry_notes?: string;
  exit_price?: number;
  exit_date?: string;
  exit_notes?: string;
  position_size: number;
  stop_loss: number;
  take_profit?: number;
  setup_type: string;
  timeframe: string;
  market_conditions?: string;
  mistakes?: string;
  lessons?: string;
}

// New position-based functions
export async function getPositions(): Promise<any[]> {
  try {
    const response = await api.get('/api/trades/positions');
    return response.data;
  } catch (error) {
    console.error('Error fetching positions:', error);
    throw error;
  }
}

export async function addToPositionGroup(tradeGroupId: string, entryData: TradeEntryData): Promise<any> {
  try {
    const response = await api.post(`/api/trades/positions/${tradeGroupId}/entries`, entryData);
    return response.data;
  } catch (error) {
    console.error('Error adding to position group:', error);
    throw error;
  }
}

export async function sellFromPositionGroup(tradeGroupId: string, exitData: PartialExitData): Promise<any> {
  try {
    const response = await api.post(`/api/trades/positions/${tradeGroupId}/exits`, exitData);
    return response.data;
  } catch (error) {
    console.error('Error selling from position group:', error);
    throw error;
  }
}

export async function getPositionDetails(tradeGroupId: string): Promise<PositionDetails> {
  try {
    const response = await api.get(`/api/trades/positions/${tradeGroupId}/details`);
    return response.data;
  } catch (error) {
    console.error('Error fetching position details:', error);
    throw error;
  }
}

// Dashboard data type for fetching dashboard statistics
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

const DEFAULT_SETTINGS: AccountSettings = {
  starting_balance: 10000,
  current_balance: 10000,
  last_updated: new Date().toISOString()
};

const getAccountSettings = async (): Promise<AccountSettings> => {
  // TODO: move to backend
  // hardcoded for now
  return DEFAULT_SETTINGS;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'Invalid Date';
};

const calculateTotalPL = (trade: any): number => {
  let total = 0;
  
  if (trade.partial_exits && Array.isArray(trade.partial_exits)) {
    total += trade.partial_exits.reduce((sum: number, exit: any) => sum + (exit.profit_loss || 0), 0);
  }
  
  const profit = trade.profit_loss || trade.resultAmount || trade.profitLoss || 0;
  
  const isClosedTrade = 
    (trade.status && trade.status.toLowerCase() === 'closed') ||
    (trade.displayStatus && trade.displayStatus === 'Closed');
    
  if (isClosedTrade) {
    total += profit;
  }
  
  return total;
};

const getRecentTrades = (trades: any[]): DashboardData['recentTrades'] => {
  return trades
    .sort((a, b) => new Date(b.entry_date || b.entryDate).getTime() - new Date(a.entry_date || a.entryDate).getTime())
    .slice(0, 5)
    .map(trade => {
      const totalPL = calculateTotalPL(trade);
      
      // Use original ISO format for dates to allow frontend to format consistently
      return {
        id: trade.id,
        ticker: trade.ticker,
        entryDate: trade.entry_date || trade.entryDate,  // Handle both formats
        status: (trade.status || '').toLowerCase() === 'active' || (trade.status || '').toLowerCase() === 'open' ? 'Open' : 
                (trade.status || '').toLowerCase() === 'closed' ? 'Closed' : 
                trade.status ? trade.status.charAt(0).toUpperCase() + trade.status.slice(1).toLowerCase() : 'Unknown',
        profitLoss: (trade.status || '').toLowerCase() === 'closed' ? totalPL : null
      };
    });
};

// Fetch dashboard data
export const fetchDashboardData = async (): Promise<DashboardData> => {
  try {    // Fetch trades and settings
    const [allTrades, settings] = await Promise.all([
      api.get('/api/trades').then(response => response.data),
      getAccountSettings()
    ]);

    console.log("Raw API trades for dashboard:", allTrades);

    // Normalize trade data to ensure it has proper properties for calculations
    const normalizedTrades = allTrades.map((trade: any) => {
      // Log each raw trade to see the actual data structure
      console.log("Processing trade for dashboard:", trade);
      
      // Calculate P&L for this trade directly
      let totalPL = trade.profit_loss || 0;
      console.log(`Trade ${trade.id} profit_loss from API: ${totalPL}`);
      
      return {
        ...trade,
        // Ensure these properties exist for calculations
        id: trade.id,
        ticker: trade.ticker,
        status: trade.status,  // Keep original status
        entry_date: trade.entry_date,
        exit_date: trade.exit_date,
        profit_loss: trade.profit_loss, // Keep original profit_loss
        partial_exits: trade.partial_exits || []
      };
    });

    // Sort trades by date (newest first)
    const trades = normalizedTrades.sort((a: Trade, b: Trade) => 
      new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );

    console.log("Normalized trades for dashboard:", trades);
    console.log("Number of trades:", trades.length);
    
    // Calculate basic metrics
    const totalTrades = trades.length;
    const openTrades = trades.filter((trade: Trade) => 
      trade.status === 'active' || trade.status === 'planned'
    ).length;
      // Calculate win rate from closed trades
    const closedTrades = trades.filter((trade: Trade) => trade.status?.toLowerCase() === 'closed');
    console.log("Number of closed trades:", closedTrades.length);
    
    // Calculate P&L directly from API values
    const tradeProfits = closedTrades.map((trade: Trade) => {
      const profitValue = trade.profit_loss || 0;
      console.log(`Trade ${trade.id} profit: ${profitValue}`);
      return profitValue;
    });
    
    console.log('Calculated trade profits:', tradeProfits);
    
    const winningTrades = tradeProfits.filter((profit: number) => profit > 0);
    console.log("Number of winning trades:", winningTrades.length);
    
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;
      
    console.log("Calculated win rate:", winRate);

    // Calculate total P&L directly
    const totalProfitLoss = closedTrades.reduce((sum: number, trade: Trade) => {
      return sum + (trade.profit_loss || 0);
    }, 0);
    
    // Fetch and add realized P&L from all partial exits
    let totalRealizedPnl = 0;
    try {
      const partialExitsResponse = await api.get('/api/analytics/partial-exits-summary');
      totalRealizedPnl = partialExitsResponse.data.total_realized_pnl || 0;
      console.log('Total realized P&L from partial exits:', totalRealizedPnl);
    } catch (error) {
      console.warn('Could not fetch realized P&L, continuing without it:', error);
    }
    
    const totalPnlWithRealized = totalProfitLoss + totalRealizedPnl;
    console.log('Calculated total P&L (with realized):', totalPnlWithRealized);
    
    // Create dashboard data object
    const dashboardData: DashboardData = {
      totalTrades,
      openTrades,
      winRate: Number(winRate.toFixed(1)),
      profitLoss: Number(totalPnlWithRealized.toFixed(2)),
      equityCurve: calculateEquityCurve(trades, 0), // Start at 0 to show relative performance
      setupPerformance: calculateSetupPerformance(trades),
      recentTrades: getRecentTrades(trades)
    };

    console.log("Actual dashboard data being returned:", JSON.stringify(dashboardData));
    return dashboardData;
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    throw error;
  }
};

// Setup performance data
const setupPerformance = [
  { name: 'Breakout', value: 40, color: '#4caf50' },
  { name: 'ABCD', value: 30, color: '#2196f3' },
  { name: 'Flag', value: 15, color: '#ff9800' },
  { name: 'Other', value: 15, color: '#9c27b0' },
];

// Recent trades data
const recentTrades = [
  { id: 1, ticker: 'AAPL', entryDate: '2025-06-01', status: 'closed', profitLoss: 350.75 },
  { id: 2, ticker: 'TSLA', entryDate: '2025-06-05', status: 'closed', profitLoss: -125.50 },
  { id: 3, ticker: 'MSFT', entryDate: '2025-06-08', status: 'active', profitLoss: null },
  { id: 4, ticker: 'NVDA', entryDate: '2025-06-10', status: 'active', profitLoss: null },
  { id: 5, ticker: 'AMZN', entryDate: '2025-06-12', status: 'planned', profitLoss: null },
];

// Calculate equity curve
const calculateEquityCurve = (trades: any[], startingBalance: number = 0): Array<{ date: string; equity: number }> => {
  console.log("Calculating equity curve from trades:", trades);
  
  if (!trades || trades.length === 0) {
    console.log("No trades found for equity curve, returning default");
    return [{
      date: new Date().toISOString().split('T')[0],
      equity: startingBalance
    }];
  }  // Sort trades by entry date
  const sortedTrades = [...trades]
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
    .filter(trade => {
      const isClosed = trade.status === 'closed' || trade.status === 'Closed' || trade.status === 'CLOSED';
      const hasPartialExits = trade.partial_exits && trade.partial_exits.length > 0;
      return (isClosed || hasPartialExits);
    });

  console.log('Sorted trades for equity curve:', sortedTrades);  
  
  let cumulativeEquity = startingBalance;
  let lastEquity = startingBalance;
  const equityCurve = sortedTrades.flatMap(trade => {
    const points: Array<{ date: string; equity: number }> = [];
    
    // Add points for partial exits
    if (trade.partial_exits && Array.isArray(trade.partial_exits) && trade.partial_exits.length > 0) {
      trade.partial_exits.forEach((exit: PartialExit) => {
        const exitPL = exit.profit_loss || 0;
        cumulativeEquity += exitPL;
        console.log(`Adding partial exit PL ${exitPL} to curve, new equity: ${cumulativeEquity}`);
        points.push({
          date: exit.exit_date.split('T')[0],
          equity: Number(cumulativeEquity.toFixed(2))
        });
      });
    }

    // Add point for final exit
    if (trade.status?.toLowerCase() === 'closed' && trade.profit_loss) {
      const finalPL = trade.profit_loss || 0;
      cumulativeEquity += finalPL;
      lastEquity = cumulativeEquity;
      console.log(`Adding final PL ${finalPL} to curve, new equity: ${cumulativeEquity}`);
      points.push({
        date: (trade.exit_date || trade.entry_date).split('T')[0],
        equity: Number(cumulativeEquity.toFixed(2))
      });
    }

    return points;
  });

  // If no points, add current date with 0 equity
  if (equityCurve.length === 0) {
    equityCurve.push({
      date: new Date().toISOString().split('T')[0],
      equity: 0
    });
  }

  // Add a final point with current date if last trade is not from today
  const today = new Date().toISOString().split('T')[0];
  if (equityCurve[equityCurve.length - 1].date !== today) {
    equityCurve.push({
      date: today,
      equity: lastEquity
    });
  }

  return equityCurve;
};

// Calculate setup performance based on timeframes (strategies)
const calculateSetupPerformance = (trades: any[]): Array<{ name: string; value: number; color: string }> => {
  const COLORS = {
    Breakout: '#4caf50',
    Reversal: '#2196f3', 
    'Episodic Pivot': '#ff9800',
    'BBKC Mean Reversion': '#9c27b0',
    'Parabolic Short': '#e91e63',
    Other: '#607d8b'
  };
  
  // Get closed trades only
  const closedTrades = trades.filter(trade => trade.status?.toLowerCase() === 'closed');
  
  console.log('Closed trades for strategy performance:', closedTrades);
  
  if (closedTrades.length === 0) {
    return [{ name: 'No Data', value: 100, color: '#9e9e9e' }];
  }

  // Group trades by strategy and calculate success rate
  const strategyStats = closedTrades.reduce((acc: { [key: string]: { total: number; wins: number } }, trade) => {
    // Use strategy field
    const strategy = trade.strategy || 'Other';
    console.log(`Trade ${trade.id} has strategy: ${strategy}`);
    
    if (!acc[strategy]) {
      acc[strategy] = { total: 0, wins: 0 };
    }
    acc[strategy].total++;

    // A trade is winning if profit_loss > 0
    const isWinningTrade = (trade.profit_loss || 0) > 0;
    console.log(`Trade ${trade.id} profit: ${trade.profit_loss}, is winning: ${isWinningTrade}`);
    
    if (isWinningTrade) {
      acc[strategy].wins++;
    }
    return acc;
  }, {});

  console.log('Strategy stats:', strategyStats);

  // Convert to required format and calculate win rate percentages
  const strategyPerformance = Object.entries(strategyStats).map(([strategy, stats]) => ({
    name: strategy,
    value: Number(((stats.wins / stats.total) * 100).toFixed(1)),
    color: (COLORS as any)[strategy] || '#9c27b0' // Default to purple for unknown strategies
  }));

  // Sort by performance (descending) and take top 4
  return strategyPerformance
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
};

// Fetch all trades
export const fetchTrades = async (
  filters?: { status?: string; ticker?: string; setup_type?: string }
): Promise<Trade[]> => {
  try {
    console.log("Fetching trades from API...");
    let url = `/api/trades`;
    
    if (filters) {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.ticker) params.append('ticker', filters.ticker);
      if (filters.setup_type) params.append('setup_type', filters.setup_type);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    }
      console.log(`Making GET request to: ${url}`);
    
    // Fetch both trades and user data to get account size
    const [tradesResponse, userResponse] = await Promise.all([
      api.get(url),
      api.get('/api/users/me')
    ]);
    
    console.log(`Received response:`, tradesResponse.data);
    
    // Get user's account size, default to 10000 if not set
    const userAccountSize = userResponse.data?.default_account_size || 10000;    // Transform API response to match frontend format
    const transformedTrades = tradesResponse.data.map((trade: any) => {
      // Calculate total P&L including partial exits
      let totalPL = trade.profit_loss || 0;
      if (trade.partial_exits) {
        totalPL += trade.partial_exits.reduce((sum: number, exit: any) => sum + exit.profit_loss, 0);
      }

      // Calculate risk percentage using snapshotted account balance (if available) or current balance as fallback
      const accountBalanceForRisk = trade.account_balance_snapshot || userAccountSize;
      const riskPercent = trade.total_risk ? ((trade.total_risk / accountBalanceForRisk) * 100).toFixed(2) : null;

      return {
        id: trade.id,
        ticker: trade.ticker,
        entryDate: trade.entry_date,
        exitDate: trade.exit_date || null,
        entryPrice: trade.entry_price,
        exitPrice: trade.exit_price || null,
        strategy: trade.timeframe || 'Unknown',
        risk_percent: riskPercent ? parseFloat(riskPercent) : null,
        total_risk: trade.total_risk || null,
        status: trade.status?.toLowerCase() === 'closed' ? 'Closed' : 
                trade.status?.toLowerCase() === 'active' ? 'Open' : 
                trade.status ? trade.status.charAt(0).toUpperCase() + trade.status.slice(1) : '',
        result: trade.status?.toLowerCase() === 'closed' ? (trade.profit_loss || totalPL) : null,
        notes: trade.entry_notes || '',
        // Keep original fields for metrics
        trade_type: trade.trade_type,
        position_size: trade.position_size,
        stop_loss: trade.stop_loss,
        take_profit: trade.take_profit,
        setup_type: trade.setup_type,
        timeframe: trade.timeframe,
        market_conditions: trade.market_conditions,
        tags: trade.tags || [],
        partial_exits: trade.partial_exits
      };
    });
    
    console.log(`Transformed trades:`, transformedTrades);
    return transformedTrades;
  } catch (error: any) {
    console.error('Error fetching trades:', error);
    
    // Return empty array - don't freeze the UI
    return [];
  }
};

// Fetch a single trade
export const fetchTrade = async (id: number): Promise<any> => {
  try {
    console.log(`Fetching trade with ID: ${id}`);
    const url = `/api/trades/${id}`;
    console.log(`Making GET request to: ${url}`);
    
    const response = await api.get(url);
    
    console.log(`Received trade data:`, response.data);
    
    // Transform the API response to match the TradeDetail component's expected format
    const apiTrade = response.data;
    
    // Calculate risk based on position size and risk_per_share
    const risk = apiTrade.total_risk || (apiTrade.risk_per_share * apiTrade.position_size);    
    
    const tradeInstrumentType = apiTrade.instrument_type || 'stock';
    
    // Transform the trade data - store raw contract prices, display raw contract prices
    const transformedTrade = {
      id: apiTrade.id,
      ticker: apiTrade.ticker,
      entryDate: apiTrade.entry_date,
      exitDate: apiTrade.exit_date,
      entryPrice: apiTrade.entry_price,
      exitPrice: apiTrade.exit_price,
      shares: apiTrade.position_size,
      strategy: apiTrade.timeframe || 'Unknown',  // API timeframe maps to strategy in the UI
      setupType: apiTrade.setup_type || 'Unknown',
      timeframe: apiTrade.timeframe || 'Daily',
      status: apiTrade.status?.toLowerCase() === 'active' ? 'Open' : 
              apiTrade.status?.toLowerCase() === 'closed' ? 'Closed' : 
              apiTrade.status ? apiTrade.status.charAt(0).toUpperCase() + apiTrade.status.slice(1) : '',
      direction: apiTrade.trade_type === 'long' ? 'Long' : 'Short',
      instrumentType: tradeInstrumentType?.toLowerCase() || 'stock',
      accountBalanceSnapshot: apiTrade.account_balance_snapshot,
      result: apiTrade.profit_loss_percent || (apiTrade.profit_loss && risk ? ((apiTrade.profit_loss / risk) * 100) : null),
      resultAmount: apiTrade.profit_loss,
      risk: risk,
      stopLoss: apiTrade.stop_loss,
      takeProfit: apiTrade.take_profit,
      notes: apiTrade.entry_notes || '',
      imageUrls: apiTrade.imageUrls || [],  // Preserve image URLs from the API
      tags: apiTrade.tags || [],
      // Transform partial exits to match the UI format
      partialExits: apiTrade.partial_exits ? apiTrade.partial_exits.map((exit: any) => ({
        exitDate: exit.exit_date,
        exitPrice: exit.exit_price,
        sharesSold: exit.shares_sold,
        profitLoss: exit.profit_loss,
        notes: exit.notes
      })) : [],
      // Calculate remaining shares after partial exits
      remainingShares: apiTrade.partial_exits ? 
        apiTrade.position_size - apiTrade.partial_exits.reduce((sum: number, exit: any) => sum + exit.shares_sold, 0) :
        apiTrade.position_size,
      // Empty array for now, can be implemented later
      takeProfitTargets: []
    };
    
    console.log('Transformed trade data:', transformedTrade);
    return transformedTrade;
  } catch (error: any) {
    console.error(`Error fetching trade with ID ${id}:`, error);
    
    // Rethrow a more specific error so the caller can handle it appropriately
    throw new Error(`Failed to fetch trade #${id}. ${error.message || ''}`);
  }
};

// Create a new trade
export const createTrade = async (tradeData: any): Promise<Trade> => {
  console.log('Creating trade with data:', tradeData);
  
  try {
    // Parse values with fallbacks
    const entryPrice = parseFloat(tradeData.entryPrice) || 0;
    const stopLoss = parseFloat(tradeData.stopLoss) || 0;
    const shares = parseFloat(tradeData.shares) || 0;
    
    // Validate the basic data
    if (entryPrice <= 0) throw new Error('Entry price must be greater than 0');
    if (shares <= 0) throw new Error('Number of shares must be greater than 0');
    
    // Only validate stop loss if it's provided
    if (stopLoss > 0) {
      // For new trades, enforce traditional stop loss rules (risk management)
      // Stop loss should be on the losing side to limit risk
      const isLong = tradeData.direction === 'Long';
      const isValidTrade = isLong ? (entryPrice > stopLoss) : (stopLoss > entryPrice);
      
      if (!isValidTrade) {
        throw new Error(
          isLong 
            ? 'For new Long trades, initial stop loss must be lower than entry price' 
            : 'For new Short trades, initial stop loss must be higher than entry price'
        );
      }
    }
    
    // Map status to backend expected values
    let statusValue = 'active'; // default
    if (tradeData.status === 'Open') statusValue = 'active';
    else if (tradeData.status === 'Closed') statusValue = 'closed';
    else if (tradeData.status === 'Planned') statusValue = 'planned';
    else if (tradeData.status === 'Canceled') statusValue = 'canceled';      // Map the data from form format to API format
    const apiTradeData = {      
      ticker: tradeData.ticker,
      trade_type: tradeData.direction.toLowerCase(),
      status: statusValue,
      entry_price: entryPrice,
      entry_date: tradeData.entryDate || new Date().toISOString(),
      entry_notes: tradeData.notes,  // Pass notes as-is, will be undefined if not provided
      exit_price: tradeData.exitPrice ? parseFloat(tradeData.exitPrice) : null,
      exit_date: tradeData.exitDate || null,
      position_size: shares,
      stop_loss: stopLoss > 0 ? stopLoss : null,
      take_profit: tradeData.takeProfit ? parseFloat(tradeData.takeProfit) : null,
      strategy: tradeData.strategy || "Other",
      setup_type: tradeData.setupType || "Other",
      timeframe: tradeData.timeframe || "Daily",
      market_conditions: tradeData.marketConditions || undefined,  // Don't force default
      instrument_type: tradeData.instrumentType || 'stock',
      tags: Array.isArray(tradeData.tags) ? tradeData.tags : [],
      partial_exits: tradeData.partial_exits || []
    };
    
    console.log('Sending API trade data:', apiTradeData);
    try {
      // Use the configured api instance which includes authentication headers
      const response = await api.post('/api/trades', apiTradeData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating trade:', error);
      
      // Enhanced error logging to see the specific validation error
      if (error.response && error.response.data) {
        console.error('Backend validation error:', error.response.data);
        
        // Check if there's a detailed error message
        if (error.response.data.detail) {
          console.error('Error detail:', error.response.data.detail);
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error preparing trade data:', error);
    throw error;
  }
};

// Update an existing trade
export const updateTrade = async (tradeData: any): Promise<Trade> => {
  console.log('Updating trade with data:', tradeData);
  
  if (!tradeData.id) {
    throw new Error('Trade ID is required for updates');
  }

  try {
    // Check if this is a notes-only update
    const isNotesOnlyUpdate = Object.keys(tradeData).length <= 3 && 
                             'notes' in tradeData && 
                             'id' in tradeData;
    
    // Parse values with fallbacks
    const entryPrice = parseFloat(tradeData.entryPrice) || 0;
    const stopLoss = parseFloat(tradeData.stopLoss) || 0;
    const shares = parseFloat(tradeData.shares) || 0;
    
    // Skip validation for notes-only updates
    if (!isNotesOnlyUpdate) {
      // Validate the basic data
      if (entryPrice <= 0) throw new Error('Entry price must be greater than 0');
      if (shares <= 0) throw new Error('Number of shares must be greater than 0');
      
      // Only validate stop loss if it's provided
      if (stopLoss > 0) {
        // For trade updates, allow protective stops (breakeven or profitable stops)
        // This is more flexible than initial trade creation
        const isLong = tradeData.direction === 'Long';
        
        // Allow any stop loss position for existing trades
        // Traders may want to:
        // 1. Move stop to breakeven (stop loss = entry price)
        // 2. Trail stops into profit (stop loss above entry for longs, below for shorts)
        // 3. Adjust stops based on new analysis
        
        // Optional: Add warning for unusual stop positions, but don't block
        const isProtectiveStop = isLong ? (stopLoss >= entryPrice) : (stopLoss <= entryPrice);
        if (isProtectiveStop) {
          // This is a protective stop (breakeven or profitable) - allow it
          console.log(`Protective stop detected: ${isLong ? 'Long' : 'Short'} trade with stop at ${stopLoss} vs entry ${entryPrice}`);
        }
        
        // No validation errors - allow all stop loss adjustments for existing trades
      }
    }
    
    let statusValue = 'active';
    if (tradeData.status === 'Open') statusValue = 'active';
    else if (tradeData.status === 'Closed') statusValue = 'closed';
    else if (tradeData.status === 'Planned') statusValue = 'planned';
    else if (tradeData.status === 'Canceled') statusValue = 'canceled';
      // Map the data from form format to API format
    const apiTradeData = {      
      ticker: tradeData.ticker,
      trade_type: tradeData.direction.toLowerCase(),
      status: statusValue,
      entry_price: entryPrice,
      entry_date: tradeData.entryDate,
      entry_notes: tradeData.notes,  // Pass notes as-is, will be undefined if not provided
      exit_price: tradeData.exitPrice ? parseFloat(tradeData.exitPrice) : null,
      exit_date: tradeData.exitDate,
      position_size: shares,
      stop_loss: stopLoss > 0 ? stopLoss : null,
      take_profit: tradeData.takeProfit ? parseFloat(tradeData.takeProfit) : null,
      strategy: tradeData.strategy,
      setup_type: tradeData.setupType,
      timeframe: tradeData.timeframe,
      market_conditions: 'Normal', // Default value
      instrument_type: tradeData.instrumentType || 'stock',
      tags: tradeData.tags || [],
      partial_exits: tradeData.partial_exits || []
    };
    
    console.log('Sending API trade update data:', apiTradeData);
    try {
      console.log('Sending API trade update data with URL:', `/api/trades/${tradeData.id}`);
      const response = await api.put(`/api/trades/${tradeData.id}`, apiTradeData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating trade:', error);
      
      // Enhanced error logging to see the specific validation error
      if (error.response && error.response.data) {
        console.error('Backend validation error:', error.response.data);
        
        // Check if there's a detailed error message
        if (error.response.data.detail) {
          console.error('Error detail:', error.response.data.detail);
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error preparing trade update:', error);
    throw error;
  }
};

// Delete a trade
export const deleteTrade = async (id: number): Promise<void> => {
  try {
    await api.delete(`/api/trades/${id}`);
  } catch (error) {
    console.error(`Error deleting trade with ID ${id}:`, error);
    throw error;
  }
};

// Settings interface for account configuration
export interface AccountSettings {
  starting_balance: number;
  current_balance: number;
  last_updated: string;
}

// API trade interface
interface ApiTrade {
  id: number;
  ticker: string;
  trade_type: 'long' | 'short';
  status: 'planned' | 'active' | 'closed' | 'canceled' | 'Open' | 'Closed';
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
  instrument_type?: string;
  tags?: string[];
  partial_exits?: PartialExit[];
}

// Helper function to format dates consistently and safely
const formatDateSafe = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'Invalid Date';
};

// Transform API trade to frontend format
const transformApiTrade = (trade: ApiTrade): Trade => ({
  ...trade,
  displayStatus: trade.status?.toLowerCase() === 'active' ? 'Open' : 
                trade.status?.toLowerCase() === 'closed' ? 'Closed' : 
                trade.status ? trade.status.charAt(0).toUpperCase() + trade.status.slice(1) : '',
  displayDirection: trade.trade_type === 'long' ? 'Long' : 'Short',
  displayDate: trade.status?.toLowerCase() === 'closed' && trade.exit_date
    ? formatDateSafe(trade.exit_date)
    : formatDateSafe(trade.entry_date)
});

// Multi-entry position management functions

export interface TradeEntryData {
  entry_price: number;
  entry_date: string;
  shares: number;
  stop_loss: number;
  notes?: string;
}

export interface PartialExitData {
  exit_price: number;
  exit_date: string;
  shares_sold: number;
  profit_loss: number;
  notes?: string;
}

export interface TradeDetailsResponse {
  trade: Trade;
  entries: any[];
  exits: any[];
  calculated: {
    current_shares: number;
    avg_entry_price: number;
    total_invested: number;
    total_risk: number;
    entries_count: number;
    exits_count: number;
  };
}

export async function addToPosition(tradeId: number, entryData: TradeEntryData): Promise<any> {
  try {
    const response = await api.post(`/api/trades/${tradeId}/entries`, entryData);
    return response.data;
  } catch (error) {
    console.error('Error adding to position:', error);
    throw error;
  }
}

export async function sellFromPosition(tradeId: number, exitData: PartialExitData): Promise<any> {
  try {
    const response = await api.post(`/api/trades/${tradeId}/exits`, exitData);
    return response.data;
  } catch (error) {
    console.error('Error selling from position:', error);
    throw error;
  }
}

export async function getTradeDetails(tradeId: number): Promise<TradeDetailsResponse> {
  try {
    const response = await api.get(`/api/trades/${tradeId}/details`);
    return response.data;
  } catch (error) {
    console.error('Error getting trade details:', error);
    throw error;
  }
}
