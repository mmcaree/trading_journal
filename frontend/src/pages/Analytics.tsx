import React, { useState, useEffect, useMemo } from 'react';
import { calculateWinRate } from '../utils/calculations';
import { EquityCurveChart } from '../components/EquityCurveChart';
import { PnLCalendar } from '../components/PnLCalendar';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  ButtonGroup,
  Tooltip
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend
} from 'recharts';
import {
  Analytics as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { getAllPositions, getAllPositionsWithEvents, PositionEvent } from '../services/positionsService';
import { accountService } from '../services/accountService';
import { useCurrency } from '../context/CurrencyContext';
import { Position } from '../services/positionsService';
import { 
  calculateAllMetrics, 
  RiskMetrics, 
  TimeBasedMetrics, 
  PortfolioMetrics, 
  EntryExitMetrics 
} from '../utils/analyticsUtils';
import { getTickerSector } from '../utils/tickerSectorMapping';
import { CHART_COLORS, PIE_CHART_COLORS, currencyTickFormatter, CustomTooltip } from '../components/CustomChartComponents';
import api from '../services/apiConfig';

interface AnalyticsMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  totalRealized: number;
  totalUnrealized: number;
  totalVolume: number;
  avgDaysHeld: number;
}

interface MonthlyData {
  month: string;
  pnl: number;
  trades: number;
}

interface StrategyData {
  strategy: string;
  trades: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
}

export type TimeScale = '1M' | '3M' | '6M' | 'YTD' | '1YR' | 'ALL';

