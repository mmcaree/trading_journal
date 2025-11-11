import api from './apiConfig';

// =====================================================
// NEW UNIFIED POSITIONS SERVICE 
// Uses /api/v2/positions endpoints exclusively
// Replaces all tradeService.ts functionality
// =====================================================

// Simple in-memory cache for performance
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
const CACHE_TTL = 30000; // 30 seconds cache TTL

function getCacheKey(endpoint: string, params?: any): string {
  return `${endpoint}_${JSON.stringify(params || {})}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

// Clear cache when data changes
function clearPositionsCache(): void {
  for (const key of cache.keys()) {
    if (key.includes('positions')) {
      cache.delete(key);
    }
  }
}

// Core interfaces that match our new API
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
  return_percent?: number; // Return percentage for closed positions
  original_risk_percent?: number; // Original risk % when opened
  current_risk_percent?: number;  // Current risk % based on current stop
  original_shares?: number;       // Shares when position opened
  account_value_at_entry?: number; // Account value when opened
  // Options-specific fields
  strike_price?: number;
  expiration_date?: string;
  option_type?: 'CALL' | 'PUT';
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

export interface PendingOrder {
  id: number;
  symbol: string;
  side: string; // Buy/Sell
  status: string; // pending/cancelled/etc
  shares: number;
  price?: number;
  order_type?: string;
  placed_time: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
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
  account_balance_at_entry?: number;  // Account balance when position is created
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

// =====================================================
// CORE POSITION FUNCTIONS
// =====================================================

/**
 * Get all positions with events for analytics
 * Returns positions with their event history for time-based analysis
 */
export async function getAllPositionsWithEvents(filters?: {
  status?: 'open' | 'closed';
  ticker?: string;
  strategy?: string;
  skip?: number;
  limit?: number;
}): Promise<(Position & { events?: PositionEvent[] })[]> {
  try {
    const params = new URLSearchParams();
    
    // Always request events for analytics
    params.append('include_events', 'true');
    
    if (filters?.status) params.append('status', filters.status);
    if (filters?.ticker) params.append('ticker', filters.ticker);
    if (filters?.strategy) params.append('strategy', filters.strategy);
    if (filters?.skip) params.append('skip', filters.skip.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const url = `/api/v2/positions/?${params.toString()}`;
    const response = await api.get(url);
    
    return response.data;
  } catch (error) {
    console.error('Error fetching positions with events:', error);
    throw error;
  }
}

/**
 * Get all positions with optional filtering
 * Replaces: getPositions(), fetchTrades()
 */
export async function getAllPositions(filters?: {
  status?: 'open' | 'closed';
  ticker?: string;
  strategy?: string;
  skip?: number;
  limit?: number;
}): Promise<Position[]> {
  try {
    // Check cache first for common requests
    const cacheKey = getCacheKey('positions', filters);
    const cached = getFromCache<Position[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams();
    
    if (filters?.status) params.append('status', filters.status);
    if (filters?.ticker) params.append('ticker', filters.ticker);
    if (filters?.strategy) params.append('strategy', filters.strategy);
    if (filters?.skip) params.append('skip', filters.skip.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const url = `/api/v2/positions/${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await api.get(url);
    
    // Cache the result
    setCache(cacheKey, response.data);
    
    return response.data;
  } catch (error) {
    console.error('Error fetching positions:', error);
    throw error;
  }
}

/**
 * Get detailed position information with event history
 * Replaces: getPositionDetails(), fetchTrade(), getTradeDetails()
 */
export async function getPositionDetails(positionId: number): Promise<PositionDetails> {
  try {
    const response = await api.get(`/api/v2/positions/${positionId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching position details for ID ${positionId}:`, error);
    throw error;
  }
}

/**
 * Create a new position with initial buy event
 * Replaces: createTrade()
 */
export async function createPosition(positionData: CreatePositionData): Promise<Position> {
  try {
    const response = await api.post('/api/v2/positions/', positionData);
    // Clear cache after creating new position
    clearPositionsCache();
    return response.data;
  } catch (error) {
    console.error('Error creating position:', error);
    throw error;
  }
}

/**
 * Add shares to existing position (buy event)
 * Replaces: addToPosition(), addToPositionGroup()
 */
export async function addToPosition(positionId: number, eventData: Omit<AddEventData, 'event_type'>): Promise<PositionEvent> {
  try {
    const buyEventData = { ...eventData, event_type: 'buy' as const };
    const response = await api.post(`/api/v2/positions/${positionId}/events`, buyEventData);
    // Clear cache after position changes
    clearPositionsCache();
    return response.data;
  } catch (error) {
    console.error('Error adding to position:', error);
    throw error;
  }
}

/**
 * Sell shares from position (sell event)
 * Replaces: sellFromPosition(), sellFromPositionGroup()
 */
