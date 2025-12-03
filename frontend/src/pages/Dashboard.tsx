import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Divider } from '@mui/material';
import { EquityCurveChart } from '../components/EquityCurveChart';
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
import api from '../services/apiConfig';

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
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsWithEvents, setPositionsWithEvents] = useState<Position[]>([]);
  const [accountValue, setAccountValue] = useState<number>(0);
  const [accountBreakdown, setAccountBreakdown] = useState<any>(null);
  const [showBreakdownDialog, setShowBreakdownDialog] = useState(false);

  const { formatCurrency } = useCurrency();
  const location = useLocation();

  useEffect(() => {
    loadDashboardData();
    fetchDynamicAccountValue();
  }, []);

  // Refresh data when navigating to dashboard
  useEffect(() => {
    if (location.pathname === '/') {
      loadDashboardData();
      fetchDynamicAccountValue();
    }
  }, [location.pathname]);
  
  
  const fetchDynamicAccountValue = async () => {
    try {
      const [valueResponse, growthMetricsResponse] = await Promise.all([
        api.get('/api/users/me/account-value'),
        api.get('/api/analytics/account-growth-metrics')
      ]);
      
      setAccountValue(valueResponse.data.account_value);
      setAccountBreakdown(growthMetricsResponse.data);
    } catch (error) {
      console.error('Failed to fetch dynamic account value:', error);
    }
  };

  // Note: Removed auto-refresh on visibility/focus to prevent infinite API loops
  // Data refreshes on mount and navigation which is sufficient

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load positions with reasonable limit for dashboard
      const allPositions = await getAllPositions({ limit: 100000 });
      setPositions(allPositions);

      // Load positions with events for display
      const allPositionsWithEvents = await getAllPositionsWithEvents({ limit: 100000 });
      setPositionsWithEvents(allPositionsWithEvents);

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
        accountGrowth
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
                {formatCurrency(accountValue)}
              </Typography>
              {accountBreakdown && (
                <>
                  <Box display="flex" alignItems="center" mt={1}>
                    {(accountBreakdown?.total_growth_percent ?? 0) >= 0 ? (
                      <TrendingUpIcon color="success" fontSize="small" />
                    ) : (
                      <TrendingDownIcon color="error" fontSize="small" />
                    )}
                    <Typography 
                      variant="body2" 
                      color={(accountBreakdown.total_growth_percent ?? 0) >= 0 ? 'success.main' : 'error.main'}
                      sx={{ ml: 0.5 }}
                    >
                      {accountBreakdown 
                        ? `${(accountBreakdown.total_growth_percent ?? 0).toFixed(2)}% Total Growth`
                        : '0.00% Total Growth'
                      }
                    </Typography>
                  </Box>
                  <Button 
                    size="small" 
                    onClick={() => setShowBreakdownDialog(true)}
                    sx={{ mt: 1 }}
                  >
                    View Breakdown
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Trading Performance
              </Typography>
              {accountBreakdown ? (
                <>
                  <Typography
                    variant="h4"
                    color={(accountBreakdown.trading_growth_percent ?? 0) >= 0 ? 'success.main' : 'error.main'}
                  >
                    {(accountBreakdown.trading_growth_percent ?? 0).toFixed(2)}%
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {formatCurrency(accountBreakdown.realized_pnl ?? 0)} P&L (Excludes deposits/withdrawals)
                  </Typography>
                </>
              ) : (
                <Typography variant="h4">Loading...</Typography>
              )}
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
                color={(accountBreakdown?.realized_pnl ?? 0) >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(accountBreakdown?.realized_pnl ?? 0)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                FIFO cost basis
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

        {/* Equity Curve - Full Width */}
        <Grid item xs={12}>
          <EquityCurveChart height={400} />
        </Grid>

        {/* Performance Highlights - Moved after Equity Curve for better spacing */}
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

      <Dialog 
        open={showBreakdownDialog} 
        onClose={() => setShowBreakdownDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Account Value Breakdown</DialogTitle>
        <DialogContent>
          {accountBreakdown && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'primary.light' }}>
                  <Typography variant="body2" color="primary.contrastText">
                    Current Account Value
                  </Typography>
                  <Typography variant="h4" color="primary.contrastText">
                    {formatCurrency(accountValue)}
                  </Typography>
                </Paper>
              </Grid>
              
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }}>
                  <Chip label="Components" size="small" />
                </Divider>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Starting Balance
                  </Typography>
                  <Typography variant="h6">
                    {formatCurrency(accountBreakdown?.starting_balance)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Trading P&L
                  </Typography>
                  <Typography 
                    variant="h6"
                    color={accountBreakdown?.realized_pnl >= 0 ? 'success.main' : 'error.main'}
                  >
                    {accountBreakdown?.realized_pnl >= 0 ? '+' : ''}
                    {formatCurrency(accountBreakdown?.realized_pnl)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Deposits
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    +{formatCurrency(accountBreakdown?.total_deposits)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Withdrawals
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    -{formatCurrency(accountBreakdown?.total_withdrawals)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }}>
                  <Chip label="Growth Metrics" size="small" />
                </Divider>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Growth
                  </Typography>
                  <Typography 
                    variant="h6"
                    color={((accountBreakdown?.total_growth_percent ?? 0) >= 0) ? 'success.main' : 'error.main'}
                  >
                    {((accountBreakdown?.total_growth_percent ?? 0) >= 0) ? '+' : ''}
                    {(accountBreakdown?.total_growth_percent ?? 0).toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Includes deposits/withdrawals
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Trading Growth
                  </Typography>
                  <Typography 
                    variant="h6"
                    color={((accountBreakdown?.trading_growth_percent ?? 0) >= 0) ? 'success.main' : 'error.main'}
                  >
                    {((accountBreakdown?.trading_growth_percent ?? 0) >= 0) ? '+' : ''}
                    {(accountBreakdown?.trading_growth_percent ?? 0).toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pure trading performance
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Trading Growth</strong> excludes deposits and withdrawals to show 
                    your actual trading skill, matching professional broker standards.
                  </Typography>
                </Alert>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBreakdownDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;