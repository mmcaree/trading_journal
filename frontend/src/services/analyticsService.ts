import axios from 'axios';
import { debugAnalyticsData } from './debugService';
import api from './apiConfig';

// In Vite, use import.meta.env instead of process.env
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8000');

// Analytics data types
export interface AnalyticsData {
  performance: {
    daily: { date: string; value: number }[];
    weekly: { week: string; value: number }[];
    monthly: { month: string; value: number }[];
    ytd: { month: string; value: number }[];
    all: { period: string; value: number }[];
  };
  winLoss: {
    winCount: number;
    lossCount: number;
    winRate: number;
  };
  profitLoss: {
    totalProfit: number;
    totalLoss: number;
    netProfitLoss: number;
    avgProfit: number;
    avgLoss: number;
  };
  strategies: {
    name: string;
    trades: number;
    winRate: number;
    avgReturn: number;
  }[];
  setups: {
    name: string;
    trades: number;
    winRate: number;
    avgReturn: number;
  }[];
}

// Helper function to format date objects into strings
const formatDate = (date: Date): string => {
  // Use local date to avoid timezone issues that can shift days
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get week information from a date
const getWeekInfo = (date: Date): string => {
  const oneJan = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((date.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `Week ${weekNumber}`;
};

// Helper function to get month name
const getMonthName = (date: Date): string => {
  return date.toLocaleString('en-US', { month: 'short' });
};

// Fetch analytics data from real API endpoints
export const fetchAnalyticsData = async (): Promise<AnalyticsData> => {
  try {
    console.log('Fetching analytics data from API...');
    
    // Get debug info first to help diagnose issues
    try {
      const debugData = await debugAnalyticsData();
      console.log('Analytics debug data:', debugData);
    } catch (debugError) {
      console.warn('Failed to get debug data, continuing with regular analytics fetch', debugError);
    }
    
    // Get auth token directly - as a fallback in case interceptors aren't working
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    console.log('Using auth token:', token ? 'Yes' : 'No');
    
    // Fetch trades for performance data - these will be our fallback data source
    // if the analytics endpoints fail
    const tradesResponse = await api.get(`/api/trades/`, { headers });
    const trades = tradesResponse.data;
    console.log('Fetched trades:', trades.length);
    
    let metricsData;
    let setupsData;
      try {
      // Fetch performance metrics from the backend
      const metricsResponse = await api.get(`/api/analytics/performance`, { headers });
      metricsData = metricsResponse.data;
      console.log('Fetched metrics from API:', metricsData);
    } catch (error) {
      console.warn('Error fetching metrics from API, trying debug endpoint', error);
      
      // Try the debug endpoint (no auth required)
      try {
        const debugResponse = await api.get(`/api/analytics/performance-debug`);
        metricsData = debugResponse.data;
        console.log('Fetched metrics from debug API:', metricsData);
      } catch (debugError) {
        console.warn('Error fetching from debug endpoint, will calculate from trades', debugError);
        metricsData = null;
      }
    }
    
    try {
      // Fetch setup performance from the backend
      const setupsResponse = await api.get(`/api/analytics/setups`, { headers });
      setupsData = setupsResponse.data;
      console.log('Fetched setups from API:', setupsData);
    } catch (error) {
      console.warn('Error fetching setups from API, trying debug endpoint', error);
      
      // Try the debug endpoint (no auth required)
      try {
        const debugResponse = await api.get(`/api/analytics/setups-debug`);
        setupsData = debugResponse.data;
        console.log('Fetched setups from debug API:', setupsData);
      } catch (debugError) {
        console.warn('Error fetching from debug endpoint, will calculate from trades', debugError);
        setupsData = null;
      }
    }
    
    // Fetch detailed partial exits data for performance charts
    let partialExitsData = [];
    try {
      const partialExitsResponse = await api.get('/api/analytics/partial-exits-detail', { headers });
      partialExitsData = partialExitsResponse.data;
      console.log('Fetched partial exits for charts:', partialExitsData.length);
    } catch (error) {
      console.warn('Could not fetch detailed partial exits for charts, continuing without them:', error);
    }
    
    // Process trades for performance data (daily, weekly, monthly) including partial exits
    const performanceData = processTradesForPerformance(trades, partialExitsData);
    
    // Calculate win/loss data from trades if API failed
    let winLossData;
    if (metricsData) {
      winLossData = {
        winCount: metricsData.winning_trades,
        lossCount: metricsData.losing_trades,
        winRate: metricsData.win_rate / 100 // Convert from percentage to decimal
      };
    } else {
      winLossData = calculateWinLossData(trades);
    }
    
    // Calculate profit/loss data from trades if API failed
    // Fetch and add realized P&L from all partial exits
    let totalRealizedPnl = 0;
    try {
      const partialExitsResponse = await api.get('/api/analytics/partial-exits-summary', { headers });
      totalRealizedPnl = partialExitsResponse.data.total_realized_pnl || 0;
      console.log('Total realized P&L from partial exits:', totalRealizedPnl);
    } catch (error) {
      console.warn('Could not fetch realized P&L for analytics, continuing without it:', error);
    }

    let profitLossData;
    if (metricsData) {
      profitLossData = {
        totalProfit: metricsData.average_profit * metricsData.winning_trades,
        totalLoss: metricsData.average_loss * metricsData.losing_trades,
        netProfitLoss: metricsData.total_profit_loss + totalRealizedPnl,
        avgProfit: metricsData.average_profit,
        avgLoss: metricsData.average_loss
      };
    } else {
      profitLossData = calculateProfitLossData(trades);
      // Add realized P&L to the fallback calculation as well
      profitLossData.netProfitLoss += totalRealizedPnl;
    }
    
  // Process strategies data by grouping trades by strategy field
  const strategiesData = processTradesByStrategy(trades);
  
  // Process setups data from the backend response or calculate from trades
  let setupsProcessed;
  if (setupsData) {
    setupsProcessed = setupsData.map((setup: any) => ({
      name: setup.setup_type,
      trades: setup.trade_count,
      winRate: setup.win_rate / 100, // Convert from percentage to decimal
      avgReturn: setup.average_profit_loss
    }));
    } else {
      // Process setups data by grouping trades by setup_type field (closed trades only)
      setupsProcessed = processTradesBySetup(trades);
    }    return {
      performance: performanceData,
      winLoss: winLossData,
      profitLoss: profitLossData,
      strategies: strategiesData,
      setups: setupsProcessed
    };
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    // Return empty data structure instead of mock data
    return {
      performance: {
        daily: [],
        weekly: [],
        monthly: [],
        ytd: [],
        all: []
      },
      winLoss: {
        winCount: 0,
        lossCount: 0,
        winRate: 0
      },
      profitLoss: {
        totalProfit: 0,
        totalLoss: 0,
        netProfitLoss: 0,
        avgProfit: 0,
        avgLoss: 0
      },
      strategies: [],
      setups: []
    };
  }
};

// Helper function to process trades for performance charts
const processTradesForPerformance = (trades: any[], partialExitsData: any[] = []) => {
  // Filter to closed trades with valid exit_date and profit_loss
  const closedTrades = trades.filter(trade => 
    trade.status?.toLowerCase() === 'closed' && 
    trade.exit_date && 
    trade.profit_loss !== null && 
    trade.profit_loss !== undefined
  );
  
  console.log('Processing performance data for trades:', closedTrades.length);
  console.log('Processing performance data for partial exits:', partialExitsData.length);
  
  // Group by daily
  const dailyMap = new Map<string, number>();
  // Group by weekly
  const weeklyMap = new Map<string, number>();
  // Group by monthly
  const monthlyMap = new Map<string, number>();
  // Group by YTD (Year to Date)
  const ytdMap = new Map<string, number>();
  // Group by all time (yearly)
  const allMap = new Map<string, number>();
  
  const currentYear = new Date().getFullYear();
  
  closedTrades.forEach(trade => {
    const exitDate = new Date(trade.exit_date);
    const tradeYear = exitDate.getFullYear();
    
    // Format for daily
    const dateStr = formatDate(exitDate);
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + trade.profit_loss);
    
    // Format for weekly
    const weekStr = getWeekInfo(exitDate);
    weeklyMap.set(weekStr, (weeklyMap.get(weekStr) || 0) + trade.profit_loss);
    
    // Format for monthly
    const monthStr = getMonthName(exitDate);
    monthlyMap.set(monthStr, (monthlyMap.get(monthStr) || 0) + trade.profit_loss);
    
    // Format for YTD (only current year)
    if (tradeYear === currentYear) {
      const ytdMonthStr = `${getMonthName(exitDate)} ${tradeYear}`;
      ytdMap.set(ytdMonthStr, (ytdMap.get(ytdMonthStr) || 0) + trade.profit_loss);
    }
    
    // Format for all time (by year)
    const yearStr = tradeYear.toString();
    allMap.set(yearStr, (allMap.get(yearStr) || 0) + trade.profit_loss);
  });
  
  // Process partial exits and add them to the performance data
  partialExitsData.forEach(exit => {
    if (exit.exit_date && exit.profit_loss) {
      const exitDate = new Date(exit.exit_date);
      const exitYear = exitDate.getFullYear();
      const currentYear = new Date().getFullYear();
      
      // Format for daily
      const dateStr = formatDate(exitDate);
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + exit.profit_loss);
      
      // Format for weekly
      const weekStr = getWeekInfo(exitDate);
      weeklyMap.set(weekStr, (weeklyMap.get(weekStr) || 0) + exit.profit_loss);
      
      // Format for monthly
      const monthStr = getMonthName(exitDate);
      monthlyMap.set(monthStr, (monthlyMap.get(monthStr) || 0) + exit.profit_loss);
      
      // Format for YTD (only current year)
      if (exitYear === currentYear) {
        const ytdMonthStr = `${getMonthName(exitDate)} ${exitYear}`;
        ytdMap.set(ytdMonthStr, (ytdMap.get(ytdMonthStr) || 0) + exit.profit_loss);
      }
      
      // Format for all time (by year)
      const yearStr = exitYear.toString();
      allMap.set(yearStr, (allMap.get(yearStr) || 0) + exit.profit_loss);
    }
  });
  
  // Convert maps to sorted arrays
  const daily = Array.from(dailyMap, ([date, value]) => ({ date, value }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  const weekly = Array.from(weeklyMap, ([week, value]) => ({ week, value }))
    .sort((a, b) => {
      const weekNumA = parseInt(a.week.split(' ')[1]);
      const weekNumB = parseInt(b.week.split(' ')[1]);
      return weekNumA - weekNumB;
    });
    
  const monthly = Array.from(monthlyMap, ([month, value]) => ({ month, value }))
    .sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.indexOf(a.month) - months.indexOf(b.month);
    });
    
  const ytd = Array.from(ytdMap, ([month, value]) => ({ month, value }))
    .sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthA = a.month.split(' ')[0];
      const monthB = b.month.split(' ')[0];
      return months.indexOf(monthA) - months.indexOf(monthB);
    });
    
  const all = Array.from(allMap, ([period, value]) => ({ period, value }))
    .sort((a, b) => parseInt(a.period) - parseInt(b.period));
  
  return { daily, weekly, monthly, ytd, all };
};

