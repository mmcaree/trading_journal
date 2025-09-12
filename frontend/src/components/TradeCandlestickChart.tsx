import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
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
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
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

interface TradeCandlestickChartProps {
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

// Helper function to calculate Simple Moving Average
const calculateSMA = (data: any[], period: number): any[] => {
  const smaData = [];
  
  // Only calculate SMA if we have enough data points
  if (data.length < period) {
    console.warn(`Not enough data points for SMA${period}: have ${data.length}, need ${period}`);
    return [];
  }
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const smaValue = sum / period;
    
    smaData.push({
      time: data[i].time,
      value: smaValue
    });
  }
  
  console.log(`Calculated SMA${period}: ${smaData.length} points from ${data.length} data points`);
  return smaData;
};

const TradeCandlestickChart: React.FC<TradeCandlestickChartProps> = ({ tradeId }) => {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');
  const [initialized, setInitialized] = useState(false);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const sma10SeriesRef = useRef<any>(null);
  const sma20SeriesRef = useRef<any>(null);

  // Fetch chart data - initial load only
  const fetchChartData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log(`Fetching chart data for trade ID: ${tradeId}`);
      const data = await getTradeChartData(tradeId);
      console.log('Chart data received:', data);
      setChartData(data);
      
      // Auto-select best timeframe only on initial load
      if (data) {
        const entryDate = parseISO(data.entry_date);
        const exitDate = data.exit_date ? parseISO(data.exit_date) : new Date();
        const daysSpan = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        const bestTimeframe = getBestTimeframe(data, daysSpan);
        console.log(`Auto-selecting timeframe: ${bestTimeframe} for ${daysSpan} days span`);
        setSelectedTimeframe(bestTimeframe);
      }
    } catch (err: any) {
      console.error('Error fetching chart data:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  // Refresh function for manual refresh button
  const refreshChartData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log(`Refreshing chart data for trade ID: ${tradeId}`);
      const data = await getTradeChartData(tradeId);
      console.log('Chart data refreshed:', data);
      setChartData(data);
    } catch (err: any) {
      console.error('Error refreshing chart data:', err);
      setError(err.message || 'Failed to refresh chart data');
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  // Reset initialization when tradeId changes
  useEffect(() => {
    setInitialized(false);
    setSelectedTimeframe('');
    setChartData(null);
  }, [tradeId]);

  // Fetch data only when not initialized
  useEffect(() => {
    if (!initialized) {
      console.log(`Fetching data for trade ID: ${tradeId}`);
      fetchChartData();
      setInitialized(true);
    }
  }, [initialized, tradeId]);

  // Get available timeframes
  const availableTimeframes = useMemo(() => {
    if (!chartData) return [];
    return timeframeOptions.filter(option => 
      chartData.timeframes[option.value as keyof typeof chartData.timeframes] &&
      chartData.timeframes[option.value as keyof typeof chartData.timeframes]!.length > 0
    );
  }, [chartData]);

  // Convert our data format to lightweight-charts format
  const prepareChartData = useMemo(() => {
    if (!chartData || !selectedTimeframe || loading) {
      console.log('prepareChartData: not ready', { hasChartData: !!chartData, hasTimeframe: !!selectedTimeframe, loading });
      return null;
    }

    const timeframeData = chartData.timeframes[selectedTimeframe as keyof typeof chartData.timeframes];
    if (!timeframeData || timeframeData.length === 0) {
      console.log(`prepareChartData: no data for timeframe ${selectedTimeframe}`);
      return null;
    }

    console.log(`prepareChartData: processing ${timeframeData.length} data points for ${selectedTimeframe}`);

    // Sort data by timestamp
    const sortedData = [...timeframeData].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Convert to lightweight-charts candlestick format
    const candlestickData = sortedData.map(point => ({
      time: Math.floor(new Date(point.timestamp).getTime() / 1000), // Convert to Unix timestamp
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close
    }));

    // Convert to volume data format
    const volumeData = sortedData.map(point => ({
      time: Math.floor(new Date(point.timestamp).getTime() / 1000),
      value: point.volume
    }));

    // Calculate Simple Moving Averages
    const sma10Data = calculateSMA(candlestickData, 10);
    const sma20Data = calculateSMA(candlestickData, 20);

    console.log(`prepareChartData: prepared ${candlestickData.length} candlestick points, ${volumeData.length} volume points, ${sma10Data.length} SMA10 points, ${sma20Data.length} SMA20 points`);
    return { candlestickData, volumeData, sma10Data, sma20Data };
  }, [chartData, selectedTimeframe, loading]); // Include loading to prevent processing during fetch

  // Create and update chart - only when we have data and selected timeframe
  useEffect(() => {
    // Don't proceed if still loading or missing requirements
    if (loading || !chartContainerRef.current || !prepareChartData || !selectedTimeframe) {
      console.log('Chart creation skipped:', {
        loading,
        hasContainer: !!chartContainerRef.current,
        hasData: !!prepareChartData,
        hasTimeframe: !!selectedTimeframe
      });
      return;
    }

    console.log(`Updating chart with timeframe: ${selectedTimeframe}`);
    console.log('Chart data points:', prepareChartData.candlestickData.length);

    // Ensure we have sufficient data points
    if (prepareChartData.candlestickData.length < 2) {
      console.log('Insufficient data points for chart:', prepareChartData.candlestickData.length);
      setError(`Insufficient data: only ${prepareChartData.candlestickData.length} data points available for ${selectedTimeframe} timeframe`);
      return;
    }

    try {
      // Create chart if it doesn't exist
      if (!chartRef.current) {
        console.log('Creating new chart instance');
        
        // Ensure container has dimensions
        if (chartContainerRef.current.clientWidth === 0) {
          console.log('Container width is 0, setting default width');
          chartContainerRef.current.style.width = '100%';
          chartContainerRef.current.style.minWidth = '600px';
        }

        chartRef.current = createChart(chartContainerRef.current, {
          width: Math.max(chartContainerRef.current.clientWidth, 600),
          height: 500,
          layout: {
            background: { type: ColorType.Solid, color: '#ffffff' },
            textColor: '#333',
          },
          grid: {
            vertLines: { color: '#f0f0f0' },
            horzLines: { color: '#f0f0f0' },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
          },
          rightPriceScale: {
            borderColor: '#cccccc',
          },
          timeScale: {
            borderColor: '#cccccc',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        console.log('Chart created, verifying API methods...');
        console.log('Chart object methods:', Object.getOwnPropertyNames(chartRef.current));
        
        // Verify chart has the required methods
        if (typeof chartRef.current.addCandlestickSeries !== 'function') {
          console.error('Available methods:', Object.getOwnPropertyNames(chartRef.current));
          throw new Error('addCandlestickSeries method not found - lightweight-charts may not be loaded correctly');
        }
        if (typeof chartRef.current.addHistogramSeries !== 'function') {
          console.error('Available methods:', Object.getOwnPropertyNames(chartRef.current));
          throw new Error('addHistogramSeries method not found - lightweight-charts may not be loaded correctly');
        }

        // Add candlestick series
        candlestickSeriesRef.current = chartRef.current.addCandlestickSeries({
          upColor: '#4CAF50',
          downColor: '#f44336',
          borderDownColor: '#f44336',
          borderUpColor: '#4CAF50',
          wickDownColor: '#f44336',
          wickUpColor: '#4CAF50',
        });

        // Add volume series
        volumeSeriesRef.current = chartRef.current.addHistogramSeries({
          color: '#26a69a',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'volume',
        });

        chartRef.current.priceScale('volume').applyOptions({
          scaleMargins: {
            top: 0.7,
            bottom: 0,
          },
        });

        // Add Simple Moving Average lines
        sma10SeriesRef.current = chartRef.current.addLineSeries({
          color: '#FF6B35',
          lineWidth: 2,
          title: 'SMA 10',
        });

        sma20SeriesRef.current = chartRef.current.addLineSeries({
          color: '#004E89',
          lineWidth: 2,
          title: 'SMA 20',
        });

        console.log('Chart created successfully');
      }

      // Update chart data
      if (candlestickSeriesRef.current && volumeSeriesRef.current && sma10SeriesRef.current && sma20SeriesRef.current && prepareChartData) {
        console.log('Setting chart data...');
        candlestickSeriesRef.current.setData(prepareChartData.candlestickData);
        volumeSeriesRef.current.setData(prepareChartData.volumeData);
        
        // Set SMA data (only if we have enough data points)
        if (prepareChartData.sma10Data.length > 0) {
          sma10SeriesRef.current.setData(prepareChartData.sma10Data);
          console.log(`Set SMA10 data: ${prepareChartData.sma10Data.length} points`);
        } else {
          console.log('Skipping SMA10: insufficient data');
          sma10SeriesRef.current.setData([]);
        }
        
        if (prepareChartData.sma20Data.length > 0) {
          sma20SeriesRef.current.setData(prepareChartData.sma20Data);
          console.log(`Set SMA20 data: ${prepareChartData.sma20Data.length} points`);
        } else {
          console.log('Skipping SMA20: insufficient data');
          sma20SeriesRef.current.setData([]);
        }

        // Add trade markers if we have trade info and the trade dates are within the chart data range
        if (chartData?.trade_info && prepareChartData.candlestickData.length > 0) {
          const entryTime = Math.floor(parseISO(chartData.entry_date).getTime() / 1000);
          const exitTime = chartData.exit_date ? Math.floor(parseISO(chartData.exit_date).getTime() / 1000) : null;

          // Get the time range of the chart data
          const chartStartTime = prepareChartData.candlestickData[0].time;
          const chartEndTime = prepareChartData.candlestickData[prepareChartData.candlestickData.length - 1].time;

          const markers = [];

          // Only add entry marker if entry time is within chart data range
          if (entryTime >= chartStartTime && entryTime <= chartEndTime) {
            markers.push({
              time: entryTime,
              position: 'belowBar' as const,
              color: '#4CAF50',
              shape: 'arrowUp' as const,
              text: `Entry: ${formatPrice(chartData.trade_info.entry_price)}`,
            });
            console.log('Added entry marker within chart range');
          } else {
            console.log(`Entry marker outside chart range: ${entryTime} not in [${chartStartTime}, ${chartEndTime}]`);
          }

          // Only add exit marker if exit time is within chart data range
          if (exitTime && chartData.trade_info.exit_price && exitTime >= chartStartTime && exitTime <= chartEndTime) {
            markers.push({
              time: exitTime,
              position: 'aboveBar' as const,
              color: '#f44336',
              shape: 'arrowDown' as const,
              text: `Exit: ${formatPrice(chartData.trade_info.exit_price)}`,
            });
            console.log('Added exit marker within chart range');
          } else if (exitTime) {
            console.log(`Exit marker outside chart range: ${exitTime} not in [${chartStartTime}, ${chartEndTime}]`);
          }

          candlestickSeriesRef.current.setMarkers(markers);
        }

        // Fit content to show all data
        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
            console.log('Chart content fitted');
          }
        }, 100);
      }

      // Handle resize
      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          const newWidth = Math.max(chartContainerRef.current.clientWidth, 600);
          chartRef.current.applyOptions({
            width: newWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } catch (error) {
      console.error('Error creating/updating chart:', error);
      setError(`Chart rendering error: ${error}`);
    }
  }, [prepareChartData, selectedTimeframe, loading]); // Include loading to prevent premature rendering

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        sma10SeriesRef.current = null;
        sma20SeriesRef.current = null;
      }
    };
  }, []);

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

  if (loading && !chartData) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Fetching chart data for {tradeId ? `trade ${tradeId}` : 'trade'}...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (loading && chartData) {
    // Show chart with loading overlay if we have partial data
    return (
      <Card>
        <CardContent>
          <Box position="relative">
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              Candlestick Chart - {chartData.ticker} (Loading...)
            </Typography>
            <Box sx={{ width: '100%', height: 500, mb: 2, position: 'relative', minWidth: '600px' }}>
              <Box 
                sx={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  zIndex: 10,
                  borderRadius: '4px'
                }}
              >
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading chart data...</Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Button onClick={refreshChartData} variant="outlined">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!chartData) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            No chart data available for this trade.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!selectedTimeframe || availableTimeframes.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            No chart timeframes available for this ticker. The stock may be too new or not actively traded.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Ticker: {chartData?.ticker || 'Unknown'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Available timeframes: {chartData ? Object.keys(chartData.timeframes).join(', ') : 'None'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Check if we have sufficient data for the selected timeframe
  if (!prepareChartData || prepareChartData.candlestickData.length < 2) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Insufficient chart data for timeframe "{selectedTimeframe}". 
            {prepareChartData ? `Only ${prepareChartData.candlestickData.length} data points available.` : 'No data points available.'}
          </Alert>
          {availableTimeframes.length > 1 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>Try a different timeframe:</Typography>
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
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Ticker: {chartData?.ticker}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" component="h2">
            Candlestick Chart - {chartData.ticker}
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
            <IconButton onClick={refreshChartData} size="small">
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Trade Info - Same as before */}
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

        {/* Candlestick Chart Container */}
        <Box sx={{ width: '100%', height: 500, mb: 2, position: 'relative', minWidth: '600px' }}>
          <div 
            ref={chartContainerRef} 
            style={{ 
              width: '100%', 
              height: '100%',
              minWidth: '600px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }} 
          />
          {loading && (
            <Box 
              sx={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.8)',
                zIndex: 1
              }}
            >
              <CircularProgress />
            </Box>
          )}
        </Box>

        {/* Available Timeframes Info */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Available timeframes: {availableTimeframes.map(tf => tf.label).join(', ')}
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Box sx={{ 
                width: 16, 
                height: 2, 
                backgroundColor: prepareChartData?.sma10Data?.length > 0 ? '#FF6B35' : '#ccc' 
              }} />
              <Typography 
                variant="caption" 
                color={prepareChartData?.sma10Data?.length > 0 ? 'text.secondary' : 'text.disabled'}
              >
                SMA 10 {prepareChartData?.sma10Data?.length > 0 ? `(${prepareChartData.sma10Data.length})` : '(insufficient data)'}
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box sx={{ 
                width: 16, 
                height: 2, 
                backgroundColor: prepareChartData?.sma20Data?.length > 0 ? '#004E89' : '#ccc' 
              }} />
              <Typography 
                variant="caption" 
                color={prepareChartData?.sma20Data?.length > 0 ? 'text.secondary' : 'text.disabled'}
              >
                SMA 20 {prepareChartData?.sma20Data?.length > 0 ? `(${prepareChartData.sma20Data.length})` : '(insufficient data)'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TradeCandlestickChart;