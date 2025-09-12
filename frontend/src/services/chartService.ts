// Chart service for fetching stock chart data
import api from './apiConfig';

export interface ChartDataPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeInfo {
  id: number;
  entry_price: number;
  exit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  position_size: number;
  trade_type: string;
  status: string;
}

export interface ChartData {
  ticker: string;
  entry_date: string;
  exit_date?: string;
  timeframes: {
    '1d'?: ChartDataPoint[];
    '1h'?: ChartDataPoint[];
    '5m'?: ChartDataPoint[];
    '1m'?: ChartDataPoint[];
  };
  trade_info?: TradeInfo;
}

export interface TickerPrice {
  ticker: string;
  current_price: number;
  timestamp: string;
}

// Get chart data for a specific trade
export const getTradeChartData = async (tradeId: number): Promise<ChartData> => {
  try {
    const response = await api.get(`/api/charts/trade/${tradeId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching trade chart data:', error);
    throw new Error(error.response?.data?.detail || 'Failed to fetch chart data');
  }
};

// Get chart data for any ticker
export const getTickerChartData = async (ticker: string, days: number = 30): Promise<ChartData> => {
  try {
    const response = await api.get(`/api/charts/ticker/${ticker}?days=${days}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching ticker chart data:', error);
    throw new Error(error.response?.data?.detail || 'Failed to fetch chart data');
  }
};

// Get current price for a ticker
export const getCurrentPrice = async (ticker: string): Promise<TickerPrice> => {
  try {
    const response = await api.get(`/api/charts/price/${ticker}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching current price:', error);
    throw new Error(error.response?.data?.detail || 'Failed to fetch current price');
  }
};

// Helper function to get the best available timeframe for a date range
export const getBestTimeframe = (chartData: ChartData, daysSpan: number): string => {
  const { timeframes } = chartData;
  
  // For shorter periods, prefer higher resolution
  if (daysSpan <= 1 && timeframes['1m'] && timeframes['1m'].length > 0) {
    return '1m';
  }
  if (daysSpan <= 7 && timeframes['5m'] && timeframes['5m'].length > 0) {
    return '5m';
  }
  if (daysSpan <= 30 && timeframes['1h'] && timeframes['1h'].length > 0) {
    return '1h';
  }
  
  // Default to daily
  return '1d';
};

// Helper function to format price for display
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price);
};

// Helper function to format volume
export const formatVolume = (volume: number): string => {
  if (volume >= 1e9) {
    return (volume / 1e9).toFixed(1) + 'B';
  }
  if (volume >= 1e6) {
    return (volume / 1e6).toFixed(1) + 'M';
  }
  if (volume >= 1e3) {
    return (volume / 1e3).toFixed(1) + 'K';
  }
  return volume.toString();
};