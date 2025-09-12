import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid,
  Card,
  CardContent,
  Tab,
  Tabs,
  Button,
  Divider,
  Alert
} from '@mui/material';
import { 
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { fetchAnalyticsData } from '../services/analyticsService';
import { formatCurrency, formatPercentage, formatProfitLoss } from '../utils/formatters';
import { currencyTooltipFormatter, currencyTickFormatter } from '../utils/chartFormatters';
import { useCurrencyFormatting } from '../hooks/useCurrencyFormatting';
import CurrencyDisplay from '../components/CurrencyDisplay';

interface AnalyticsData {
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

const COLORS = ['#4caf50', '#f44336', '#2196f3', '#ff9800', '#9c27b0', '#795548'];

const Analytics: React.FC = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('monthly');
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrencyFromUSD, formatProfitLossFromUSD } = useCurrencyFormatting();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await fetchAnalyticsData();
        setAnalyticsData(data);
        
        // Check if we have any data
        const hasPerformanceData = data.performance.daily.length > 0 || 
                                  data.performance.weekly.length > 0 || 
                                  data.performance.monthly.length > 0 ||
                                  data.performance.ytd.length > 0 ||
                                  data.performance.all.length > 0;
        
        if (!hasPerformanceData) {
          setError("No performance data available. Add some trades to see analytics.");
        }
      } catch (err) {
        console.error('Error fetching analytics data:', err);
        setError("Failed to load analytics data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleTimeframeChange = (event: React.SyntheticEvent, newValue: string) => {
    setTimeframe(newValue);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return <Box sx={{ p: 3 }}><Typography>Loading analytics...</Typography></Box>;
  }

  if (!analyticsData) {
    return <Box sx={{ p: 3 }}><Typography>Failed to load analytics data.</Typography></Box>;
  }

  // Get the appropriate performance data based on timeframe
  const performanceData = 
    timeframe === 'daily' ? analyticsData.performance.daily :
    timeframe === 'weekly' ? analyticsData.performance.weekly :
    timeframe === 'monthly' ? analyticsData.performance.monthly :
    timeframe === 'ytd' ? analyticsData.performance.ytd :
    timeframe === 'all' ? analyticsData.performance.all :
    analyticsData.performance.monthly;

  const winLossData = [
    { name: 'Wins', value: analyticsData.winLoss.winCount },
    { name: 'Losses', value: analyticsData.winLoss.lossCount }
  ].filter(item => item.value > 0); // Filter out zero values

  const hasWinLossData = winLossData.length > 0;
  const hasPerformanceData = performanceData.length > 0;
  const hasStrategiesData = analyticsData.strategies.length > 0;
  const hasSetupsData = analyticsData.setups.length > 0;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Trading Analytics
      </Typography>
      
      {error && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
        >
          <Tab label="Performance" />
          <Tab label="Strategies" />
          <Tab label="Setups" />
        </Tabs>
      </Box>

      {/* Performance Tab */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          {/* P&L Chart */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Profit & Loss Over Time
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Tabs
                  value={timeframe}
                  onChange={handleTimeframeChange}
                  aria-label="timeframe tabs"
                >
                  <Tab label="Daily" value="daily" />
                  <Tab label="Weekly" value="weekly" />
                  <Tab label="Monthly" value="monthly" />
                  <Tab label="YTD" value="ytd" />
                  <Tab label="All" value="all" />
                </Tabs>
              </Box>
              {hasPerformanceData ? (
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={performanceData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey={
                          timeframe === 'daily' ? 'date' : 
                          timeframe === 'weekly' ? 'week' : 
                          timeframe === 'monthly' ? 'month' :
                          timeframe === 'ytd' ? 'month' :
                          timeframe === 'all' ? 'period' : 'month'
                        } 
                      />
                      <YAxis tickFormatter={currencyTickFormatter} />
                      <Tooltip formatter={currencyTooltipFormatter} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#4caf50"
                        activeDot={{ r: 8 }}
                        name="P&L"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    No performance data available for this timeframe
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Stats Cards */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Win/Loss Ratio
                </Typography>
                {hasWinLossData ? (
                  <>
                    <Box sx={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={winLossData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={false}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {winLossData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} trades`, '']} />
                          <Legend 
                            wrapperStyle={{ paddingTop: '10px' }}
                            formatter={(value, entry) => {
                              const data = entry?.payload;
                              if (!data) return value;
                              const total = winLossData.reduce((sum, item) => sum + item.value, 0);
                              const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0.0';
                              return `${value}: ${percentage}%`;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                    <Typography variant="h5" align="center" gutterBottom>
                      Win Rate: {formatPercentage(analyticsData.winLoss.winRate * 100)}
                    </Typography>
                  </>
                ) : (
                  <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography color="text.secondary">
                      No win/loss data available
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Profit & Loss Summary
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {(analyticsData.profitLoss.totalProfit > 0 || analyticsData.profitLoss.totalLoss > 0) ? (
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Total Profit</Typography>
                      <CurrencyDisplay 
                        value={analyticsData.profitLoss.totalProfit}
                        variant="h6" 
                        color="success.main"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Total Loss</Typography>
                      <CurrencyDisplay 
                        value={analyticsData.profitLoss.totalLoss}
                        variant="h6" 
                        color="error.main"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Net Profit/Loss</Typography>
                      <CurrencyDisplay 
                        value={analyticsData.profitLoss.netProfitLoss}
                        type="profit-loss"
                        variant="h5" 
                        color={analyticsData.profitLoss.netProfitLoss >= 0 ? 'success.main' : 'error.main'}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Average Win</Typography>
                      <CurrencyDisplay 
                        value={analyticsData.profitLoss.avgProfit}
                        variant="h6" 
                        color="success.main"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Average Loss</Typography>
                      <CurrencyDisplay 
                        value={analyticsData.profitLoss.avgLoss}
                        variant="h6" 
                        color="error.main"
                      />
                    </Grid>
                  </Grid>
                ) : (
                  <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography color="text.secondary">
                      No profit/loss data available
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Strategies Tab */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Strategy Performance
              </Typography>
              {hasStrategiesData ? (
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.strategies}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                      <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                      <Tooltip 
                        formatter={(value, name) => [
                          typeof value === 'number' ? value.toFixed(2) : value,
                          name
                        ]}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="trades" name="# of Trades" fill="#8884d8" />
                      <Bar yAxisId="right" dataKey="winRate" name="Win Rate (%)" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    No strategy data available
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Strategy Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {hasStrategiesData ? (
                <Grid container spacing={2}>
                  {analyticsData.strategies.map((strategy) => (
                    <Grid item xs={12} sm={6} md={4} key={strategy.name}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {strategy.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Total Trades
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            {strategy.trades}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Win Rate
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            {formatPercentage(strategy.winRate * 100)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Avg. Return
                          </Typography>
                          <Typography 
                            variant="body1"
                            color={strategy.avgReturn >= 0 ? 'success.main' : 'error.main'}
                          >
                            {formatPercentage(strategy.avgReturn, 2)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Box sx={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    No strategy details available
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Setups Tab */}
      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Setup Performance
              </Typography>
              {hasSetupsData ? (
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.setups}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                      <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                      <Tooltip 
                        formatter={(value, name) => [
                          typeof value === 'number' ? value.toFixed(2) : value,
                          name
                        ]}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="trades" name="# of Trades" fill="#8884d8" />
                      <Bar yAxisId="right" dataKey="winRate" name="Win Rate (%)" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    No setup performance data available
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Setup Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {hasSetupsData ? (
                <Grid container spacing={2}>
                  {analyticsData.setups.map((setup) => (
                    <Grid item xs={12} sm={6} md={4} key={setup.name}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {setup.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Total Trades
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            {setup.trades}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Win Rate
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            {formatPercentage(setup.winRate * 100)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Avg. Return
                          </Typography>
                          <Typography 
                            variant="body1"
                            color={setup.avgReturn >= 0 ? 'success.main' : 'error.main'}
                          >
                            {formatPercentage(setup.avgReturn, 2)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Box sx={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    No setup details available
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default Analytics;
