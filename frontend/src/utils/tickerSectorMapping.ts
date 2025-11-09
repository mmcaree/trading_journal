// Ticker to Sector/Industry Mapping Utility
import tickerDataJson from './tickerData.json';

export interface TickerData {
  symbol: string;
  sector: string;
  industry: string;
}

// Load the ticker data from JSON file
const tickerDataMap: Record<string, { sector: string; industry: string }> = tickerDataJson as Record<string, { sector: string; industry: string }>;

// Initialize status
let isDataLoaded = true; // Data is loaded immediately from JSON

// Get sector for a ticker symbol
export const getTickerSector = (symbol: string): string => {
  const ticker = symbol.toUpperCase();
  const data = tickerDataMap[ticker];
  
  if (data) {
    return data.sector;
  }
  
  // Fallback logic for unknown tickers
  if (ticker.includes('ETF') || ticker.includes('SPY') || ticker.includes('QQQ') || ticker.includes('IWM') || ticker.includes('VTI')) {
    return 'ETF';
  }
  
  // Default fallback
  return 'Other';
};

// Get industry for a ticker symbol
export const getTickerIndustry = (symbol: string): string => {
  const ticker = symbol.toUpperCase();
  const data = tickerDataMap[ticker];
  
  if (data) {
    return data.industry;
  }
  
  return 'Unknown';
};

// Get both sector and industry
export const getTickerData = (symbol: string): TickerData => {
  const ticker = symbol.toUpperCase();
  const data = tickerDataMap[ticker];
  
  if (data) {
    return {
      symbol: ticker,
      sector: data.sector,
      industry: data.industry
    };
  }
  
  return {
    symbol: ticker,
    sector: getTickerSector(ticker),
    industry: getTickerIndustry(ticker)
  };
};

// Get total number of tickers in database
export const getTickerCount = (): number => {
  return Object.keys(tickerDataMap).length;
};