const Analytics: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<(Position & { events?: PositionEvent[] })[]>([]);
  const [accountBalance, setAccountBalance] = useState(0);
  const [selectedTimeScale, setSelectedTimeScale] = useState<TimeScale>('ALL');
  const [growthMetrics, setGrowthMetrics] = useState<any>(null);

  const { formatCurrency } = useCurrency();
  
  const [advancedData, setAdvancedData] = useState<any>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []);


  useEffect(() => {
    loadGrowthMetrics();
  }, [selectedTimeScale]); // Reload when time scale changes

  const loadGrowthMetrics = async () => {
    try {
      const params = selectedTimeScale !== 'ALL' ? {
        start_date: getTimeScaleDate(selectedTimeScale).toISOString()
      } : {};
      
      const response = await api.get('/api/analytics/account-growth-metrics', { params });
      setGrowthMetrics(response.data);
    } catch (error) {
      console.error('Failed to load growth metrics:', error);
    }
  };

  const loadAnalyticsData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get positions and account value from API
      const positionsData = await getAllPositionsWithEvents({ limit: 100000 });
      setPositions(positionsData || []);
      
      // Get account value from API instead of localStorage
      try {
        const accountValueResponse = await api.get('/api/users/me/account-value');
        setAccountBalance(accountValueResponse.data.account_value);
      } catch (error) {
        console.error('Failed to fetch account value, using fallback:', error);
        setAccountBalance(accountService.getCurrentBalance());
      }
    } catch (err) {
      console.error('Error loading analytics data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  // Filter positions based on selected time scale
  const getTimeScaleDate = (timeScale: TimeScale): Date => {
    const now = new Date();
    switch (timeScale) {
      case '1M':
        return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case '3M':
        return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      case '6M':  
        return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      case 'YTD':
        return new Date(now.getFullYear(), 0, 1);
      case '1YR':
        return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      case 'ALL':
      default:
        return new Date(0);
    }
  };

  const filteredPositions = useMemo(() => {
    if (selectedTimeScale === 'ALL') return positions;
    
    const cutoffDate = getTimeScaleDate(selectedTimeScale);
    return positions.filter(position => {
      // For closed positions, filter by close date for P&L calculations
      // For open positions, filter by open date for analysis
      if (position.status === 'closed' && position.closed_at) {
        const closeDate = new Date(position.closed_at);
        return closeDate >= cutoffDate;
      } else {
        const openDate = new Date(position.opened_at);
        return openDate >= cutoffDate;
      }
    });
  }, [positions, selectedTimeScale]);

  // Helper function to get realized P&L from backend (FIFO-based calculation)
  const getTotalRealizedPnL = useMemo(() => {
    // Use backend calculation if available (more accurate - uses FIFO)
    if (growthMetrics?.realized_pnl !== undefined) {
      return growthMetrics.realized_pnl;
    }
    // Fallback to summing position total_realized_pnl (also FIFO-based)
    return filteredPositions
      .filter(position => position.status === 'closed')
      .reduce((total, position) => total + (position.total_realized_pnl || 0), 0);
  }, [filteredPositions, growthMetrics]);

  // Time Analysis calculations
  const timeAnalysisData = useMemo(() => {
    // Get all sell events from all positions (not just closed ones)
    const allSellEvents = filteredPositions
      .flatMap(position => {
        // Only include positions that have events data
        if (!position.events || position.events.length === 0) return [];
        
        return position.events
          .filter(event => event.event_type === 'sell' && event.realized_pnl != null)
          .map(event => ({
            event_date: event.event_date,
            realized_pnl: event.realized_pnl || 0,
            ticker: position.ticker,
            event_id: event.id
          }));
      })
      .filter(event => event.realized_pnl !== 0); // Filter out zero P&L events
    
    // Sort sell events by date for accurate time-based analysis
    const sortedSellEvents = allSellEvents.sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
    
    // Cumulative Returns Data - built from individual sell events
    const cumulativeReturns = sortedSellEvents.reduce((acc, event, index) => {
      const runningTotal = index === 0 ? event.realized_pnl : 
        acc[index - 1].cumulative + event.realized_pnl;
      
      acc.push({
        date: new Date(event.event_date).toLocaleDateString(),
        pnl: event.realized_pnl,
        cumulative: runningTotal,
        tradeNumber: index + 1,
        ticker: event.ticker
      });
      return acc;
    }, [] as Array<{date: string, pnl: number, cumulative: number, tradeNumber: number, ticker: string}>);

    // For other analyses, keep using closed positions for compatibility
    const closedPositions = filteredPositions.filter(p => p.status === 'closed' && p.closed_at);

    // Holding Period Analysis
    const holdingPeriodData = closedPositions.map(position => {
      if (position.opened_at && position.closed_at) {
        const days = Math.round((new Date(position.closed_at).getTime() - new Date(position.opened_at).getTime()) / (1000 * 60 * 60 * 24));
        return {
          days: Math.max(1, days),
          pnl: position.total_realized_pnl || 0,
          ticker: position.ticker
        };
      }
      return null;
    }).filter(Boolean) as Array<{days: number, pnl: number, ticker: string}>;

    // Group by holding period ranges
    const holdingPeriodRanges = holdingPeriodData.reduce((acc, trade) => {
      let range = '';
      if (trade.days <= 1) range = '=1 day';
      else if (trade.days <= 7) range = '2-7 days';
      else if (trade.days <= 30) range = '1-4 weeks';
      else if (trade.days <= 90) range = '1-3 months';
      else range = '>3 months';

      if (!acc[range]) acc[range] = { count: 0, totalPnl: 0, avgPnl: 0 };
      acc[range].count++;
      acc[range].totalPnl += trade.pnl;
      acc[range].avgPnl = acc[range].totalPnl / acc[range].count;
      
      return acc;
    }, {} as Record<string, {count: number, totalPnl: number, avgPnl: number}>);

    const holdingPeriodChart = Object.entries(holdingPeriodRanges).map(([range, data]) => ({
      range,
      count: data.count,
      avgReturn: data.avgPnl,
      totalReturn: data.totalPnl
    }));

    // P&L Distribution
    const pnlDistribution = closedPositions.reduce((acc, position) => {
      const pnl = position.total_realized_pnl || 0;
      let bucket = '';
      
      if (pnl < -1000) bucket = '<-$1000';
      else if (pnl < -500) bucket = '-$1000 to -$500';
      else if (pnl < -100) bucket = '-$500 to -$100';
      else if (pnl < 0) bucket = '-$100 to $0';
      else if (pnl < 100) bucket = '$0 to $100';
      else if (pnl < 500) bucket = '$100 to $500';
      else if (pnl < 1000) bucket = '$500 to $1000';
      else bucket = '>$1000';

      if (!acc[bucket]) acc[bucket] = 0;
      acc[bucket]++;
      return acc;
    }, {} as Record<string, number>);

    const pnlDistributionChart = Object.entries(pnlDistribution).map(([range, count]) => ({
      range,
      count
    }));

    return {
      cumulativeReturns,
      holdingPeriodChart,
      pnlDistributionChart,
      totalTrades: closedPositions.length, // Still count closed positions for this metric
      totalSellEvents: sortedSellEvents.length, // New metric for actual sell events
      avgHoldingDays: holdingPeriodData.length > 0 ? 
        holdingPeriodData.reduce((sum, trade) => sum + trade.days, 0) / holdingPeriodData.length : 0
    };
  }, [filteredPositions]);

  // Portfolio Analysis calculations
  const portfolioAnalysisData = useMemo(() => {
    // IMPORTANT: Portfolio analysis should focus on OPEN positions only
    // We want to see the current state of the portfolio, not historical closed positions
    const openPositions = filteredPositions.filter(p => p.status === 'open');
    
    // Calculate current market value for each open position
    const positionSizes = openPositions
      .map(position => {
        // For open positions, use current_shares * avg_entry_price to get current market value
        // Note: In a real app, you'd multiply by current market price, but we use entry price as proxy
        const currentValue = (position.current_shares || 0) * (position.avg_entry_price || 0);
        
        return {
          ticker: position.ticker,
          value: currentValue,
          shares: position.current_shares,
          avgPrice: position.avg_entry_price || 0,
          sector: getTickerSector(position.ticker),
          pnl: position.total_realized_pnl || 0, // Realized P&L so far
          unrealizedPnl: 0, // Could calculate if we had current market prices
          status: position.status
        };
      })
      .filter(p => p.value > 0) // Only include positions with value
      .sort((a, b) => b.value - a.value);

    // Sector allocation - group by sector and collect ticker names
    const sectorAllocation = positionSizes.reduce((acc, position) => {
      const sector = position.sector;
      
      if (!acc[sector]) acc[sector] = { value: 0, count: 0, tickers: [] };
      acc[sector].value += position.value;
      acc[sector].count += 1;
      acc[sector].tickers.push(position.ticker);
      
      return acc;
    }, {} as Record<string, {value: number, count: number, tickers: string[]}>);

    const sectorChart = Object.entries(sectorAllocation).map(([sector, data]) => ({
      name: sector,
      value: data.value,
      count: data.count,
      tickers: data.tickers.join(', ') // Include ticker names for tooltip
    }));

    // Position size distribution - categorize by current market value
    const positionSizeDistribution = positionSizes.reduce((acc, position) => {
      let bucket = '';
      const value = position.value;
      
      if (value < 500) bucket = '<$500';
      else if (value < 1000) bucket = '$500-$1K';
      else if (value < 2500) bucket = '$1K-$2.5K';
      else if (value < 5000) bucket = '$2.5K-$5K';
      else if (value < 10000) bucket = '$5K-$10K';
      else bucket = '>$10K';

      if (!acc[bucket]) acc[bucket] = 0;
      acc[bucket]++;
      return acc;
    }, {} as Record<string, number>);

    const positionSizeChart = Object.entries(positionSizeDistribution).map(([range, count]) => ({
      range,
      count
    }));

    // Top positions by current market value
    const topPositions = positionSizes.slice(0, 10);

    // Performance by position size - analyze CLOSED positions to see win/loss patterns
    const closedPositions = filteredPositions
      .filter(p => p.status === 'closed')
      .map(position => {
        // For closed positions, use the total_cost as the position size
        const positionSize = Math.abs(position.total_cost || 0);
        return {
          size: positionSize,
          pnl: position.total_realized_pnl || 0
        };
      });

    const sizePerformance = closedPositions.reduce((acc, position) => {
      let sizeCategory = '';
      if (position.size < 1000) sizeCategory = 'Small (<$1K)';
      else if (position.size < 5000) sizeCategory = 'Medium ($1K-$5K)';
      else sizeCategory = 'Large (>$5K)';

      if (!acc[sizeCategory]) acc[sizeCategory] = { wins: 0, losses: 0, totalPnl: 0 };
      
      if (position.pnl > 0) acc[sizeCategory].wins++;
      else if (position.pnl < 0) acc[sizeCategory].losses++;
      
      acc[sizeCategory].totalPnl += position.pnl;
      
      return acc;
    }, {} as Record<string, {wins: number, losses: number, totalPnl: number}>);

    const performanceBySize = Object.entries(sizePerformance).map(([category, data]) => ({
      category,
      wins: data.wins,
      losses: data.losses,
      winRate: calculateWinRate(data.wins, data.wins + data.losses),
      totalPnl: data.totalPnl,
      avgPnl: data.wins + data.losses > 0 ? data.totalPnl / (data.wins + data.losses) : 0
    }));

    // Total portfolio value - sum of all open position current values
    const totalPortfolioValue = positionSizes.reduce((sum, pos) => sum + pos.value, 0);
    
    // Concentration risk - top 5 open positions as % of TOTAL ACCOUNT VALUE (not just position sum)
    // This shows what % of your total trading capital is in your top 5 positions
    const top5Value = positionSizes.slice(0, 5).reduce((sum, pos) => sum + pos.value, 0);
    const concentrationRisk = accountBalance > 0 ? (top5Value / accountBalance) * 100 : 0;

    return {
      sectorChart,
      positionSizeChart,
      topPositions,
      performanceBySize,
      concentrationRisk,
      totalPositions: filteredPositions.length,
      activePositions: openPositions.length,
      totalPortfolioValue
    };
  }, [filteredPositions, accountBalance]);

  // Entry/Exit Analysis calculations
  const entryExitAnalysisData = useMemo(() => {
    const closedPositions = filteredPositions.filter(p => p.status === 'closed' && p.closed_at);
    
    // Entry timing analysis
    const entryTimingData = closedPositions.map(position => {
      const entryDate = new Date(position.opened_at);
      const dayOfWeek = entryDate.toLocaleDateString('en-US', { weekday: 'long' });
      const hourOfDay = entryDate.getHours();
      return {
        dayOfWeek,
        hourOfDay,
        pnl: position.total_realized_pnl || 0,
        ticker: position.ticker
      };
    });

    // Best entry days
    const entryDayPerformance = entryTimingData.reduce((acc, trade) => {
      if (!acc[trade.dayOfWeek]) acc[trade.dayOfWeek] = { count: 0, totalPnl: 0, avgPnl: 0 };
      acc[trade.dayOfWeek].count++;
      acc[trade.dayOfWeek].totalPnl += trade.pnl;
      acc[trade.dayOfWeek].avgPnl = acc[trade.dayOfWeek].totalPnl / acc[trade.dayOfWeek].count;
      return acc;
    }, {} as Record<string, {count: number, totalPnl: number, avgPnl: number}>);

    // Sort days in proper weekday order (Monday to Sunday)
    const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const entryDayChart = weekdayOrder
      .filter(day => entryDayPerformance[day]) // Only include days that have data
      .map(day => ({
        day,
        count: entryDayPerformance[day].count,
        avgPnl: entryDayPerformance[day].avgPnl,
        totalPnl: entryDayPerformance[day].totalPnl
      }));

    // Entry hour analysis
    const entryHourPerformance = entryTimingData.reduce((acc, trade) => {
      const hourRange = `${Math.floor(trade.hourOfDay / 2) * 2}-${Math.floor(trade.hourOfDay / 2) * 2 + 2}h`;
      if (!acc[hourRange]) acc[hourRange] = { count: 0, totalPnl: 0, avgPnl: 0 };
      acc[hourRange].count++;
      acc[hourRange].totalPnl += trade.pnl;
      acc[hourRange].avgPnl = acc[hourRange].totalPnl / acc[hourRange].count;
      return acc;
    }, {} as Record<string, {count: number, totalPnl: number, avgPnl: number}>);

    const entryHourChart = Object.entries(entryHourPerformance).map(([hour, data]) => ({
      hour,
      count: data.count,
      avgPnl: data.avgPnl
    }));

    // Exit efficiency - positions with take profit vs stop loss
    const exitAnalysis = closedPositions.reduce((acc, position) => {
      const pnl = position.total_realized_pnl || 0;
      if (pnl > 0) {
        acc.profits.count++;
        acc.profits.totalPnl += pnl;
      } else if (pnl < 0) {
        acc.losses.count++;
        acc.losses.totalPnl += Math.abs(pnl);
      }
      return acc;
    }, { profits: { count: 0, totalPnl: 0 }, losses: { count: 0, totalPnl: 0 } });

    const avgWin = exitAnalysis.profits.count > 0 ? exitAnalysis.profits.totalPnl / exitAnalysis.profits.count : 0;
    const avgLoss = exitAnalysis.losses.count > 0 ? exitAnalysis.losses.totalPnl / exitAnalysis.losses.count : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    return {
      entryDayChart,
      entryHourChart,
      avgWin,
      avgLoss,
      winLossRatio,
      totalExits: closedPositions.length,
      profitableExits: exitAnalysis.profits.count,
      unprofitableExits: exitAnalysis.losses.count
    };
  }, [filteredPositions]);

  // Trading Psychology calculations
  const psychologyData = useMemo(() => {
    const closedPositions = filteredPositions.filter(p => p.status === 'closed');
    
    // Streak analysis
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let winStreaks: number[] = [];
    let lossStreaks: number[] = [];

    closedPositions
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())
      .forEach((position, index) => {
        const pnl = position.total_realized_pnl || 0;
        const isWin = pnl > 0;
        
        if (index === 0) {
          currentStreak = isWin ? 1 : -1;
        } else {
          const prevPnl = closedPositions[index - 1].total_realized_pnl || 0;
          const prevIsWin = prevPnl > 0;
          
          if (isWin === prevIsWin) {
            currentStreak = isWin ? Math.abs(currentStreak) + 1 : -(Math.abs(currentStreak) + 1);
          } else {
            if (currentStreak > 0) winStreaks.push(currentStreak);
            else if (currentStreak < 0) lossStreaks.push(Math.abs(currentStreak));
            currentStreak = isWin ? 1 : -1;
          }
          
          if (isWin) maxWinStreak = Math.max(maxWinStreak, Math.abs(currentStreak));
          else maxLossStreak = Math.max(maxLossStreak, Math.abs(currentStreak));
        }
      });

    // Emotional impact analysis
    const emotionalImpact = closedPositions.map(position => {
      const pnl = position.total_realized_pnl || 0;
      const impact = Math.abs(pnl);
      let category = '';
      
      if (impact < 1000) category = 'Low Impact';
      else if (impact < 5000) category = 'Medium Impact';
      else category = 'High Impact';
      
      return {
        category,
        pnl,
        isWin: pnl > 0,
        ticker: position.ticker
      };
    });

    const impactAnalysis = emotionalImpact.reduce((acc, trade) => {
      if (!acc[trade.category]) acc[trade.category] = { wins: 0, losses: 0, totalPnl: 0 };
      if (trade.isWin) acc[trade.category].wins++;
      else acc[trade.category].losses++;
      acc[trade.category].totalPnl += trade.pnl;
      return acc;
    }, {} as Record<string, {wins: number, losses: number, totalPnl: number}>);

    const impactChart = Object.entries(impactAnalysis).map(([category, data]) => ({
      category,
      wins: data.wins,
      losses: data.losses,
      winRate: calculateWinRate(data.wins, data.wins + data.losses),
      totalPnl: data.totalPnl
    }));

    return {
      maxWinStreak,
      maxLossStreak,
      avgWinStreak: winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0,
      avgLossStreak: lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0,
      impactChart,
      totalTrades: closedPositions.length
    };
  }, [filteredPositions]);

  // Top Performers calculations
  const topPerformersData = useMemo(() => {
    const closedPositions = filteredPositions.filter(p => p.status === 'closed' && p.total_realized_pnl);
    
    // Best and worst trades
    const bestTrades = closedPositions
      .filter(p => (p.total_realized_pnl || 0) > 0)
      .sort((a, b) => (b.total_realized_pnl || 0) - (a.total_realized_pnl || 0))
      .slice(0, 10);

    const worstTrades = closedPositions
      .filter(p => (p.total_realized_pnl || 0) < 0)
      .sort((a, b) => (a.total_realized_pnl || 0) - (b.total_realized_pnl || 0))
      .slice(0, 10);

    // Best performing tickers
    const tickerPerformance = closedPositions.reduce((acc, position) => {
      const ticker = position.ticker;
      const pnl = position.total_realized_pnl || 0;
      
      if (!acc[ticker]) acc[ticker] = { trades: 0, totalPnl: 0, wins: 0, losses: 0 };
      acc[ticker].trades++;
      acc[ticker].totalPnl += pnl;
      if (pnl > 0) acc[ticker].wins++;
      else if (pnl < 0) acc[ticker].losses++;
      
      return acc;
    }, {} as Record<string, {trades: number, totalPnl: number, wins: number, losses: number}>);

    const topTickers = Object.entries(tickerPerformance)
      .map(([ticker, data]) => ({
        ticker,
        trades: data.trades,
        totalPnl: data.totalPnl,
        avgPnl: data.totalPnl / data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        wins: data.wins,
        losses: data.losses
      }))
      .filter(item => item.trades >= 2) // Only show tickers with multiple trades
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .slice(0, 10);

    // Strategy performance (if available)
    const strategyPerformance = closedPositions.reduce((acc, position) => {
      const strategy = position.strategy || 'No Strategy';
      const pnl = position.total_realized_pnl || 0;
      
      if (!acc[strategy]) acc[strategy] = { trades: 0, totalPnl: 0, wins: 0, losses: 0 };
      acc[strategy].trades++;
      acc[strategy].totalPnl += pnl;
      if (pnl > 0) acc[strategy].wins++;
      else if (pnl < 0) acc[strategy].losses++;
      
      return acc;
    }, {} as Record<string, {trades: number, totalPnl: number, wins: number, losses: number}>);

    const topStrategies = Object.entries(strategyPerformance)
      .map(([strategy, data]) => ({
        strategy,
        trades: data.trades,
        totalPnl: data.totalPnl,
        avgPnl: data.totalPnl / data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        wins: data.wins,
        losses: data.losses
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return {
      bestTrades,
      worstTrades,
      topTickers,
      topStrategies
    };
  }, [filteredPositions]);

  useEffect(() => {
    const loadAdvanced = async () => {
      try {
        const res = await api.get('/api/analytics/advanced', {
          params: selectedTimeScale !== 'ALL' ? {
            start_date: getTimeScaleDate(selectedTimeScale).toISOString(),
          } : {}
        });
        setAdvancedData(res.data);
      } catch (err) {
        console.error("Failed to load advanced analytics", err);
        setAdvancedData(null);
      }
    };
    loadAdvanced();
  }, [selectedTimeScale]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AnalyticsIcon />
          Trading Analytics
        </Typography>
        
        {/* Time Scale Selector */}
        <Paper sx={{ p: 1 }}>
          <ButtonGroup variant="outlined" size="small">
            {(['1M', '3M', '6M', 'YTD', '1YR', 'ALL'] as TimeScale[]).map((scale) => (
              <Button
                key={scale}
                variant={selectedTimeScale === scale ? 'contained' : 'outlined'}
                onClick={() => setSelectedTimeScale(scale)}
                sx={{ minWidth: '50px' }}
              >
                {scale}
              </Button>
            ))}
          </ButtonGroup>
          <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
            {selectedTimeScale === 'ALL' 
              ? 'Showing all positions and trades' 
              : `Showing positions closed in ${selectedTimeScale} period`}
          </Typography>
        </Paper>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(e, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="📊 Overview" />
          <Tab label="⚠️ Risk Management" />
          <Tab label="⏰ Time Analysis" />
          <Tab label="💼 Portfolio" />
          <Tab label="🎯 Entry/Exit" />
          <Tab label="🧠 Psychology" />
          <Tab label="📈 Strategies" />
          <Tab label="🏆 Top Performers" />
          <Tab label="📅 Calendar" />
        </Tabs>
      </Paper>

      {/* Overview Tab */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {/* Key Performance Metrics */}
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              📊 Trading Performance Overview
            </Typography>
          </Grid>

          {/* Top Level KPIs */}
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Total Positions</Typography>
                <Typography variant="h4">{filteredPositions.length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {filteredPositions.filter(p => p.status === 'open').length} active
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  {selectedTimeScale === 'ALL' ? 'Total P&L' : `P&L (${selectedTimeScale})`}
                </Typography>
                <Typography 
                  variant="h4" 
                  color={getTotalRealizedPnL >= 0 ? 'success.main' : 'error.main'}
                >
                  ${getTotalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedTimeScale === 'ALL' ? 'FIFO cost basis (closed positions)' : `From closed positions in ${selectedTimeScale} period`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Percentage of trades that are profitable. Formula: (Winning Trades / Total Trades) × 100. Different from Win/Loss Ratio (which compares average $ amounts). Shows how often you win.">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Win Rate ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h4" 
                  color={advancedData && advancedData?.win_rate >= 50 ? 'success.main' : 'error.main'}
                >
                  {advancedData ? `${advancedData.win_rate.toFixed(1)}%` : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Closed positions
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Measures risk-adjusted returns. Values > 1 are good, > 2 are excellent. Formula: (Return - Risk-free rate) / Standard deviation">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Sharpe Ratio ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h4" 
                  color={advancedData && advancedData?.sharpe_ratio > 1 ? 'success.main' : 
                    advancedData && advancedData?.sharpe_ratio > 0 ? 'warning.main' : 'error.main'}
                >
                  {advancedData ? advancedData.sharpe_ratio.toFixed(2) : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Risk-adjusted return
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: 'background.default' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                💰 Account Growth Analysis
              </Typography>
              {growthMetrics ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary" gutterBottom>
                          Current Account Value
                        </Typography>
                        <Typography variant="h4">
                          {formatCurrency(growthMetrics.current_value || 0)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          As of {new Date().toLocaleDateString()}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Card sx={{ bgcolor: 'success.light' }}>
                      <CardContent>
                        <Typography color="success.contrastText" gutterBottom>
                          Trading Growth
                        </Typography>
                        <Typography 
                          variant="h4" 
                          color="success.contrastText"
                        >
                          {(growthMetrics.trading_growth_percent || 0).toFixed(2)}%
                        </Typography>
                        <Typography variant="body2" color="success.contrastText">
                          {formatCurrency(growthMetrics.realized_pnl || 0)} P&L
                        </Typography>
                        <Typography variant="caption" color="success.contrastText" sx={{ mt: 1, display: 'block' }}>
                          Excludes deposits/withdrawals
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary" gutterBottom>
                          Total Growth
                        </Typography>
                        <Typography 
                          variant="h4"
                          color={(growthMetrics.total_growth_percent || 0) >= 0 ? 'success.main' : 'error.main'}
                        >
                          {(growthMetrics.total_growth_percent || 0).toFixed(2)}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatCurrency((growthMetrics.current_value || 0) - (growthMetrics.starting_balance || 0))}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Includes deposits/withdrawals
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="text.secondary" gutterBottom>
                          Net Cash Flow
                        </Typography>
                        <Typography 
                          variant="h4"
                          color={(growthMetrics.net_deposits || 0) >= 0 ? 'success.main' : 'error.main'}
                        >
                          {(growthMetrics.net_deposits || 0) >= 0 ? '+' : ''}
                          {formatCurrency(growthMetrics.net_deposits || 0)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Deposits - Withdrawals
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  {/* Detailed Breakdown */}
                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        <strong>Trading Growth ({(growthMetrics.trading_growth_percent || 0).toFixed(2)}%)</strong> shows your actual trading performance, 
                        excluding deposits and withdrawals. This is how professional traders and brokers calculate returns 
                        and is the true measure of your trading skill.
                      </Typography>
                    </Alert>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        Current Account Value will inevitablely differ from your broker's statement due to timing of deposits/withdrawals, 
                        unrealized P&L on open positions, and fees. We aim to be within a couple percent of what your broker reports.
                        Always refer to your broker for official balances.
                      </Typography>
                    </Alert>
                  </Grid>
                </Grid>
              ) : (
                <Box display="flex" justifyContent="center" p={3}>
                  <CircularProgress />
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <EquityCurveChart height={400} />
          </Grid>

          {/* Quick Charts Row */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Recent Performance Trend</Typography>
              <Box sx={{ width: '100%', height: 250 }}>
                {timeAnalysisData.cumulativeReturns.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeAnalysisData.cumulativeReturns} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        tickFormatter={currencyTickFormatter}
                        tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                        width={80}
                      />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                      <Line 
                        type="monotone" 
                        dataKey="cumulative" 
                        stroke={CHART_COLORS.primary}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLORS.primary, r: 1 }}
                        activeDot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No closed trades to display</Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
              <Box sx={{ width: '100%', height: 250 }}>
                {portfolioAnalysisData.sectorChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={portfolioAnalysisData.sectorChart.slice(0, 6)}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                      >
                        {portfolioAnalysisData.sectorChart.slice(0, 6).map((entry, index) => (
                          <Cell 
                            key={`sector-${index}`} 
                            fill={[
                              '#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', 
                              '#d32f2f', '#0288d1'
                            ][index % 6]} 
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No position data to display</Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* Monthly Performance Chart */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Monthly Performance
              </Typography>
              {advancedData?.monthly_returns && advancedData.monthly_returns.length > 0 ? (
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={advancedData.monthly_returns}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="monthName" 
                        angle={-45} 
                        textAnchor="end" 
                        height={80}
                      />
                      <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <RechartsTooltip 
                        formatter={(value: number) => `$${value.toLocaleString()}`}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Bar dataKey="pnl" name="P&L">
                        {advancedData.monthly_returns.map((entry: any, i: number) => (
                          <Cell key={`cell-${i}`} fill={entry.pnl >= 0 ? '#2e7d32' : '#d32f2f'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">No monthly data yet</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Risk Metrics Summary */}
          {advancedData && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Risk Summary</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h6" color={advancedData?.max_drawdown_percent > -20 ? 'success.main' : 'error.main'}>
                        -{advancedData?.max_drawdown_percent.toFixed(1)}%
                      </Typography>
                      <Tooltip title="Maximum decline in portfolio value from peak to trough. Calculated using event-based portfolio timeline including all realized P&L from sell events.">
                        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                          Max Drawdown ℹ️
                        </Typography>
                      </Tooltip>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h6" color={advancedData?.kelly_percentage > 0 ? 'success.main' : 'error.main'}>
                        {advancedData?.kelly_percentage.toFixed(1)}%
                      </Typography>
                      <Tooltip title="Optimal position size for maximizing long-term growth. Formula: (Win% × Avg Win - Loss% × Avg Loss) / Avg Win. Values > 2% suggest good edge">
                        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                          Kelly % ℹ️
                        </Typography>
                      </Tooltip>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h6">
                        {psychologyData.maxWinStreak}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">Max Win Streak</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box textAlign="center">
                      <Typography variant="h6" color={entryExitAnalysisData.winLossRatio > 1 ? 'success.main' : 'error.main'}>
                        {entryExitAnalysisData.winLossRatio.toFixed(2)}
                      </Typography>
                      <Tooltip title="Average size of wins vs losses. Formula: Average Win $ / Average Loss $. Different from Win Rate (which is % of trades that win). Values > 1 mean you make more on wins than you lose on losses.">
                        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                          Win/Loss Ratio ℹ️
                        </Typography>
                      </Tooltip>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Top Performers Summary */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>🏆 Best Recent Trades</Typography>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">P&L</TableCell>
                      <TableCell align="right">Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.bestTrades.length > 0 ? (
                      topPerformersData.bestTrades.slice(0, 5).map((trade, index) => (
                        <TableRow key={`overview-best-${index}`}>
                          <TableCell>{trade.ticker}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>
                            ${(trade.total_realized_pnl || 0).toLocaleString()}
                          </TableCell>
                          <TableCell align="right">
                            {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          <Typography color="text.secondary">No profitable trades yet</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>🏆 Top Performing Stocks</Typography>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">Trades</TableCell>
                      <TableCell align="right">Win Rate</TableCell>
                      <TableCell align="right">Total P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.topTickers.length > 0 ? (
                      topPerformersData.topTickers.slice(0, 5).map((ticker, index) => (
                        <TableRow key={`overview-ticker-${index}`}>
                          <TableCell>{ticker.ticker}</TableCell>
                          <TableCell align="right">{ticker.trades}</TableCell>
                          <TableCell 
                            align="right" 
                            sx={{ color: ticker.winRate >= 50 ? 'success.main' : 'error.main' }}
                          >
                            {ticker.winRate.toFixed(0)}%
                          </TableCell>
                          <TableCell 
                            align="right" 
                            sx={{ color: ticker.totalPnl >= 0 ? 'success.main' : 'error.main' }}
                          >
                            ${ticker.totalPnl.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography color="text.secondary">No trading data available</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Quick Insights */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: 'background.default' }}>
              <Typography variant="h6" gutterBottom> 📊 Key Insights</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Alert severity={portfolioAnalysisData.concentrationRisk > 50 ? 'error' : portfolioAnalysisData.concentrationRisk > 30 ? 'warning' : 'success'}>
                    <Typography variant="subtitle2">Portfolio Concentration</Typography>
                    <Typography variant="body2">
                      Top 5 positions represent {portfolioAnalysisData.concentrationRisk.toFixed(1)}% of portfolio
                      {portfolioAnalysisData.concentrationRisk > 50 ? ' - High risk!' : 
                       portfolioAnalysisData.concentrationRisk > 30 ? ' - Moderate risk' : ' - Well diversified'}
                    </Typography>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert severity={advancedData && advancedData?.win_rate >= 60 ? 'success' : 
                    advancedData && advancedData?.win_rate >= 40 ? 'warning' : 'error'}>
                    <Typography variant="subtitle2">Trading Performance</Typography>
                    <Typography variant="body2">
                      {advancedData ? `${advancedData?.win_rate.toFixed(1)}% win rate` : 'N/A'} 
                      {advancedData && advancedData?.win_rate >= 40 ? ' - Excellent!' : 
                       advancedData && advancedData?.win_rate >= 30 ? ' - Good' : ' - Needs improvement'}
                    </Typography>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert severity={psychologyData.maxLossStreak <= 3 ? 'success' : 
                    psychologyData.maxLossStreak <= 5 ? 'warning' : 'error'}>
                    <Typography variant="subtitle2">Risk Control</Typography>
                    <Typography variant="body2">
                      Max loss streak: {psychologyData.maxLossStreak} trades
                      {psychologyData.maxLossStreak <= 3 ? ' - Great discipline!' : 
                       psychologyData.maxLossStreak <= 5 ? ' - Good control' : ' - Review risk management'}
                    </Typography>
                  </Alert>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Risk Management Tab */}
      {tabValue === 1 && advancedData && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              ⚠️ Risk Management Dashboard
            </Typography>
          </Grid>

          {/* Key Risk Metrics Cards */}
          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Maximum decline in portfolio value from peak to trough. Calculated using event-based portfolio timeline that includes all realized P&L from individual sell events. This provides a more accurate measure of maximum portfolio decline than traditional methods. Values above -20% indicate high risk.">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Max Drawdown ℹ️
                  </Typography>
                </Tooltip>
                <Typography variant="h5" color="error.main">
                  {formatCurrency(advancedData?.max_drawdown)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {advancedData?.max_drawdown_percent.toFixed(1)}% of peak
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Measures risk-adjusted returns. Values > 1 are good, > 2 are excellent. Formula: (Return - Risk-free rate) / Standard deviation">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Sharpe Ratio ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h5" 
                  color={advancedData?.sharpe_ratio > 1 ? 'success.main' : advancedData?.sharpe_ratio > 0 ? 'warning.main' : 'error.main'}
                >
                  {advancedData?.sharpe_ratio.toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Risk-adjusted return
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Measures how much profit you made relative to maximum drawdown. Higher values indicate better recovery ability. Formula: Net Profit / Maximum Drawdown">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Recovery Factor ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h5" 
                  color={advancedData?.recovery_factor && advancedData.recovery_factor > 3 ? 'success.main' : 'warning.main'}
                >
                  {advancedData?.recovery_factor === null ? '∞' : advancedData?.recovery_factor?.toFixed(1) || 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Net profit / Max DD
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Optimal position size for maximizing long-term growth. Formula: (Win% × Avg Win - Loss% × Avg Loss) / Avg Win. Values > 2% suggest good edge">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Kelly % ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h5" 
                  color={advancedData?.kelly_percentage > 0 ? 'success.main' : 'error.main'}
                >
                  {advancedData?.kelly_percentage.toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Optimal position size
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Tooltip title="Average % of account risked when you opened each position. Calculated using original_risk_percent. Lower = better discipline. This is the #1 metric professional traders track.">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Avg Original Risk per Position
                  </Typography>
                </Tooltip>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 'bold',
                    color: advancedData?.avg_original_risk && advancedData.avg_original_risk <= 3
                      ? 'success.main'
                      : advancedData?.avg_original_risk && advancedData.avg_original_risk <= 5
                      ? 'warning.main'
                      : 'error.main'
                  }}
                >
                  {advancedData?.avg_original_risk != null
                    ? `${advancedData.avg_original_risk.toFixed(2)}%`
                    : '—'
                  }
                </Typography>
                {advancedData?.avg_original_risk_change != null && (
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 1,
                      color: advancedData.avg_original_risk_change < 0 ? 'success.main' : 'error.main',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5
                    }}
                  >
                    {advancedData.avg_original_risk_change < 0 ? 'Down' : 'Up'} {Math.abs(advancedData.avg_original_risk_change).toFixed(2)}%
                    <span style={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                      vs previous {selectedTimeScale === 'ALL' ? 'year' : selectedTimeScale}
                    </span>
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Advanced Risk Metrics */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Advanced Risk Ratios</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Tooltip title="Annual return divided by maximum drawdown. Measures return relative to worst losses. Values > 1 are good, > 3 are excellent.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Calmar Ratio ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color={advancedData?.calmar_ratio && advancedData.calmar_ratio > 1 ? 'success.main' : 'warning.main'}>
                    {advancedData?.calmar_ratio === null ? '∞' : advancedData?.calmar_ratio?.toFixed(2) || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Like Sharpe ratio but only considers downside volatility. Better measure for asymmetric returns. Values > 1 are good, > 2 are excellent.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Sortino Ratio ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color={advancedData?.sortino_ratio > 1 ? 'success.main' : 'warning.main'}>
                    {advancedData?.sortino_ratio.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Average amount you can expect to win or lose per trade. Formula: (Win Rate × Avg Win) - (Loss Rate × Avg Loss). Positive values indicate profitable system.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Expectancy ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color={advancedData?.expectancy > 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(advancedData?.expectancy)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Gross profit divided by gross loss. Measures how much you make on winners vs lose on losers. Values > 1.5 are good, > 2 are excellent.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Profit Factor ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color={advancedData?.profit_factor && advancedData.profit_factor > 1.5 ? 'success.main' : 'warning.main'}>
                    {advancedData?.profit_factor === null ? '∞' : advancedData?.profit_factor?.toFixed(2) || 'N/A'}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Streak Analysis */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Streak Analysis</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Tooltip title="Number of consecutive winning trades you're currently on. Helps track momentum and potential overconfidence.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Current Win Streak ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color="success.main">
                    {advancedData?.consecutive_wins}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Number of consecutive losing trades you're currently experiencing. Important for risk management and emotional control.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Current Loss Streak ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color="error.main">
                    {advancedData?.consecutive_losses}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Your longest winning streak ever. Shows your system's potential but also risk of overconfidence during hot streaks.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Max Win Streak ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color="success.main">
                    {advancedData?.max_consecutive_wins}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Tooltip title="Your worst losing streak. Critical for position sizing - you need enough capital to survive this happening again.">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                      Max Loss Streak ℹ️
                    </Typography>
                  </Tooltip>
                  <Typography variant="h6" color="error.main">
                    {advancedData?.max_consecutive_losses}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Time Analysis Tab */}
      {tabValue === 2 && (
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Total Sell Events</Typography>
                <Typography variant="h4">{timeAnalysisData.totalSellEvents || 0}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {timeAnalysisData.totalTrades} closed positions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Avg Holding Period</Typography>
                <Typography variant="h4">{timeAnalysisData.avgHoldingDays.toFixed(0)} days</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Final P&L</Typography>
                <Typography 
                  variant="h4" 
                  color={timeAnalysisData.cumulativeReturns.length > 0 && 
                    timeAnalysisData.cumulativeReturns[timeAnalysisData.cumulativeReturns.length - 1]?.cumulative > 0 
                    ? 'success.main' : 'error.main'}
                >
                  ${timeAnalysisData.cumulativeReturns.length > 0 ? 
                    timeAnalysisData.cumulativeReturns[timeAnalysisData.cumulativeReturns.length - 1]?.cumulative.toLocaleString() : '0'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  From all sell events
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Cumulative Returns Chart */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Cumulative Returns (Event-Based)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Now showing P&L attributed to actual sell dates (not final position close dates)
              </Typography>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeAnalysisData.cumulativeReturns} margin={{ top: 30, right: 40, left: 30, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={CHART_COLORS.grid} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={90}
                    />
                    <YAxis
                      tickFormatter={currencyTickFormatter}
                      tick={{ fill: CHART_COLORS.text, fontSize: 13 }}
                      width={100}
                      label={{ value: 'Cumulative P&L ($)', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.text } }}
                    />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Line 
                      type="monotone" 
                      dataKey="cumulative" 
                      stroke={CHART_COLORS.primary}
                      strokeWidth={3}
                      dot={{ fill: CHART_COLORS.primary, r: 2 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Holding Period Analysis */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Holding Period Analysis</Typography>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeAnalysisData.holdingPeriodChart} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid}/>
                    <XAxis
                      dataKey="range"
                      tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                      angle={-30}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fill: CHART_COLORS.text }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="count" fill={CHART_COLORS.success} name="Trade Count" />
                    <Bar dataKey="avgReturn" fill={CHART_COLORS.primary} name="Avg Return ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* P&L Distribution */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>P&L Distribution</Typography>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeAnalysisData.pnlDistributionChart} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid}/>
                    <XAxis
                      dataKey="range"
                      tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis tick={{ fill: CHART_COLORS.text }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="count" fill={CHART_COLORS.purple} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Holding Period vs Returns Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Holding Period Performance Summary</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Holding Period</TableCell>
                      <TableCell align="right">Trade Count</TableCell>
                      <TableCell align="right">Total Return</TableCell>
                      <TableCell align="right">Average Return</TableCell>
                      <TableCell align="right">Success Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {timeAnalysisData.holdingPeriodChart.map((row) => (
                      <TableRow key={row.range}>
                        <TableCell component="th" scope="row">{row.range}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                        <TableCell 
                          align="right" 
                          sx={{ color: row.totalReturn >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${row.totalReturn.toLocaleString()}
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.avgReturn >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${row.avgReturn.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {/* Calculate success rate - would need additional data structure for this */}
                          -
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Full Account History
            </Typography>
            <EquityCurveChart height={400} />
          </Grid>
        </Grid>
      )}

      {/* Portfolio Analysis Tab */}
      {tabValue === 3 && (
        <Grid container spacing={3}>
          {/* Portfolio Overview Cards */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Total Positions</Typography>
                <Typography variant="h4">{portfolioAnalysisData.totalPositions}</Typography>
                <Typography variant="body2" color="success.main">
                  {portfolioAnalysisData.activePositions} active
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Portfolio Value</Typography>
                <Typography variant="h4">${portfolioAnalysisData.totalPortfolioValue.toLocaleString()}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Current market value of open positions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Tooltip title="Percentage of your TOTAL ACCOUNT VALUE (from Settings) held in your 5 largest open positions. This shows what % of your trading capital is concentrated in your top holdings. Values >50% indicate high concentration risk, 30-50% is moderate, <30% is well diversified.">
                  <Typography color="text.secondary" gutterBottom sx={{ cursor: 'help' }}>
                    Concentration Risk ℹ️
                  </Typography>
                </Tooltip>
                <Typography 
                  variant="h4" 
                  color={portfolioAnalysisData.concentrationRisk > 50 ? 'error.main' : 
                    portfolioAnalysisData.concentrationRisk > 30 ? 'warning.main' : 'success.main'}
                >
                  {portfolioAnalysisData.concentrationRisk.toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Of ${accountBalance.toLocaleString()} account
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Diversification</Typography>
                <Typography variant="h4">{portfolioAnalysisData.sectorChart.length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sectors represented
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Sector Allocation Pie Chart */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Distribution of your current open positions across different market sectors based on current market value.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  Sector Allocation (Open Positions) ℹ️
                </Typography>
              </Tooltip>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolioAnalysisData.sectorChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={130}
                      innerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {portfolioAnalysisData.sectorChart.map((entry, index) => (
                        <Cell
                          key={`sector-${index}`}
                          fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Position Size Distribution */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Shows how your open positions are distributed by current market value. Helps identify if you're sizing positions consistently.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  Position Size Distribution (Open) ℹ️
                </Typography>
              </Tooltip>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={portfolioAnalysisData.positionSizeChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <RechartsTooltip formatter={(value: number) => [value, 'Position Count']} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="count" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Performance by Position Size */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Analyzes win/loss performance of your closed positions grouped by original position size. Helps identify if larger positions affect your win rate.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  Performance by Position Size (Closed Trades) ℹ️
                </Typography>
              </Tooltip>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={portfolioAnalysisData.performanceBySize}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="wins" stackId="trades" fill="#2e7d32" name="wins" />
                    <Bar dataKey="losses" stackId="trades" fill="#d32f2f" name="losses" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Top Positions Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Top Open Positions by Current Value</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">Position Value</TableCell>
                      <TableCell align="right">P&L</TableCell>
                      <TableCell align="right">Status</TableCell>
                      <TableCell align="right">% of Portfolio</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {portfolioAnalysisData.topPositions.map((position, index) => (
                      <TableRow key={`${position.ticker}-${index}`}>
                        <TableCell component="th" scope="row">
                          <Typography variant="subtitle2">{position.ticker}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          ${position.value.toLocaleString()}
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: position.pnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${position.pnl.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          <Chip 
                            label={position.status}
                            color={position.status === 'open' ? 'primary' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          {portfolioAnalysisData.totalPortfolioValue > 0 ? 
                            ((position.value / portfolioAnalysisData.totalPortfolioValue) * 100).toFixed(1) : 0}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Performance Summary by Size Category */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Position Size Performance Analysis</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Position Size</TableCell>
                      <TableCell align="right">Total Trades</TableCell>
                      <TableCell align="right">Wins</TableCell>
                      <TableCell align="right">Losses</TableCell>
                      <TableCell align="right">Win Rate</TableCell>
                      <TableCell align="right">Total P&L</TableCell>
                      <TableCell align="right">Avg P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {portfolioAnalysisData.performanceBySize.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell component="th" scope="row">{row.category}</TableCell>
                        <TableCell align="right">{row.wins + row.losses}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{row.wins}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{row.losses}</TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.winRate >= 50 ? 'success.main' : 'error.main' }}
                        >
                          {row.winRate.toFixed(1)}%
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.totalPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${row.totalPnl.toLocaleString()}
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.avgPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${row.avgPnl.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Account Growth Over Time
            </Typography>
            <EquityCurveChart height={350} />
          </Grid>
        </Grid>
      )}

      {/* Entry/Exit Analysis Tab */}
      {tabValue === 4 && (
        <Grid container spacing={3}>
          {/* Entry/Exit Summary Cards */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Total Exits</Typography>
                <Typography variant="h4">{entryExitAnalysisData.totalExits}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Win/Loss Ratio</Typography>
                <Typography variant="h4" color={entryExitAnalysisData.winLossRatio > 1 ? 'success.main' : 'error.main'}>
                  {entryExitAnalysisData.winLossRatio.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Avg Win</Typography>
                <Typography variant="h4" color="success.main">
                  ${entryExitAnalysisData.avgWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Avg Loss</Typography>
                <Typography variant="h4" color="error.main">
                  ${entryExitAnalysisData.avgLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Entry Day Analysis */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Best Entry Days</Typography>
              <Box sx={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entryExitAnalysisData.entryDayChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="avgPnl" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Entry Hour Analysis */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Shows average P&L by the time of day when trades were entered. Helps identify optimal entry timing patterns.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  Entry Time Analysis ℹ️
                </Typography>
              </Tooltip>
              <Box sx={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entryExitAnalysisData.entryHourChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      label={{ value: 'Time of Day (Hours)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Avg P&L ($)', angle: -90, position: 'insideLeft' }}
                      tickFormatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="avgPnl" fill="#2e7d32" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Trading Psychology Tab */}
      {tabValue === 5 && (
        <Grid container spacing={3}>
          {/* Psychology Summary Cards */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Max Win Streak</Typography>
                <Typography variant="h4" color="success.main">{psychologyData.maxWinStreak}</Typography>
                <Typography variant="body2" color="text.secondary">
                  consecutive wins
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Max Loss Streak</Typography>
                <Typography variant="h4" color="error.main">{psychologyData.maxLossStreak}</Typography>
                <Typography variant="body2" color="text.secondary">
                  consecutive losses
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Avg Win Streak</Typography>
                <Typography variant="h4">{psychologyData.avgWinStreak.toFixed(1)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  average streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Avg Loss Streak</Typography>
                <Typography variant="h4">{psychologyData.avgLossStreak.toFixed(1)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  average streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Emotional Impact Analysis */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Categorizes trades by their potential emotional impact based on P&L size. Low Impact: <$1000, Medium Impact: $1000-$5000, High Impact: >$5000. Shows if larger trades affect your performance differently.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  Performance by Emotional Impact ℹ️
                </Typography>
              </Tooltip>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                How well do you perform on trades of different sizes? Large trades can create emotional pressure.
              </Typography>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={psychologyData.impactChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="wins" stackId="trades" fill="#2e7d32" name="wins" />
                    <Bar dataKey="losses" stackId="trades" fill="#d32f2f" name="losses" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Psychological Impact Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Emotional Impact Analysis</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Impact Level</TableCell>
                      <TableCell align="right">Total Trades</TableCell>
                      <TableCell align="right">Wins</TableCell>
                      <TableCell align="right">Losses</TableCell>
                      <TableCell align="right">Win Rate</TableCell>
                      <TableCell align="right">Total P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {psychologyData.impactChart.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell component="th" scope="row">{row.category}</TableCell>
                        <TableCell align="right">{row.wins + row.losses}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{row.wins}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{row.losses}</TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.winRate >= 50 ? 'success.main' : 'error.main' }}
                        >
                          {row.winRate.toFixed(1)}%
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: row.totalPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${row.totalPnl.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Strategies Tab */}
      {tabValue === 6 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Strategy Performance</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Strategy</TableCell>
                      <TableCell align="right">Total Trades</TableCell>
                      <TableCell align="right">Wins</TableCell>
                      <TableCell align="right">Losses</TableCell>
                      <TableCell align="right">Win Rate</TableCell>
                      <TableCell align="right">Total P&L</TableCell>
                      <TableCell align="right">Avg P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.topStrategies.map((strategy, index) => (
                      <TableRow key={`${strategy.strategy}-${index}`}>
                        <TableCell component="th" scope="row">
                          <Typography variant="subtitle2">{strategy.strategy}</Typography>
                        </TableCell>
                        <TableCell align="right">{strategy.trades}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{strategy.wins}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{strategy.losses}</TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: strategy.winRate >= 50 ? 'success.main' : 'error.main' }}
                        >
                          {strategy.winRate.toFixed(1)}%
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: strategy.totalPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${strategy.totalPnl.toLocaleString()}
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: strategy.avgPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${strategy.avgPnl.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Strategy Performance Chart */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Strategy P&L Comparison</Typography>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPerformersData.topStrategies.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="strategy" angle={-45} textAnchor="end" height={100} />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="totalPnl" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Top Performers Tab */}
      {tabValue === 7 && (
        <Grid container spacing={3}>
          {/* Best Trades */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>🏆 Best Trades</Typography>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">P&L</TableCell>
                      <TableCell align="right">Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.bestTrades.map((trade, index) => (
                      <TableRow key={`best-${trade.id || index}`}>
                        <TableCell>
                          <Typography variant="subtitle2">{trade.ticker}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>
                          ${(trade.total_realized_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell align="right">
                          {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Worst Trades */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>📉 Worst Trades</Typography>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">P&L</TableCell>
                      <TableCell align="right">Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.worstTrades.map((trade, index) => (
                      <TableRow key={`worst-${trade.id || index}`}>
                        <TableCell>
                          <Typography variant="subtitle2">{trade.ticker}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>
                          ${(trade.total_realized_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell align="right">
                          {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Top Performing Tickers */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Tooltip title="Shows tickers you've traded more than once, ranked by total P&L across all trades. Helps identify your most consistently profitable stocks.">
                <Typography variant="h6" gutterBottom sx={{ cursor: 'help' }}>
                  🏆 Top Performing Tickers ℹ️
                </Typography>
              </Tooltip>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell align="right">Total Trades</TableCell>
                      <TableCell align="right">Wins</TableCell>
                      <TableCell align="right">Losses</TableCell>
                      <TableCell align="right">Win Rate</TableCell>
                      <TableCell align="right">Total P&L</TableCell>
                      <TableCell align="right">Avg P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformersData.topTickers.map((ticker, index) => (
                      <TableRow key={`ticker-${ticker.ticker}-${index}`}>
                        <TableCell component="th" scope="row">
                          <Typography variant="subtitle2" fontWeight="bold">{ticker.ticker}</Typography>
                        </TableCell>
                        <TableCell align="right">{ticker.trades}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{ticker.wins}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{ticker.losses}</TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: ticker.winRate >= 50 ? 'success.main' : 'error.main' }}
                        >
                          {ticker.winRate.toFixed(1)}%
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: ticker.totalPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${ticker.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell 
                          align="right"
                          sx={{ color: ticker.avgPnl >= 0 ? 'success.main' : 'error.main' }}
                        >
                          ${ticker.avgPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Top Tickers Performance Chart */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Top Tickers P&L Chart</Typography>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPerformersData.topTickers.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ticker" />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5' }} animationDuration={150} />
                    <Bar dataKey="totalPnl" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}
      {/* REPLACE THE ENTIRE tabValue === 8 SECTION WITH THIS: */}
      {tabValue === 8 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">
                  P&L Calendar
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Button
                    variant={selectedTimeScale === 'ALL' ? 'contained' : 'outlined'}
                    onClick={() => setSelectedTimeScale('ALL')}
                    size="small"
                  >
                    Year View
                  </Button>
                  <Button
                    variant={selectedTimeScale !== 'ALL' ? 'contained' : 'outlined'}
                    onClick={() => setSelectedTimeScale('1M')}
                    size="small"
                  >
                    Month View
                  </Button>
                </Box>
              </Box>

              <PnLCalendar
                timeScale={selectedTimeScale}
                formatCurrency={formatCurrency}
              />
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};
export default Analytics;