// Helper function to process trades by strategy field
const processTradesByStrategy = (trades: any[]) => {
  // Group trades by strategy field
  const strategiesMap = new Map<string, { 
    trades: number, 
    wins: number, 
    totalReturn: number,
    originalName: string 
  }>();
  
  trades.forEach(trade => {
    if (!trade.strategy) return; // Use actual strategy column
    
    const strategy = trade.strategy.toLowerCase(); // Case-insensitive grouping
    const originalName = trade.strategy; // Keep original case for display
    
    if (!strategiesMap.has(strategy)) {
      strategiesMap.set(strategy, { trades: 0, wins: 0, totalReturn: 0, originalName });
    }
    
    const data = strategiesMap.get(strategy)!;
    data.trades += 1; // Count all trades with strategy data
    
    // Only count wins/losses for closed trades (same logic as setups)
    if (trade.status?.toLowerCase() === 'closed' && trade.profit_loss !== null && trade.profit_loss !== undefined && isFinite(trade.profit_loss)) {
      if (safeNumber(trade.profit_loss) > 0) {
        data.wins += 1;
      }
      
      // Calculate percentage return: use profit_loss_percent if available, otherwise calculate from profit_loss/position_value
      let percentReturn = 0;
      if (trade.profit_loss_percent !== null && trade.profit_loss_percent !== undefined && isFinite(trade.profit_loss_percent)) {
        percentReturn = safeNumber(trade.profit_loss_percent);
      } else if (trade.position_value && trade.position_value > 0) {
        percentReturn = (safeNumber(trade.profit_loss) / safeNumber(trade.position_value)) * 100;
      } else {
        percentReturn = 0; // Can't calculate percentage without position value
      }
      
      data.totalReturn += percentReturn;
    }
  });
  
  // Convert map to array for strategies view
  return Array.from(strategiesMap, ([strategy, data]) => ({
    name: data.originalName, // Use original case for display
    trades: data.trades,
    winRate: data.trades > 0 ? data.wins / data.trades : 0,
    avgReturn: data.trades > 0 ? data.totalReturn / data.trades : 0
  }));
};

