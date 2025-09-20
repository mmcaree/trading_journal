// src/pages/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { Grid, Card, CardContent, Typography, Box, Button, Paper, Alert, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchDashboardData } from '../services/tradeService';
import { testApiConnection } from '../services/debugService';
import { formatCurrency, formatPercentage, formatProfitLoss } from '../utils/formatters';
import { currencyTooltipFormatter, currencyTooltipFormatterWithDate, currencyTickFormatter } from '../utils/chartFormatters';
import CurrencyDisplay from '../components/CurrencyDisplay';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

interface DashboardData {
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

const COLORS = [
  '#4caf50', // Green
  '#ff9800', // Orange  
  '#f44336', // Red
  '#2196f3', // Blue
  '#9c27b0', // Purple
  '#795548', // Brown
  '#e91e63', // Pink
  '#00bcd4', // Cyan
  '#ff5722', // Deep Orange
  '#607d8b', // Blue Grey
  '#ffc107', // Amber
  '#8bc34a'  // Light Green
];

const Dashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<{status: string, message: string} | null>(null);
  const [timeRange, setTimeRange] = useState<string>('1M');
  const { user } = useAuth();

  useEffect(() => {
    const testConnection = async () => {
      setLoading(true);
      try {
        // First test the API connection
        const connectionResult = await testApiConnection();
        setApiStatus(connectionResult);
        
        if (connectionResult.status === 'success') {
          // If API connection is successful, load the dashboard data
          console.log('Dashboard: API connection successful, now fetching dashboard data...');
          const data = await fetchDashboardData();
          setDashboardData(data);
          console.log('Dashboard data loaded successfully:', data);
          setError(null);
        } else {
          setError('Cannot connect to the API. Please check if the backend server is running.');
        }
      } catch (err: any) {
        console.error('Error in dashboard initialization:', err);
        setError(err.message || 'An error occurred while loading the dashboard');
      } finally {
        setLoading(false);
      }
    };

    testConnection();
  }, []);

  // Filter equity curve data based on selected time range
  const getFilteredEquityCurve = () => {
    if (!dashboardData?.equityCurve) {
      console.log('No equity curve data available');
      return [];
    }
    
    console.log('Original equity curve data:', dashboardData.equityCurve);
    
    if (timeRange === 'ALL') {
      return dashboardData.equityCurve;
    }
    
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case '1M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '3M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case 'YTD':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return dashboardData.equityCurve;
    }
    
    const filtered = dashboardData.equityCurve.filter(item => new Date(item.date) >= startDate);
    console.log('Filtered data length:', filtered.length, 'from', dashboardData.equityCurve.length);
    return filtered;
  };

  const handleTimeRangeChange = (event: React.MouseEvent<HTMLElement>, newRange: string) => {
    if (newRange !== null) {
      setTimeRange(newRange);
    }
  };
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography variant="h6">Loading dashboard data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography variant="h6" color="error" gutterBottom>
          {error}
        </Typography>
        {apiStatus && (
          <Typography variant="body2" color="textSecondary">
            API Status: {apiStatus.message}
          </Typography>
        )}
        <Button 
          variant="contained" 
          color="primary" 
          onClick={() => window.location.reload()} 
          sx={{ mt: 2 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  if (!dashboardData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography variant="h6" color="error">
          Failed to load dashboard data. Please try refreshing the page.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Dashboard</Typography>
        <Button
          variant="contained"
          color="primary"
          component={Link}
          to="/trades/new"
        >
          New Trade
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Trades
              </Typography>
              <Typography variant="h3">
                {dashboardData.totalTrades}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Open Positions
              </Typography>
              <Typography variant="h3">
                {dashboardData.openTrades}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Win Rate
              </Typography>
              <Typography variant="h3">
                {formatPercentage(dashboardData.winRate)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                P&L
              </Typography>
              <CurrencyDisplay 
                value={dashboardData.profitLoss}
                type="profit-loss"
                variant="h3" 
                color={dashboardData.profitLoss >= 0 ? 'primary' : 'secondary'}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Equity Curve Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                Equity Curve
              </Typography>
              <ToggleButtonGroup
                value={timeRange}
                exclusive
                onChange={handleTimeRangeChange}
                aria-label="time range"
                size="small"
              >
                <ToggleButton value="1M" aria-label="1 month">1M</ToggleButton>
                <ToggleButton value="3M" aria-label="3 months">3M</ToggleButton>
                <ToggleButton value="6M" aria-label="6 months">6M</ToggleButton>
                <ToggleButton value="YTD" aria-label="year to date">YTD</ToggleButton>
                <ToggleButton value="ALL" aria-label="all time">ALL</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={getFilteredEquityCurve()}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tickFormatter={currencyTickFormatter}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={currencyTooltipFormatterWithDate} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="equity" 
                  stroke="#4caf50" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Setup Performance */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 400 }}>            <Typography variant="h6" gutterBottom>
              Strategy Performance
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={dashboardData.setupPerformance}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  dataKey="value"
                >
                  {dashboardData.setupPerformance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name, props) => {
                    const total = dashboardData.setupPerformance.reduce((sum, item) => sum + item.value, 0);
                    const percentage = total > 0 ? ((value as number) / total * 100).toFixed(1) : '0.0';
                    return [`${percentage}%`, name];
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  formatter={(value, entry) => {
                    const data = entry?.payload;
                    if (!data) return value;
                    return `${value}: ${data.value.toFixed(1)}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Recent Trades */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Recent Trades</Typography>
              <Button component={Link} to="/trades">View All</Button>
            </Box>
            <Grid container spacing={2}>
              {dashboardData.recentTrades.map((trade) => (
                <Grid item xs={12} md={6} lg={4} key={trade.id}>
                  <Card>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="h6">{trade.ticker}</Typography>
                        {trade.profitLoss !== null && (
                          <CurrencyDisplay 
                            value={trade.profitLoss}
                            type="profit-loss"
                            variant="body1" 
                            color={trade.profitLoss >= 0 ? 'primary' : 'secondary'}
                          />
                        )}
                      </Box>                      <Typography color="textSecondary">
                        {trade.entryDate ? new Date(trade.entryDate).toLocaleDateString() : 'N/A'}
                      </Typography>
                      <Box mt={1} display="flex" justifyContent="space-between">
                        <Typography 
                          variant="body2"
                          sx={{
                            backgroundColor: 
                              trade.status === 'Open' ? 'info.main' : 
                              trade.status === 'Closed' && trade.profitLoss !== null && trade.profitLoss > 0 ? 'success.main' : 
                              trade.status === 'Closed' && trade.profitLoss !== null && trade.profitLoss < 0 ? 'error.main' :
                              'grey.500',
                            color: 'white',
                            px: 1,
                            py: 0.5,
                            borderRadius: 1
                          }}
                        >
                          {trade.status.toUpperCase()}
                        </Typography>
                        <Button 
                          size="small" 
                          component={Link} 
                          to={`/trades/${trade.id}`}
                        >
                          Details
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
