import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Grid,
  Paper,
  Tooltip,
  IconButton
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  TimeScale,
  ChartOptions,
  TooltipItem,
  Plugin
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { parseISO, format } from 'date-fns';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import {
  getTradeChartData,
  ChartData,
  ChartDataPoint,
  formatPrice,
  formatVolume,
  getBestTimeframe
} from '../services/chartService';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  TimeScale
);

interface TradeChartProps {
  tradeId: number;
}

interface TimeframeOption {
  value: string;
  label: string;
  description: string;
}

const timeframeOptions: TimeframeOption[] = [
  { value: '1d', label: '1D', description: 'Daily' },
  { value: '1h', label: '1H', description: 'Hourly' },
  { value: '5m', label: '5M', description: '5 Minutes' },
  { value: '1m', label: '1M', description: '1 Minute' }
];

const TradeChart: React.FC<TradeChartProps> = ({ tradeId }) => {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');

  // Fetch chart data
  const fetchChartData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTradeChartData(tradeId);
      setChartData(data);
      
      // Auto-select best timeframe if not already selected
      if (!selectedTimeframe && data) {
        const entryDate = parseISO(data.entry_date);
        const exitDate = data.exit_date ? parseISO(data.exit_date) : new Date();
        const daysSpan = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        const bestTimeframe = getBestTimeframe(data, daysSpan);
        setSelectedTimeframe(bestTimeframe);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();
  }, [tradeId]);

  // Get available timeframes
  const availableTimeframes = useMemo(() => {
    if (!chartData) return [];
    return timeframeOptions.filter(option => 
      chartData.timeframes[option.value as keyof typeof chartData.timeframes] &&
      chartData.timeframes[option.value as keyof typeof chartData.timeframes]!.length > 0
    );
  }, [chartData]);

  // Prepare chart data for Chart.js
  const preparedChartData = useMemo(() => {
    if (!chartData || !selectedTimeframe) return null;

    const timeframeData = chartData.timeframes[selectedTimeframe as keyof typeof chartData.timeframes];
    if (!timeframeData || timeframeData.length === 0) return null;

    // Sort data by timestamp
    const sortedData = [...timeframeData].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Create line chart data (using closing prices)
    const labels = sortedData.map(point => point.timestamp);
    const prices = sortedData.map(point => point.close);

    // Create marker points for entry/exit
    const entryPoint = chartData.trade_info?.entry_price;
    const exitPoint = chartData.trade_info?.exit_price;
    const entryDate = parseISO(chartData.entry_date);
    const exitDate = chartData.exit_date ? parseISO(chartData.exit_date) : null;

    // Find closest data points to entry/exit dates
    let entryIndex = -1;
    let exitIndex = -1;

    if (entryPoint) {
      entryIndex = sortedData.findIndex(point => 
        new Date(point.timestamp).getTime() >= entryDate.getTime()
      );
      if (entryIndex === -1) entryIndex = 0;
    }

    if (exitPoint && exitDate) {
      exitIndex = sortedData.findIndex(point => 
        new Date(point.timestamp).getTime() >= exitDate.getTime()
      );
      if (exitIndex === -1) exitIndex = sortedData.length - 1;
    }

    return {
      labels,
      datasets: [
        {
          label: `${chartData.ticker} Price`,
          data: prices,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        // Entry marker
        ...(entryPoint && entryIndex >= 0 ? [{
          label: 'Entry',
          data: labels.map((_, index) => index === entryIndex ? entryPoint : null),
          borderColor: 'green',
          backgroundColor: 'green',
          borderWidth: 3,
          pointRadius: 8,
          pointHoverRadius: 10,
          showLine: false,
          pointStyle: 'triangle',
        }] : []),
        // Exit marker
        ...(exitPoint && exitIndex >= 0 ? [{
          label: 'Exit',
          data: labels.map((_, index) => index === exitIndex ? exitPoint : null),
          borderColor: 'red',
          backgroundColor: 'red',
          borderWidth: 3,
          pointRadius: 8,
          pointHoverRadius: 10,
          showLine: false,
          pointStyle: 'triangle',
        }] : []),
      ]
    };
  }, [chartData, selectedTimeframe]);

  // Chart options
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            minute: 'HH:mm',
            hour: 'MMM dd HH:mm',
            day: 'MMM dd',
          },
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Price ($)'
        },
        ticks: {
          callback: function(value) {
            return formatPrice(Number(value));
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `${chartData?.ticker || 'Stock'} Price Chart - ${selectedTimeframe?.toUpperCase()}`
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            const value = context.parsed.y;
            if (context.dataset.label === 'Entry' || context.dataset.label === 'Exit') {
              return `${context.dataset.label}: ${formatPrice(value)}`;
            }
            return `Price: ${formatPrice(value)}`;
          }
        }
      }
    }
  };

  // Calculate trade metrics
  const tradeMetrics = useMemo(() => {
    if (!chartData?.trade_info) return null;

    const { entry_price, exit_price, position_size, trade_type } = chartData.trade_info;
    
    if (!exit_price) return null;

    const isLong = trade_type.toLowerCase() === 'long';
    const pnl = isLong 
      ? (exit_price - entry_price) * position_size
      : (entry_price - exit_price) * position_size;
    
    const pnlPercent = isLong
      ? ((exit_price - entry_price) / entry_price) * 100
      : ((entry_price - exit_price) / entry_price) * 100;

    return {
      pnl,
      pnlPercent,
      isProfit: pnl > 0
    };
  }, [chartData]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!chartData) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        No chart data available for this trade.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" component="h2">
            Stock Chart - {chartData.ticker}
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Timeframe</InputLabel>
              <Select
                value={selectedTimeframe}
                label="Timeframe"
                onChange={(e) => setSelectedTimeframe(e.target.value)}
              >
                {availableTimeframes.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Tooltip title={option.description} placement="top">
                      <span>{option.label}</span>
                    </Tooltip>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton onClick={fetchChartData} size="small">
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Trade Info */}
        {chartData.trade_info && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Trade Information
                </Typography>
                <Box display="flex" flexDirection="column" gap={1}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">Type:</Typography>
                    <Chip 
                      label={chartData.trade_info.trade_type.toUpperCase()} 
                      size="small"
                      color={chartData.trade_info.trade_type.toLowerCase() === 'long' ? 'success' : 'error'}
                    />
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">Entry Price:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {formatPrice(chartData.trade_info.entry_price)}
                    </Typography>
                  </Box>
                  {chartData.trade_info.exit_price && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">Exit Price:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {formatPrice(chartData.trade_info.exit_price)}
                      </Typography>
                    </Box>
                  )}
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">Position Size:</Typography>
                    <Typography variant="body2">
                      {chartData.trade_info.position_size} shares
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">Status:</Typography>
                    <Chip 
                      label={chartData.trade_info.status.toUpperCase()} 
                      size="small"
                      color={chartData.trade_info.status.toLowerCase() === 'closed' ? 'default' : 'primary'}
                    />
                  </Box>
                </Box>
              </Paper>
            </Grid>

            {/* P&L Info */}
            {tradeMetrics && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Performance
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">P&L:</Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        {tradeMetrics.isProfit ? (
                          <TrendingUpIcon color="success" fontSize="small" />
                        ) : (
                          <TrendingDownIcon color="error" fontSize="small" />
                        )}
                        <Typography 
                          variant="body2" 
                          fontWeight="bold"
                          color={tradeMetrics.isProfit ? 'success.main' : 'error.main'}
                        >
                          {formatPrice(tradeMetrics.pnl)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">Return:</Typography>
                      <Typography 
                        variant="body2" 
                        fontWeight="bold"
                        color={tradeMetrics.isProfit ? 'success.main' : 'error.main'}
                      >
                        {tradeMetrics.pnlPercent.toFixed(2)}%
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        )}

        {/* Chart */}
        {preparedChartData && (
          <Box sx={{ height: 500, width: '100%' }}>
            <Line data={preparedChartData} options={chartOptions} />
          </Box>
        )}

        {/* Available Timeframes Info */}
        <Box mt={2}>
          <Typography variant="caption" color="text.secondary">
            Available timeframes: {availableTimeframes.map(tf => tf.label).join(', ')}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TradeChart;