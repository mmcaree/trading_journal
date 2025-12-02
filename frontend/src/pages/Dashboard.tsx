import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Paper,
  Chip,
  Alert,
  LinearProgress
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  AccountBalance as AccountBalanceIcon,
  Timeline as TimelineIcon,
  Add as AddIcon
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Link, useLocation } from 'react-router-dom';

import { getAllPositions, getAllPositionsWithEvents } from '../services/positionsService';
import { accountService } from '../services/accountService';
import { useCurrency } from '../context/CurrencyContext';
import { Position } from '../services/positionsService';
import { CustomTooltip } from '../components/CustomChartComponents';

const COLORS = ['#1da0f0', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface DashboardMetrics {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  totalInvested: number;
  totalRealized: number;
  totalUnrealized: number;
  winRate: number;
  bestPerformer: { ticker: string; pnl: number } | null;
  worstPerformer: { ticker: string; pnl: number } | null;
  accountBalance: number;
  accountGrowth: number;
  eventBasedRealizedPnL: number;
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsWithEvents, setPositionsWithEvents] = useState<Position[]>([]);
  const { formatCurrency } = useCurrency();
  const location = useLocation();

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Refresh data when navigating to dashboard
  useEffect(() => {
    if (location.pathname === '/') {
      loadDashboardData();
    }
  }, [location.pathname]);

  // Refresh data when user returns to the page/tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible, refresh data
        loadDashboardData();
      }
    };

    const handleFocus = () => {
      // Page gained focus, refresh data
      loadDashboardData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load positions with reasonable limit for dashboard
      const allPositions = await getAllPositions({ limit: 100000 });
      setPositions(allPositions);

      // Load positions with events for event-based P&L calculation
      const allPositionsWithEvents = await getAllPositionsWithEvents({ limit: 100000 });
      setPositionsWithEvents(allPositionsWithEvents);

      // Calculate event-based realized P&L (sum of all sell events)
      const eventBasedRealizedPnL = allPositionsWithEvents
        .flatMap(position => position.events?.filter(event => event.event_type === 'sell') || [])
        .reduce((sum, event) => sum + (event.realized_pnl || 0), 0);

      // Calculate metrics
      const openPositions = allPositions.filter(p => p.status === 'open');
      const closedPositions = allPositions.filter(p => p.status === 'closed');
      
      const totalInvested = openPositions.reduce((sum, p) => sum + (p.total_cost || 0), 0);
      const totalRealized = closedPositions.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0);
      
      // Calculate unrealized P&L for open positions (simplified - would need current prices)
      const totalUnrealized = openPositions.reduce((sum, p) => {
        // For now, assume no unrealized gains until we have current market prices
        return sum + 0;
      }, 0);
      
      // Win rate calculation
      const profitableClosedPositions = closedPositions.filter(p => (p.total_realized_pnl || 0) > 0);
      const winRate = closedPositions.length > 0 ? (profitableClosedPositions.length / closedPositions.length) * 100 : 0;
      
      // Best/Worst performers
      const sortedByPnL = closedPositions
        .filter(p => p.total_realized_pnl !== undefined && p.total_realized_pnl !== null)
        .sort((a, b) => (b.total_realized_pnl || 0) - (a.total_realized_pnl || 0));
      
      const bestPerformer = sortedByPnL.length > 0 
        ? { ticker: sortedByPnL[0].ticker, pnl: sortedByPnL[0].total_realized_pnl || 0 }
        : null;
      
      const worstPerformer = sortedByPnL.length > 0
        ? { ticker: sortedByPnL[sortedByPnL.length - 1].ticker, pnl: sortedByPnL[sortedByPnL.length - 1].total_realized_pnl || 0 }
        : null;

      // Account information
      const accountBalance = accountService.getCurrentBalance();
      const startingBalance = accountService.getAccountSettings().starting_balance;
      const accountGrowth = ((accountBalance - startingBalance) / startingBalance) * 100;

      setMetrics({
        totalPositions: allPositions.length,
        openPositions: openPositions.length,
        closedPositions: closedPositions.length,
        totalInvested,
        totalRealized,
        totalUnrealized,
        winRate,
        bestPerformer,
        worstPerformer,
        accountBalance,
        accountGrowth,
        eventBasedRealizedPnL
      });
      
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Generate pie chart data for position status
  const getPositionStatusData = () => {
    if (!metrics) return [];
    
    return [
      { name: 'Open', value: metrics.openPositions, color: COLORS[0] },
      { name: 'Closed', value: metrics.closedPositions, color: COLORS[1] }
    ];
  };

  // Generate recent positions data
  const getRecentPositions = () => {
    return positions
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
      .slice(0, 5);
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <LinearProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>Loading dashboard data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={loadDashboardData}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!metrics) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <Alert severity="warning">
          No data available. Start by creating your first position.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Trading Dashboard</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={Link}
          to="/positions"
        >
          Create Position
        </Button>
      </Box>

      <Grid container spacing={3}>
        
        {/* Account Overview */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <AccountBalanceIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Account Balance</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {formatCurrency(metrics.accountBalance)}
              </Typography>
              <Box display="flex" alignItems="center" mt={1}>
                {metrics.accountGrowth >= 0 ? (
                  <TrendingUpIcon color="success" fontSize="small" />
                ) : (
                  <TrendingDownIcon color="error" fontSize="small" />
                )}
                <Typography 
                  variant="body2" 
                  color={metrics.accountGrowth >= 0 ? 'success.main' : 'error.main'}
                  sx={{ ml: 0.5 }}
                >
                  {metrics.accountGrowth.toFixed(2)}% Total Growth
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Positions */}
        <Grid item xs={12} md={2}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Positions
              </Typography>
              <Typography variant="h3">
                {metrics.totalPositions}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {metrics.openPositions} open, {metrics.closedPositions} closed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Win Rate */}
        <Grid item xs={12} md={2}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Win Rate
              </Typography>
              <Typography variant="h3" color={metrics.winRate >= 50 ? 'success.main' : 'error.main'}>
                {metrics.winRate.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {metrics.closedPositions} closed positions
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Realized P&L */}
        <Grid item xs={12} md={2}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Realized P&L
              </Typography>
              <Typography 
                variant="h3" 
                color={metrics.eventBasedRealizedPnL >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(metrics.eventBasedRealizedPnL)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                All realized sell events
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Invested */}
        <Grid item xs={12} md={2}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Invested
              </Typography>
              <Typography variant="h3">
                {formatCurrency(metrics.totalInvested)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Across all positions
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Position Status Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Position Status</Typography>
              <Box height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={getPositionStatusData()}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {getPositionStatusData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Highlights */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="h6" gutterBottom>Performance Highlights</Typography>
                <Typography 
                  variant="caption" 
                  color="textSecondary"
                  title="Note: The top and worst performers shown are individual positions (single trades), not aggregated by ticker."
                  sx={{ display: 'flex', alignItems: 'left', gap: 0.5 }}
                >
                  ℹ️ <span>Shown per position, not by ticker</span>
                </Typography>
                </Box>
                <Box>
                {metrics.bestPerformer && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box display="flex" alignItems="center">
                    <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                    <Typography variant="body1">Best Performer</Typography>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="subtitle1">{metrics.bestPerformer.ticker}</Typography>
                    <Typography variant="body2" color="success.main">
                    {formatCurrency(metrics.bestPerformer.pnl)}
                    </Typography>
                  </Box>
                  </Box>
                )}
                
                {metrics.worstPerformer && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box display="flex" alignItems="center">
                    <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                    <Typography variant="body1">Worst Performer</Typography>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="subtitle1">{metrics.worstPerformer.ticker}</Typography>
                    <Typography variant="body2" color="error.main">
                    {formatCurrency(metrics.worstPerformer.pnl)}
                    </Typography>
                  </Box>
                  </Box>
                )}
                
                {!metrics.bestPerformer && !metrics.worstPerformer && (
                  <Typography variant="body2" color="textSecondary">
                  No closed positions yet to analyze performance.
                  </Typography>
                )}
                </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Positions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Recent Positions</Typography>
                <Button 
                  component={Link} 
                  to="/positions"
                  endIcon={<AssessmentIcon />}
                >
                  View All
                </Button>
              </Box>
              
              <Grid container spacing={2}>
                {getRecentPositions().map((position) => (
                  <Grid item xs={12} sm={6} md={2.4} key={position.id}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="h6">{position.ticker}</Typography>
                      <Typography variant="body2" color="textSecondary">
                        {position.strategy} • {position.setup_type}
                      </Typography>
                      <Typography variant="body2">
                        {position.current_shares} shares @ {formatCurrency(position.avg_entry_price || 0)}
                      </Typography>
                      <Chip 
                        label={position.status}
                        color={position.status === 'open' ? 'primary' : 'default'}
                        size="small"
                        sx={{ mt: 1 }}
                      />
                      <Typography 
                        variant="body2" 
                        color={
                          position.status === 'closed' 
                            ? ((position.total_realized_pnl || 0) >= 0 ? 'success.main' : 'error.main')
                            : 'textSecondary'
                        }
                        sx={{ mt: 0.5 }}
                      >
                        {position.status === 'closed' 
                          ? `P&L: ${formatCurrency(position.total_realized_pnl || 0)}`
                          : 'P&L: Unrealized'
                        }
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
                
                {getRecentPositions().length === 0 && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary" textAlign="center">
                      No positions yet. Start by creating your first position.
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

      </Grid>
    </Box>
  );
};

export default Dashboard;