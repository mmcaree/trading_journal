import api, { API_URL } from './apiConfig';
import axios from 'axios';

export interface PartialExit {
  exit_price: number;
  exit_date: string;
  shares_sold: number;
  profit_loss: number;
  notes?: string;
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
  
  console.log("Calculating P&L for trade:", trade);
  
  if (trade.partial_exits && Array.isArray(trade.partial_exits)) {
    total += trade.partial_exits.reduce((sum: number, exit: any) => sum + (exit.profit_loss || 0), 0);
  }
  
  const profit = trade.profit_loss || trade.resultAmount || trade.profitLoss || 0;
  console.log("Found profit value:", profit);
  
  const isClosedTrade = 
    (trade.status && trade.status.toLowerCase() === 'closed') ||
    (trade.displayStatus && trade.displayStatus === 'Closed');
    
  if (isClosedTrade) {
    total += profit;
    console.log("Adding profit to total:", profit, "New total:", total);
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
    const trades = normalizedTrades.sort((a, b) => 
      new Date(b.entry_date || b.entryDate).getTime() - new Date(a.entry_date || a.entryDate).getTime()
    );

    console.log("Normalized trades for dashboard:", trades);
    console.log("Number of trades:", trades.length);
    
    // Calculate basic metrics
    const totalTrades = trades.length;
    const openTrades = trades.filter(trade => 
      trade.status === 'active' || trade.status === 'Open' || trade.status === 'OPEN'
    ).length;
      // Calculate win rate from closed trades
    const closedTrades = trades.filter(trade => trade.status?.toLowerCase() === 'closed');
    console.log("Number of closed trades:", closedTrades.length);
    
    // Calculate P&L directly from API values
    const tradeProfits = closedTrades.map(trade => {
      const profitValue = trade.profit_loss || 0;
      console.log(`Trade ${trade.id} profit: ${profitValue}`);
      return profitValue;
    });
    
    console.log('Calculated trade profits:', tradeProfits);
    
    const winningTrades = tradeProfits.filter(profit => profit > 0);
    console.log("Number of winning trades:", winningTrades.length);
    
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;
      
    console.log("Calculated win rate:", winRate);

    // Calculate total P&L directly
    const totalProfitLoss = closedTrades.reduce((sum, trade) => {
      return sum + (trade.profit_loss || 0);
    }, 0);
    
    console.log('Calculated total P&L:', totalProfitLoss);// Create dashboard data object
    const dashboardData: DashboardData = {
      totalTrades,
      openTrades,
      winRate: Number(winRate.toFixed(1)),
      profitLoss: Number(totalProfitLoss.toFixed(2)),
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
      trade.partial_exits.forEach(exit => {
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

      // Calculate risk percentage using user's actual account size
      const riskPercent = trade.total_risk ? ((trade.total_risk / userAccountSize) * 100).toFixed(2) : null;

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
    const risk = apiTrade.total_risk || (apiTrade.risk_per_share * apiTrade.position_size);      // Transform the trade data
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
      status: apiTrade.status?.toLowerCase() === 'active' ? 'Open' : 
              apiTrade.status?.toLowerCase() === 'closed' ? 'Closed' : 
              apiTrade.status ? apiTrade.status.charAt(0).toUpperCase() + apiTrade.status.slice(1) : '',
      direction: apiTrade.trade_type === 'long' ? 'Long' : 'Short',
      result: apiTrade.profit_loss_percent || (apiTrade.profit_loss && risk ? ((apiTrade.profit_loss / risk) * 100) : null),
      resultAmount: apiTrade.profit_loss,
      risk: risk,
      stopLoss: apiTrade.stop_loss,
      takeProfit: apiTrade.take_profit,
      notes: apiTrade.entry_notes || '',
      imageUrls: [],  // No image URLs from the API currently
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
      // Determine if the trade direction makes sense with the stop loss
      const isLong = tradeData.direction === 'Long';
      const isValidTrade = isLong ? (entryPrice > stopLoss) : (stopLoss > entryPrice);
      
      if (!isValidTrade) {
        throw new Error(
          isLong 
            ? 'For Long trades, stop loss must be lower than entry price' 
            : 'For Short trades, stop loss must be higher than entry price'
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
      tags: Array.isArray(tradeData.tags) ? tradeData.tags : [],
      partial_exits: tradeData.partial_exits || []
    };
    
    console.log('Sending API trade data:', apiTradeData);
    try {
      // Make a direct axios call with explicit headers for debugging
      const url = `${API_URL}/api/trades`;
      console.log('Sending API trade data with URL:', url);
      
      const response = await axios.post(url, apiTradeData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
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
    // Parse values with fallbacks
    const entryPrice = parseFloat(tradeData.entryPrice) || 0;
    const stopLoss = parseFloat(tradeData.stopLoss) || 0;
    const shares = parseFloat(tradeData.shares) || 0;
    
    // Validate the basic data
    if (entryPrice <= 0) throw new Error('Entry price must be greater than 0');
    if (shares <= 0) throw new Error('Number of shares must be greater than 0');
    
    // Only validate stop loss if it's provided
    if (stopLoss > 0) {
      const isLong = tradeData.direction === 'Long';
      const isValidTrade = isLong ? (entryPrice > stopLoss) : (stopLoss > entryPrice);
      
      if (!isValidTrade) {
        throw new Error(
          isLong 
            ? 'For Long trades, stop loss must be lower than entry price' 
            : 'For Short trades, stop loss must be higher than entry price'
        );
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
  setup_type: string;
  timeframe: string;
  market_conditions?: string;
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
