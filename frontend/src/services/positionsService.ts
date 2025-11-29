import api from './apiConfig';
import {
  Position,
  PositionEvent,
  PositionDetails,
  CreatePositionData,
  AddEventData,
  EventUpdateData,
  PositionUpdateData,
  PendingOrder,
  CacheEntry,
  PartialExit
} from '../types/api';

// Re-export types for backward compatibility
export type {
  Position,
  PositionEvent,
  PositionDetails,
  CreatePositionData,
  AddEventData,
  EventUpdateData,
  PositionUpdateData,
  PendingOrder
};

// =====================================================
// NEW UNIFIED POSITIONS SERVICE 
// Uses /api/v2/positions endpoints exclusively
// Replaces all tradeService.ts functionality
// =====================================================

// Simple in-memory cache for performance
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 30000; // 30 seconds cache TTL

// Helper to get current user ID from token for cache keying
function getCurrentUserId(): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  
  try {
    // Decode JWT token to get user info
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || payload.username || null;
  } catch (e) {
    console.error('Error decoding token for cache key:', e);
    return null;
  }
}

function getCacheKey(endpoint: string, params?: Record<string, unknown>): string {
  // CRITICAL FIX: Include user ID in cache key to prevent cross-user data leakage
  const userId = getCurrentUserId() || 'anonymous';
  return `${userId}_${endpoint}_${JSON.stringify(params || {})}`;
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

// Clear ALL cache (useful for logout/login)
export function clearAllCache(): void {
  cache.clear();
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
  include_events?: boolean;
}): Promise<Position[]> {
  try {
    // Check cache first for common requests
    const cacheKey = getCacheKey('positions', filters);
    const cached = getFromCache<Position[]>(cacheKey);
    if (cached) {
      console.log('Returning cached positions for key:', cacheKey);
      return cached;
    }

    const params = new URLSearchParams();
    
    if (filters?.status) params.append('status', filters.status);
    if (filters?.ticker) params.append('ticker', filters.ticker);
    if (filters?.strategy) params.append('strategy', filters.strategy);
    if (filters?.skip) params.append('skip', filters.skip.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.include_events) params.append('include_events', 'true');
    
    const url = `/api/v2/positions/${params.toString() ? `?${params.toString()}` : ''}`;
    console.log('Fetching fresh positions from:', url);
    const response = await api.get(url);
    
    // Cache the result with user-specific key
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
    clearPositionsCache();
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
    clearPositionsCache();
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
    clearPositionsCache();
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
    clearPositionsCache();
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
    clearPositionsCache();
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
    clearPositionsCache();
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
  return getAllPositions({ limit: 100000 });
}

/**
 * Get paginated positions for list views
 * Returns positions with pagination metadata
 */
export async function getPositionsPaginated(
  page: number = 1,
  limit: number = 50,
  filters?: {
    status?: 'open' | 'closed';
    search?: string;
    strategy?: string;
  }
): Promise<{
  positions: Position[];
  total: number;
  page: number;
  pages: number;
}> {
  try {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    if (filters?.status) {
      params.append('status', filters.status);
    }
    if (filters?.search) {
      params.append('search', filters.search);
    }
    if (filters?.strategy) {
      params.append('strategy', filters.strategy);
    }
    
    const response = await api.get(`/api/v2/positions/paginated?${params}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching paginated positions:', error);
    throw error;
  }
}

// =====================================================
// LEGACY INTERFACE COMPATIBILITY
// =====================================================

/**
 * Transform Position to legacy Trade interface for gradual migration
 * This allows existing components to work while we migrate them
 */
export function positionToLegacyTrade(position: Position): Record<string, unknown> {
  return {
    id: position.id,
    ticker: position.ticker,
    entryDate: position.opened_at,
    exitDate: position.closed_at,
    entryPrice: position.avg_entry_price || 0,
    exitPrice: null,
    strategy: position.strategy || 'Unknown',
    setupType: position.setup_type || 'Unknown',
    timeframe: position.timeframe || 'Daily',
    status: position.status === 'open' ? 'Open' : 'Closed',
    shares: position.current_shares,
    result: position.total_realized_pnl,
    resultAmount: position.total_realized_pnl,
    notes: position.notes || '',
  };
}

/**
 * Transform PositionEvent to legacy PartialExit interface
 */
export function eventToPartialExit(event: PositionEvent): PartialExit | null {
  if (event.event_type !== 'sell') return null;
  
  return {
    exit_price: event.price,
    exit_date: event.event_date,
    shares_sold: Math.abs(event.shares),
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
    
    const totalTrades = allPositions.length;
    const openTrades = openPositions.length;
    
    const winningTrades = closedPositions.filter(p => p.total_realized_pnl > 0);
    const winRate = closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0;
    
    const profitLoss = closedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0);
    
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

export async function getLifetimeTickerAnalytics(ticker: string): Promise<LifetimeTickerAnalytics> {
  try {
    // Include events to get return_percent calculation from backend
    const allPositions = await getAllPositions({ ticker, limit: 1000, include_events: true });
    
    const openPositions = allPositions.filter(p => p.status === 'open');
    const closedPositions = allPositions.filter(p => p.status === 'closed');
    
    const totalPositions = allPositions.length;
    const openPositionsCount = openPositions.length;
    const closedPositionsCount = closedPositions.length;
    
    const winningPositions = closedPositions.filter(p => p.total_realized_pnl > 0);
    const lifetimeWinRate = closedPositions.length > 0 ? (winningPositions.length / closedPositions.length) * 100 : 0;
    
    const lifetimePnL = closedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0);
    
    const averageReturnPerPosition = closedPositions.length > 0 
      ? closedPositions.reduce((sum, p) => sum + (p.return_percent || 0), 0) / closedPositions.length
      : 0;
    
    let bestPosition = null;
    let worstPosition = null;
    
    if (closedPositions.length > 0) {
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
    
    const totalDaysHeld = closedPositions.reduce((sum, p) => sum + calculateDaysHeld(p), 0);
    const averageDaysHeld = closedPositions.length > 0 ? totalDaysHeld / closedPositions.length : 0;
    
    const totalVolumeTraded = allPositions.reduce((sum, p) => sum + p.total_cost, 0);
    
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

function calculateDaysHeld(position: Position): number {
  if (!position.opened_at) return 0;
  
  const endDate = position.closed_at ? new Date(position.closed_at) : new Date();
  const startDate = new Date(position.opened_at);
  
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
}

export interface EventUpdateData {
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string;
}

export async function updatePositionEvent(eventId: number, eventData: EventUpdateData): Promise<PositionEvent> {
  try {
    const response = await api.put(`/api/v2/positions/events/${eventId}`, eventData);
    clearPositionsCache();
    return response.data;
  } catch (error) {
    console.error('Error updating position event:', error);
    throw error;
  }
}

// =====================================================
// CHART DATA SERVICE
// =====================================================

export interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartDataResponse {
  position_id: number;
  ticker: string;
  symbol: string;
  entry_date: string;
  exit_date: string | null;
  price_data: PriceDataPoint[];
  date_range: {
    start: string;
    end: string;
  };
}

export interface BulkChartDataResponse {
  charts: (ChartDataResponse & { error?: string })[];
}

/**
 * Get historical price chart data for a single position
 * Returns daily OHLCV data from N days before entry to N days after exit
 */
export async function getPositionChartData(
  positionId: number,
  daysBefore: number = 7,
  daysAfter: number = 7
): Promise<ChartDataResponse> {
  try {
    const response = await api.get(`/api/v2/positions/${positionId}/chart-data`, {
      params: { days_before: daysBefore, days_after: daysAfter }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching chart data for position ${positionId}:`, error);
    throw error;
  }
}

/**
 * Get chart data for multiple positions at once (bulk fetch)
 * More efficient than calling getPositionChartData multiple times
 */
export async function getBulkPositionChartData(
  positionIds: number[],
  daysBefore: number = 7,
  daysAfter: number = 7
): Promise<BulkChartDataResponse> {
  try {
    const response = await api.post('/api/v2/positions/chart-data/bulk', {
      position_ids: positionIds,
      days_before: daysBefore,
      days_after: daysAfter
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching bulk chart data:', error);
    throw error;
  }
}

export default {
  getAllPositions,
  getAllPositionsWithEvents,
  getPositionsPaginated,
  getPositionDetails,
  createPosition,
  addToPosition,
  sellFromPosition,
  updatePosition,
  deletePosition,
  getOpenPositions,
  getClosedPositions,
  getAllPositionsForAnalytics,
  getDashboardData,
  getLifetimeTickerAnalytics,
  positionToLegacyTrade,
  eventToPartialExit,
  updatePositionEvent,
  clearAllCache,
  getPositionChartData,
  getBulkPositionChartData,
};