// Helper function to ensure numbers are valid for JSON
const safeNumber = (value: any): number => {
  // Handle possible NaN, Infinity, or other invalid JSON values
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return 0;
  }
  return Number(value);
};

// Calculate win/loss data directly from trades
const calculateWinLossData = (trades: any[]) => {
  // Filter to closed trades with valid profit_loss
  const closedTrades = trades.filter(trade => 
    trade.status?.toLowerCase() === 'closed' && 
    trade.profit_loss !== null && 
    trade.profit_loss !== undefined &&
    isFinite(trade.profit_loss)
  );
  
  console.log('Calculating win/loss data from trades:', closedTrades.length);
  
  if (closedTrades.length === 0) {
    return { winCount: 0, lossCount: 0, winRate: 0 };
  }
  
  const winCount = closedTrades.filter(trade => safeNumber(trade.profit_loss) > 0).length;
  const lossCount = closedTrades.filter(trade => safeNumber(trade.profit_loss) <= 0).length;
  const winRate = winCount / closedTrades.length;
  
  return { winCount, lossCount, winRate };
};

// Calculate profit/loss data directly from trades
const calculateProfitLossData = (trades: any[]) => {
  // Filter to closed trades with valid profit_loss
  const closedTrades = trades.filter(trade => 
    trade.status?.toLowerCase() === 'closed' && 
    trade.profit_loss !== null && 
    trade.profit_loss !== undefined &&
    isFinite(trade.profit_loss)
  );
  
  console.log('Calculating profit/loss data from trades:', closedTrades.length);
  
  if (closedTrades.length === 0) {
    return {
      totalProfit: 0,
      totalLoss: 0,
      netProfitLoss: 0,
      avgProfit: 0,
      avgLoss: 0
    };
  }
  
  const winningTrades = closedTrades.filter(trade => safeNumber(trade.profit_loss) > 0);
  const losingTrades = closedTrades.filter(trade => safeNumber(trade.profit_loss) <= 0);
  
  const totalProfit = winningTrades.reduce((sum, trade) => sum + safeNumber(trade.profit_loss), 0);
  const totalLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + safeNumber(trade.profit_loss), 0));
  const netProfitLoss = totalProfit - totalLoss;
  
  const avgProfit = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
  
  return {
    totalProfit,
    totalLoss,
    netProfitLoss,
    avgProfit,
    avgLoss
  };
};

