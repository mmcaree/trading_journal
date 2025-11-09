import React, { useState, useEffect, useMemo } from 'react';
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
  ButtonGroup
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
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
import { getAllPositions } from '../services/positionsService';
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
  const [positions, setPositions] = useState<Position[]>([]);
  const [accountBalance, setAccountBalance] = useState(0);
  const [selectedTimeScale, setSelectedTimeScale] = useState<TimeScale>('ALL');
  const { formatCurrency } = useCurrency();

  // Advanced metrics state
  const [advancedMetrics, setAdvancedMetrics] = useState<{
    risk: RiskMetrics;
    timeBased: TimeBasedMetrics;
    portfolio: PortfolioMetrics;
    entryExit: EntryExitMetrics;
  } | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

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
        return new Date(now.getFullYear(), 0, 1); // January 1st of current year
      case '1YR':
        return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      case 'ALL':
      default:
        return new Date(0); // Beginning of time
    }
  };

  const filteredPositions = useMemo(() => {
    if (selectedTimeScale === 'ALL') return positions;
    
    const cutoffDate = getTimeScaleDate(selectedTimeScale);
    return positions.filter(position => {
      const positionDate = new Date(position.opened_at);
      return positionDate >= cutoffDate;
    });
  }, [positions, selectedTimeScale]);

  // Calculate advanced metrics whenever filtered positions change
  useEffect(() => {
    if (filteredPositions.length > 0) {
      const metrics = calculateAllMetrics(filteredPositions, accountBalance || 10000);
      setAdvancedMetrics(metrics);
    }
  }, [filteredPositions, accountBalance]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [positionsData, balance] = await Promise.all([
        getAllPositions(),
        accountService.getCurrentBalance()
      ]);
      
      setPositions(positionsData || []);
      setAccountBalance(balance);
    } catch (err) {
      console.error('Error loading analytics data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo<AnalyticsMetrics>(() => {
    const closedPositions = filteredPositions.filter(p => p.status === 'closed');
    const openPositions = filteredPositions.filter(p => p.status === 'open');
    const winningTrades = closedPositions.filter(p => (p.total_realized_pnl || 0) > 0);
    const losingTrades = closedPositions.filter(p => (p.total_realized_pnl || 0) < 0);
    
    const totalRealized = closedPositions.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0);
    const totalUnrealized = openPositions.reduce((sum, p) => {
      const currentValue = p.current_shares * (p.avg_entry_price || 0);
      return sum + (currentValue - (p.total_cost || 0));
    }, 0);
    
    const winRate = closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0;
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0) / losingTrades.length)
      : 0;

    const largestWin = Math.max(...winningTrades.map(p => p.total_realized_pnl || 0), 0);
    const largestLoss = Math.abs(Math.min(...losingTrades.map(p => p.total_realized_pnl || 0), 0));
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    const totalVolume = filteredPositions.reduce((sum, p) => sum + (p.total_cost || 0), 0);

    const avgDaysHeld = closedPositions.length > 0 
      ? closedPositions.reduce((sum, p) => {
          if (p.opened_at && p.closed_at) {
            const days = (new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / (1000 * 60 * 60 * 24);
            return sum + Math.max(0, days);
          }
          return sum;
        }, 0) / closedPositions.length 
      : 0;

    return {
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      totalRealized,
      totalUnrealized,
      totalVolume,
      avgDaysHeld
    };
  }, [filteredPositions]);

  const monthlyData = useMemo<MonthlyData[]>(() => {
    const monthlyMap = new Map<string, MonthlyData>();
    
    filteredPositions.forEach(position => {
      if (position.status === 'closed' && position.closed_at) {
        const date = new Date(position.closed_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
            pnl: 0,
            trades: 0
          });
        }
        
        const monthData = monthlyMap.get(monthKey)!;
        monthData.pnl += position.total_realized_pnl || 0;
        monthData.trades += 1;
      }
    });
    
    return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredPositions]);

  const strategyData = useMemo<StrategyData[]>(() => {
    const strategyMap = new Map<string, StrategyData>();
    
    filteredPositions.forEach(position => {
      const strategy = position.strategy || 'No Strategy';
      if (!strategyMap.has(strategy)) {
        strategyMap.set(strategy, {
          strategy,
          trades: 0,
          winRate: 0,
          avgReturn: 0,
          totalPnl: 0
        });
      }
      
      const strategyInfo = strategyMap.get(strategy)!;
      strategyInfo.trades += 1;
      
      if (position.status === 'closed') {
        strategyInfo.totalPnl += position.total_realized_pnl || 0;
      }
    });
    
    strategyMap.forEach((data, strategy) => {
      const closedPositions = filteredPositions.filter(p => p.strategy === strategy && p.status === 'closed');
      const winningTrades = closedPositions.filter(p => (p.total_realized_pnl || 0) > 0);
      
      data.winRate = closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0;
      data.avgReturn = closedPositions.length > 0 
        ? closedPositions.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0) / closedPositions.length
        : 0;
    });
    
    return Array.from(strategyMap.values()).sort((a, b) => b.totalPnl - a.totalPnl);
  }, [filteredPositions]);

  const topPerformers = useMemo(() => {
    const closedPositions = filteredPositions.filter(p => p.status === 'closed' && p.total_realized_pnl);
    return {
      winners: closedPositions
        .filter(p => (p.total_realized_pnl || 0) > 0)
        .sort((a, b) => (b.total_realized_pnl || 0) - (a.total_realized_pnl || 0))
        .slice(0, 5),
      losers: closedPositions
        .filter(p => (p.total_realized_pnl || 0) < 0)
        .sort((a, b) => (a.total_realized_pnl || 0) - (b.total_realized_pnl || 0))
        .slice(0, 5)
    };
  }, [filteredPositions]);

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
            Time Period: {selectedTimeScale === 'ALL' ? 'All Time' : selectedTimeScale}
          </Typography>
        </Paper>
      </Box>
      
      {/* Key Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Account Balance</Typography>
              <Typography variant="h5">{formatCurrency(accountBalance)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Win Rate</Typography>
              <Typography variant="h5" color={metrics.winRate >= 60 ? 'success.main' : 'warning.main'}>
                {metrics.winRate.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Profit Factor</Typography>
              <Typography variant="h5">{metrics.profitFactor.toFixed(2)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Trades</Typography>
              <Typography variant="h5">{metrics.totalTrades}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(e, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" />
          <Tab label="Risk Management" />
          <Tab label="Time Analysis" />
          <Tab label="Portfolio" />
          <Tab label="Entry/Exit" />
          <Tab label="Psychology" />
          <Tab label="Strategies" />
          <Tab label="Top Performers" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Win/Loss Distribution</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Winners', value: metrics.winningTrades },
                      { name: 'Losers', value: metrics.losingTrades }
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                  >
                    <Cell fill="#4CAF50" />
                    <Cell fill="#f44336" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Monthly Performance</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="pnl" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tabValue === 1 && advancedMetrics && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>🛡️</span> Risk Management Dashboard
            </Typography>
          </Grid>

          {/* Key Risk Metrics Cards */}
          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Max Drawdown</Typography>
                <Typography variant="h5" color="error.main">
                  {formatCurrency(advancedMetrics.risk.maxDrawdown)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {advancedMetrics.risk.maxDrawdownPercent.toFixed(1)}% of peak
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>Sharpe Ratio</Typography>
                <Typography 
                  variant="h5" 
                  color={advancedMetrics.risk.sharpeRatio > 1 ? 'success.main' : advancedMetrics.risk.sharpeRatio > 0 ? 'warning.main' : 'error.main'}
                >
                  {advancedMetrics.risk.sharpeRatio.toFixed(2)}
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
                <Typography color="text.secondary" gutterBottom">Recovery Factor</Typography>
                <Typography 
                  variant="h5" 
                  color={advancedMetrics.risk.recoveryFactor > 3 ? 'success.main' : 'warning.main'}
                >
                  {advancedMetrics.risk.recoveryFactor === 999 ? '∞' : advancedMetrics.risk.recoveryFactor.toFixed(1)}
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
                <Typography color="text.secondary" gutterBottom>Kelly %</Typography>
                <Typography 
                  variant="h5" 
                  color={advancedMetrics.risk.kellyPercentage > 0 ? 'success.main' : 'error.main'}
                >
                  {advancedMetrics.risk.kellyPercentage.toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Optimal position size
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Advanced Risk Metrics */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Advanced Risk Ratios</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Calmar Ratio</Typography>
                  <Typography variant="h6" color={advancedMetrics.risk.calmarRatio > 1 ? 'success.main' : 'warning.main'}>
                    {advancedMetrics.risk.calmarRatio === 999 ? '∞' : advancedMetrics.risk.calmarRatio.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Sortino Ratio</Typography>
                  <Typography variant="h6" color={advancedMetrics.risk.sortinoRatio > 1 ? 'success.main' : 'warning.main'}>
                    {advancedMetrics.risk.sortinoRatio.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Expectancy</Typography>
                  <Typography variant="h6" color={advancedMetrics.risk.expectancy > 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(advancedMetrics.risk.expectancy)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Profit Factor</Typography>
                  <Typography variant="h6" color={advancedMetrics.risk.profitFactor > 1.5 ? 'success.main' : 'warning.main'}>
                    {advancedMetrics.risk.profitFactor.toFixed(2)}
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
                  <Typography variant="body2" color="text.secondary">Current Win Streak</Typography>
                  <Typography variant="h6" color="success.main">
                    {advancedMetrics.risk.consecutiveWins}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Current Loss Streak</Typography>
                  <Typography variant="h6" color="error.main">
                    {advancedMetrics.risk.consecutiveLosses}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Max Win Streak</Typography>
                  <Typography variant="h6" color="success.main">
                    {advancedMetrics.risk.maxConsecutiveWins}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Max Loss Streak</Typography>
                  <Typography variant="h6" color="error.main">
                    {advancedMetrics.risk.maxConsecutiveLosses}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Risk vs Return Analysis */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Risk Assessment Summary</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="success.contrastText">
                      {advancedMetrics.risk.winRate.toFixed(0)}%
                    </Typography>
                    <Typography variant="body1" color="success.contrastText">Win Rate</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="primary.contrastText">
                      {formatCurrency(advancedMetrics.risk.avgWin)}
                    </Typography>
                    <Typography variant="body1" color="primary.contrastText">Avg Win</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 2 }}>
                    <Typography variant="h4" color="error.contrastText">
                      {formatCurrency(advancedMetrics.risk.avgLoss)}
                    </Typography>
                    <Typography variant="body1" color="error.contrastText">Avg Loss</Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tabValue === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Performance Metrics</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Average Win</Typography>
                  <Typography variant="h6" color="success.main">{formatCurrency(metrics.avgWin)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Average Loss</Typography>
                  <Typography variant="h6" color="error.main">{formatCurrency(metrics.avgLoss)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Largest Win</Typography>
                  <Typography variant="h6" color="success.main">{formatCurrency(metrics.largestWin)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Largest Loss</Typography>
                  <Typography variant="h6" color="error.main">{formatCurrency(metrics.largestLoss)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Total Volume</Typography>
                  <Typography variant="h6">{formatCurrency(metrics.totalVolume)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Avg Days Held</Typography>
                  <Typography variant="h6">{metrics.avgDaysHeld.toFixed(1)} days</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Total Realized</Typography>
                  <Typography variant="h6" color={metrics.totalRealized >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(metrics.totalRealized)}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">Total Unrealized</Typography>
                  <Typography variant="h6" color={metrics.totalUnrealized >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(metrics.totalUnrealized)}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tabValue === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Strategy Performance</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Strategy</TableCell>
                  <TableCell align="right">Trades</TableCell>
                  <TableCell align="right">Win Rate</TableCell>
                  <TableCell align="right">Avg Return</TableCell>
                  <TableCell align="right">Total P&L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {strategyData.map((strategy) => (
                  <TableRow key={strategy.strategy}>
                    <TableCell>{strategy.strategy}</TableCell>
                    <TableCell align="right">{strategy.trades}</TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={`${strategy.winRate.toFixed(1)}%`}
                        color={strategy.winRate >= 60 ? 'success' : strategy.winRate >= 40 ? 'warning' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(strategy.avgReturn)}</TableCell>
                    <TableCell align="right" sx={{ color: strategy.totalPnl >= 0 ? 'success.main' : 'error.main' }}>
                      {formatCurrency(strategy.totalPnl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tabValue === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ color: 'success.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon />
                Top Winners
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell>Strategy</TableCell>
                      <TableCell align="right">P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformers.winners.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell>{position.ticker}</TableCell>
                        <TableCell>{position.strategy || 'N/A'}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>
                          {formatCurrency(position.total_realized_pnl || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingDownIcon />
                Top Losers
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticker</TableCell>
                      <TableCell>Strategy</TableCell>
                      <TableCell align="right">P&L</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformers.losers.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell>{position.ticker}</TableCell>
                        <TableCell>{position.strategy || 'N/A'}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>
                          {formatCurrency(position.total_realized_pnl || 0)}
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
    </Box>
  );
};

export default Analytics;