export async function sellFromPosition(positionId: number, eventData: Omit<AddEventData, 'event_type'>): Promise<PositionEvent> {
  try {
    const sellEventData = { ...eventData, event_type: 'sell' as const };
    const response = await api.post(`/api/v2/positions/${positionId}/events`, sellEventData);
    return response.data;
  } catch (error) {
    console.error('Error selling from position:', error);
    throw error;
  }
}

/**
 * Update position metadata (notes, lessons, etc.)
 * Replaces: updateTrade()
 */
export async function updatePosition(positionId: number, updates: {
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  notes?: string;
  lessons?: string;
  mistakes?: string;
}): Promise<Position> {
  try {
    const response = await api.put(`/api/v2/positions/${positionId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating position:', error);
    throw error;
  }
}

/**
 * Delete a position
 * Replaces: deleteTrade()
 */
export async function deletePosition(positionId: number): Promise<void> {
  try {
    await api.delete(`/api/v2/positions/${positionId}`);
    clearPositionsCache(); // Clear from cache
  } catch (error) {
    console.error('Error deleting position:', error);
    throw error;
  }
}

// =====================================================
// EVENT EDITING FUNCTIONS
// =====================================================

/**
 * Update event with comprehensive editing (shares, price, date, risk management)
 */
export async function updateEventComprehensive(eventId: number, updates: {
  shares?: number;
  price?: number;
  event_date?: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}): Promise<PositionEvent> {
  try {
    const response = await api.put(`/api/v2/positions/events/${eventId}/comprehensive`, updates);
    clearPositionsCache(); // Clear cache since event changed
    return response.data;
  } catch (error) {
    console.error('Error updating event comprehensively:', error);
    throw error;
  }
}

/**
 * Update event risk management only (legacy method)
 */
export async function updateEventRiskManagement(eventId: number, updates: {
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}): Promise<PositionEvent> {
  try {
    const response = await api.put(`/api/v2/positions/events/${eventId}`, updates);
    clearPositionsCache(); // Clear cache since event changed
    return response.data;
  } catch (error) {
    console.error('Error updating event risk management:', error);
    throw error;
  }
}

/**
 * Delete a specific event
 */
export async function deleteEvent(eventId: number): Promise<void> {
  try {
    await api.delete(`/api/v2/positions/events/${eventId}`);
    clearPositionsCache(); // Clear cache since event was deleted
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

/**
 * Fetch pending orders for a position
 * Used for imported positions to get sub-lot breakdown
 */
export async function fetchPendingOrders(positionId: number): Promise<PendingOrder[]> {
  try {
    const response = await api.get(`/api/v2/positions/${positionId}/pending-orders`);
    return response.data;
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    throw error;
  }
}

export async function updatePendingOrder(orderId: number, updates: Partial<PendingOrder>): Promise<PendingOrder> {
  try {
    const response = await api.put(`/api/v2/positions/pending-orders/${orderId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating pending order:', error);
    throw error;
  }
}

// =====================================================
// CONVENIENCE FUNCTIONS FOR UI COMPONENTS
// =====================================================

/**
 * Get open positions only (for Positions page)
 * Replaces: getPositions()
 */
export async function getOpenPositions(): Promise<Position[]> {
  return getAllPositions({ status: 'open' });
}

/**
 * Get closed positions only (for Trades page) 
 * Replaces: fetchTrades() with status filter
 */
export async function getClosedPositions(): Promise<Position[]> {
  return getAllPositions({ status: 'closed' });
}

/**
 * Get all positions regardless of status (for dashboard/analytics)
 * Replaces: fetchTrades() without filters
 */
export async function getAllPositionsForAnalytics(): Promise<Position[]> {
  return getAllPositions({ limit: 100000 }); // Get all positions for analytics - increase limit significantly
}

// =====================================================
// LEGACY INTERFACE COMPATIBILITY
// =====================================================

/**
 * Transform Position to legacy Trade interface for gradual migration
 * This allows existing components to work while we migrate them
 */
export function positionToLegacyTrade(position: Position): any {
  return {
    id: position.id,
    ticker: position.ticker,
    entryDate: position.opened_at,
    exitDate: position.closed_at,
    entryPrice: position.avg_entry_price || 0,
    exitPrice: null, // Will need to calculate from events if needed
    strategy: position.strategy || 'Unknown',
    setupType: position.setup_type || 'Unknown',
    timeframe: position.timeframe || 'Daily',
    status: position.status === 'open' ? 'Open' : 'Closed',
    shares: position.current_shares,
    result: position.total_realized_pnl,
    resultAmount: position.total_realized_pnl,
    notes: position.notes || '',
    // Add more mappings as needed
  };
}

/**
 * Transform PositionEvent to legacy PartialExit interface
 */
export function eventToPartialExit(event: PositionEvent): any {
  if (event.event_type !== 'sell') return null;
  
  return {
    exit_price: event.price,
    exit_date: event.event_date,
    shares_sold: Math.abs(event.shares), // Convert negative to positive
    profit_loss: event.realized_pnl || 0,
    notes: event.notes || ''
  };
}

// =====================================================
// DASHBOARD & ANALYTICS FUNCTIONS
// =====================================================

/**
 * Calculate dashboard metrics from positions
 * Replaces: fetchDashboardData()
 */
export async function getDashboardData(): Promise<{
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
}> {
  try {
    const allPositions = await getAllPositionsForAnalytics();
    const closedPositions = allPositions.filter(p => p.status === 'closed');
    const openPositions = allPositions.filter(p => p.status === 'open');
    
    // Basic metrics
    const totalTrades = allPositions.length;
    const openTrades = openPositions.length;
    
    // Win rate calculation
    const winningTrades = closedPositions.filter(p => p.total_realized_pnl > 0);
    const winRate = closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0;
    
    // Total P&L
    const profitLoss = closedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0);
    
    // Recent trades
    const recentTrades = [...allPositions]
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
      .slice(0, 5)
      .map(position => ({
        id: position.id,
        ticker: position.ticker,
        entryDate: position.opened_at,
        status: position.status === 'open' ? 'Open' : 'Closed',
        profitLoss: position.status === 'closed' ? position.total_realized_pnl : null
      }));
    
    // Setup performance (simplified - can be enhanced later)
    const setupStats: { [key: string]: { total: number; wins: number } } = {};
    closedPositions.forEach(position => {
      const setup = position.setup_type || 'Other';
      if (!setupStats[setup]) setupStats[setup] = { total: 0, wins: 0 };
      setupStats[setup].total++;
      if (position.total_realized_pnl > 0) setupStats[setup].wins++;
    });
    
    const setupPerformance = Object.entries(setupStats)
      .map(([name, stats]) => ({
        name,
        value: Number(((stats.wins / stats.total) * 100).toFixed(1)),
        color: getColorForSetup(name)
      }))
      .slice(0, 4);
    
    // Equity curve (simplified - can be enhanced with event dates)
    const equityCurve = calculateEquityCurve(closedPositions);
    
    return {
      totalTrades,
      openTrades,
      winRate: Number(winRate.toFixed(1)),
      profitLoss: Number(profitLoss.toFixed(2)),
      equityCurve,
      setupPerformance,
      recentTrades
    };
    
  } catch (error) {
    console.error('Error calculating dashboard data:', error);
    throw error;
  }
}

// Helper functions
function getColorForSetup(setup: string): string {
  const colors: { [key: string]: string } = {
    'Breakout': '#4caf50',
    'Reversal': '#1da0f0',
    'ABCD': '#ff9800',
    'Flag': '#9c27b0',
    'Other': '#607d8b'
  };
  return colors[setup] || '#607d8b';
}

function calculateEquityCurve(closedPositions: Position[]): Array<{ date: string; equity: number }> {
  if (closedPositions.length === 0) {
    return [{ date: new Date().toISOString().split('T')[0], equity: 0 }];
  }
  
  // Sort by close date
  const sortedPositions = [...closedPositions]
    .filter(p => p.closed_at)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
  
  let cumulativeEquity = 0;
  const curve = sortedPositions.map(position => {
    cumulativeEquity += position.total_realized_pnl;
    return {
      date: position.closed_at!.split('T')[0],
      equity: Number(cumulativeEquity.toFixed(2))
    };
  });
  
  // Add current date if needed
  const today = new Date().toISOString().split('T')[0];
  if (curve.length === 0 || curve[curve.length - 1].date !== today) {
    curve.push({ date: today, equity: cumulativeEquity });
  }
  
  return curve;
}

// =====================================================
// LIFETIME TICKER ANALYTICS
// =====================================================

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

/**
 * Get comprehensive lifetime analytics for a specific ticker
 */
export async function getLifetimeTickerAnalytics(ticker: string): Promise<LifetimeTickerAnalytics> {
  try {
    
    // Get all positions for this ticker
    const allPositions = await getAllPositions({ ticker, limit: 1000 });
    
    const openPositions = allPositions.filter(p => p.status === 'open');
    const closedPositions = allPositions.filter(p => p.status === 'closed');
    
    // Basic counts
    const totalPositions = allPositions.length;
    const openPositionsCount = openPositions.length;
    const closedPositionsCount = closedPositions.length;
    
    // Win rate calculation (only for closed positions)
    const winningPositions = closedPositions.filter(p => p.total_realized_pnl > 0);
    const lifetimeWinRate = closedPositions.length > 0 ? (winningPositions.length / closedPositions.length) * 100 : 0;
    
    // Lifetime P&L (only realized from closed positions)
    const lifetimePnL = closedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0);
    
    // Average return per position (only closed positions)
    const averageReturnPerPosition = closedPositions.length > 0 
      ? closedPositions.reduce((sum, p) => sum + (p.return_percent || 0), 0) / closedPositions.length
      : 0;
    
    // Best and worst positions - sort by dollar P&L, not percentage
    let bestPosition = null;
    let worstPosition = null;
    
    if (closedPositions.length > 0) {
      // Sort by total realized P&L (dollar amount) instead of percentage
      const sortedByPnL = [...closedPositions].sort((a, b) => b.total_realized_pnl - a.total_realized_pnl);
      
      const best = sortedByPnL[0];
      if (best) {
        bestPosition = {
          id: best.id,
          returnPercent: best.return_percent || 0,
          pnl: best.total_realized_pnl,
          daysHeld: calculateDaysHeld(best)
        };
      }
      
      const worst = sortedByPnL[sortedByPnL.length - 1];
      if (worst) {
        worstPosition = {
          id: worst.id,
          returnPercent: worst.return_percent || 0,
          pnl: worst.total_realized_pnl,
          daysHeld: calculateDaysHeld(worst)
        };
      }
    }
    
    // Average days held
    const totalDaysHeld = closedPositions.reduce((sum, p) => sum + calculateDaysHeld(p), 0);
    const averageDaysHeld = closedPositions.length > 0 ? totalDaysHeld / closedPositions.length : 0;
    
    // Total volume traded (sum of all costs)
    const totalVolumeTraded = allPositions.reduce((sum, p) => sum + p.total_cost, 0);
    
    // Success by strategy
    const strategyStats: { [key: string]: { positions: Position[], wins: number, totalReturn: number } } = {};
    
    closedPositions.forEach(position => {
      const strategy = position.strategy || 'No Strategy';
      if (!strategyStats[strategy]) {
        strategyStats[strategy] = { positions: [], wins: 0, totalReturn: 0 };
      }
      strategyStats[strategy].positions.push(position);
      if (position.total_realized_pnl > 0) strategyStats[strategy].wins++;
      strategyStats[strategy].totalReturn += (position.return_percent || 0);
    });
    
    const successByStrategy = Object.entries(strategyStats).map(([strategy, stats]) => ({
      strategy,
      winRate: stats.positions.length > 0 ? (stats.wins / stats.positions.length) * 100 : 0,
      avgReturn: stats.positions.length > 0 ? stats.totalReturn / stats.positions.length : 0,
      positionsCount: stats.positions.length
    })).sort((a, b) => b.winRate - a.winRate);
    
    // Risk-adjusted return (Sharpe-like ratio)
    // Calculate standard deviation of returns
    let riskAdjustedReturn = 0;
    if (closedPositions.length > 1) {
      const returns = closedPositions.map(p => p.return_percent || 0);
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      riskAdjustedReturn = stdDev > 0 ? avgReturn / stdDev : 0;
    }
    
    const analytics: LifetimeTickerAnalytics = {
      ticker,
      totalPositions,
      lifetimeWinRate,
      lifetimePnL,
      averageReturnPerPosition,
      bestPosition,
      worstPosition,
      averageDaysHeld,
      totalVolumeTraded,
      successByStrategy,
      riskAdjustedReturn,
      openPositionsCount,
      closedPositionsCount
    };
    
    return analytics;
    
  } catch (error) {
    console.error(`Error calculating lifetime analytics for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Helper function to calculate days held for a position
 */
function calculateDaysHeld(position: Position): number {
  if (!position.opened_at) return 0;
  
  const endDate = position.closed_at ? new Date(position.closed_at) : new Date();
  const startDate = new Date(position.opened_at);
  
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
}

// =====================================================
// EVENT MANAGEMENT FUNCTIONS
// =====================================================

export interface EventUpdateData {
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string;
}

/**
 * Update an individual position event (stop loss, take profit, notes)
 */
export async function updatePositionEvent(eventId: number, eventData: EventUpdateData): Promise<PositionEvent> {
  try {
    
    const response = await api.put(`/api/v2/positions/events/${eventId}`, eventData);
    
    return response.data;
  } catch (error) {
    console.error('Error updating position event:', error);
    throw error;
  }
}

export default {
  // Main functions
  getAllPositions,
  getAllPositionsWithEvents,
  getPositionDetails,
  createPosition,
  addToPosition,
  sellFromPosition,
  updatePosition,
  deletePosition,
  
  // Convenience functions
  getOpenPositions,
  getClosedPositions,
  getAllPositionsForAnalytics,
  
  // Analytics
  getDashboardData,
  getLifetimeTickerAnalytics,
  
  // Legacy compatibility
  positionToLegacyTrade,
  eventToPartialExit,
  
  // Event management
  updatePositionEvent
};