// Process trades by setup type
// Helper function to process trades by setup type for setups view (closed trades only)
const processTradesBySetup = (trades: any[]) => {
  // Helper function to get the best available profit/loss value
  const getProfitLoss = (trade: any): number => {
    if (trade.total_profit_loss !== null && trade.total_profit_loss !== undefined) {
      return trade.total_profit_loss;
    }
    return trade.profit_loss || 0;
  };
  
  // Filter to trades with setup type
  const tradesWithSetup = trades.filter(trade => !!trade.setup_type);
  
  console.log('Processing trades by setup type (closed trades only):', tradesWithSetup.length);
  
  if (tradesWithSetup.length === 0) {
    return [];
  }
  
  // Group trades by setup type - only closed trades with finalized P&L
  const setupMap = new Map<string, {
    trades: number,
    wins: number,
    totalReturn: number,
    originalName: string
  }>();
  
  tradesWithSetup.forEach(trade => {
    const setup = trade.setup_type.toLowerCase(); // Case-insensitive grouping
    const originalName = trade.setup_type; // Keep original case for display
    
    if (!setupMap.has(setup)) {
      setupMap.set(setup, { trades: 0, wins: 0, totalReturn: 0, originalName });
    }
    
    const data = setupMap.get(setup)!;
    data.trades += 1;
    
    if (trade.status?.toLowerCase() === 'closed' && 
        ((trade.total_profit_loss !== null && trade.total_profit_loss !== undefined) ||
         (trade.profit_loss !== null && trade.profit_loss !== undefined))) {
      const tradePL = getProfitLoss(trade);
      if (safeNumber(tradePL) > 0) {
        data.wins += 1;
      }
      
      // Calculate percentage return: use profit_loss_percent if available, otherwise calculate from total P&L/position_value
      let percentReturn = 0;
      if (trade.profit_loss_percent !== null && trade.profit_loss_percent !== undefined && isFinite(trade.profit_loss_percent)) {
        percentReturn = safeNumber(trade.profit_loss_percent);
      } else if (trade.position_value && trade.position_value > 0) {
        percentReturn = (safeNumber(tradePL) / safeNumber(trade.position_value)) * 100;
      } else {
        percentReturn = 0; // Can't calculate percentage without position value
      }
      
      data.totalReturn += percentReturn;
    }
  });
  
  // Convert map to array
  return Array.from(setupMap, ([setup, data]) => ({
    name: data.originalName, // Use original case for display
    trades: data.trades,
    winRate: data.trades > 0 ? data.wins / data.trades : 0,
    avgReturn: data.trades > 0 ? data.totalReturn / data.trades : 0
  }));
};

export default {
  fetchAnalyticsData
};
