import React, { useState, useEffect, useMemo } from 'react';
import InstructorNotesSection from './InstructorNotesSection';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Card,
  CardContent,
  Avatar,
  LinearProgress,
  Alert,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
// Commenting out Timeline for now to avoid version conflicts
// import {
//   Timeline,
//   TimelineItem,
//   TimelineSeparator,
//   TimelineConnector,
//   TimelineContent,
//   TimelineDot
// } from '@mui/lab';
import {
  TrendingUp as BuyIcon,
  TrendingDown as SellIcon,
  Assessment as AnalyticsIcon,
  History as HistoryIcon,
  PieChart as MetricsIcon,
  Close as CloseIcon,
  Download as ExportIcon,
  Refresh as RefreshIcon,
  Notes as NotesIcon,
  PhotoCamera as PhotoIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Timeline as ChartIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import BaseModal from './BaseModal';
import { Position, PositionDetails, PositionEvent, getPositionDetails, getLifetimeTickerAnalytics, LifetimeTickerAnalytics } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { accountService } from '../services/accountService';
import EventBreakdown from './EventBreakdown';
import { positionImageService, PositionChart } from '../services/positionImageService';
import { SmartJournal } from './SmartJournal';
import ErrorBoundary from './ErrorBoundary';
import EditPositionModal from './EditPositionModal';
import EditEventModal from './EditEventModal';
import { usePrefetch, POSITION_DETAILS_KEY, LIFETIME_ANALYTICS_KEY, CACHE_TTL } from '../hooks/usePrefetch';
import { useQuery } from '@tanstack/react-query';

export interface PositionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  position: Position;
  onRefresh?: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`position-details-tabpanel-${index}`}
      aria-labelledby={`position-details-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
};

const CHART_COLORS = ['#1da0f0', '#4caf50', '#f44336', '#ff9800', '#9c27b0', '#607d8b'];

const PositionDetailsModal: React.FC<PositionDetailsModalProps> = ({
  open,
  onClose,
  position,
  onRefresh
}) => {

  const { prefetchRelatedPositions } = usePrefetch();
  useEffect(() => {
    if (open && position) {
      prefetchRelatedPositions(position);
    }
  }, [open, position, prefetchRelatedPositions]);
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  
  // Memoize account balance to prevent unnecessary calls on every render
  const accountBalance = useMemo(() => accountService.getCurrentBalance(), []);
  
  // Notes & Journal tab state
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Chart viewing state  
  const [chartDialog, setChartDialog] = useState(false);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [selectedChartInfo, setSelectedChartInfo] = useState<PositionChart | null>(null);
  
  // Edit modals state
  const [editPositionModalOpen, setEditPositionModalOpen] = useState(false);
  const [editEventModalOpen, setEditEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PositionEvent | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const { 
    data: positionDetails, 
    isLoading: loadingDetails,
    refetch: refetchDetails 
  } = useQuery({
    queryKey: [POSITION_DETAILS_KEY, position.id],
    queryFn: () => getPositionDetails(position.id),
    enabled: open,
    staleTime: CACHE_TTL.POSITION_DETAILS_STALE,
    gcTime: CACHE_TTL.POSITION_DETAILS_GC,
  });

  const { 
    data: lifetimeAnalytics,
    isLoading: loadingAnalytics 
  } = useQuery({
    queryKey: [LIFETIME_ANALYTICS_KEY, position.ticker],
    queryFn: () => getLifetimeTickerAnalytics(position.ticker),
    enabled: open,
    staleTime: CACHE_TTL.LIFETIME_ANALYTICS_STALE,
    gcTime: CACHE_TTL.LIFETIME_ANALYTICS_GC,
  });

  const { 
    data: charts = [],
    refetch: refetchCharts 
  } = useQuery({
    queryKey: ['position-charts', position.id],
    queryFn: async () => {
      const response = await positionImageService.getPositionCharts(position.id);
      return response.charts;
    },
    enabled: open && activeTab === 3,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

const loading = loadingDetails || loadingAnalytics;

  const [error, setError] = useState<string | null>(null);


  const handleRefresh = async () => {
    await Promise.all([
      refetchDetails(),
      refetchCharts(),
    ]);
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
    // Clear the input
    event.target.value = '';
  };

  const uploadImageFile = async (file: File) => {
    try {
      setUploadingImage(true);
      
      // Upload the image
      const uploadResponse = await positionImageService.uploadImage(file);
      
      // Add the chart to the position
      await positionImageService.addPositionChart(
        position.id,
        uploadResponse.image_url,
        `Chart uploaded on ${new Date().toLocaleDateString()}`,
        'User Upload'
      );
      
      // Reload charts
      await refetchCharts();
      
    } catch (err: any) {
      console.error('Failed to upload image:', err);
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await uploadImageFile(file);
        }
        break;
      }
    }
  };

  const handleDeleteChart = async (chartId: number) => {
    try {
      await positionImageService.deleteChart(chartId);
      
      // Reload charts
      await refetchCharts();
      
    } catch (err: any) {
      console.error('Failed to delete chart:', err);
      setError(err.message || 'Failed to delete chart');
    }
  };

  const handleViewChart = (chartUrl: string, chartInfo?: PositionChart) => {
    console.log('handleViewChart called:', chartUrl, chartInfo);
    setSelectedChart(chartUrl);
    setSelectedChartInfo(chartInfo || null);
    setChartDialog(true);
  };

  // Edit modal handlers
  const handleEditPosition = () => {
    setEditPositionModalOpen(true);
  };

  const handleEditEvent = (event: PositionEvent) => {
    setSelectedEvent(event);
    setEditEventModalOpen(true);
  };

  const handleEditPositionSuccess = (updatedPosition: Position) => {
    refetchDetails();
    onRefresh?.();
    setEditPositionModalOpen(false);
  };

  const handleEditEventSuccess = (updatedEvent: PositionEvent) => {
    refetchDetails();
    onRefresh?.();
    setEditEventModalOpen(false);
    setSelectedEvent(null);
  };

  const handleUpdateEventStopLoss = async (eventId: number, newStopLoss: number | null) => {
    try {
      const { updatePositionEvent } = await import('../services/positionsService');
      
      // Update ORIGINAL stop loss for risk calculation (not current stop loss)
      await updatePositionEvent(eventId, {
        original_stop_loss: newStopLoss
      });
      
      await refetchDetails();
      
    } catch (err: any) {
      console.error('Failed to update event original stop loss:', err);
      setError(err.message || 'Failed to update original stop loss');
    }
};

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Prepare chart data
  const prepareEquityCurveData = () => {
    if (!positionDetails?.events) return [];
    
    let cumulativeShares = 0;
    let cumulativeCostBasis = 0; // Cost basis of remaining shares
    let totalInvestment = 0; // Total money put into the position
    let realizedPnL = 0;
    
    // Process all events first to get running totals
    const eventsByDate: { [date: string]: any[] } = {};
    
    positionDetails.events.forEach((event) => {
      const dateStr = new Date(event.event_date).toLocaleDateString();
      if (!eventsByDate[dateStr]) {
        eventsByDate[dateStr] = [];
      }
      eventsByDate[dateStr].push(event);
    });
    
    // Sort dates chronologically
    const sortedDates = Object.keys(eventsByDate).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );
    
    // Create one data point per day with end-of-day values
    return sortedDates.map(dateStr => {
      const dayEvents = eventsByDate[dateStr];
      
      // Process all events for this day
      let endOfDayPrice = 0;
      dayEvents.forEach(event => {
        if (event.event_type === 'buy') {
          cumulativeShares += event.shares;
          const buyValue = event.shares * event.price;
          cumulativeCostBasis += buyValue;
          totalInvestment += buyValue; // Track total money invested
        } else {
          const soldShares = Math.abs(event.shares);
          const avgCostBasis = cumulativeShares > 0 ? cumulativeCostBasis / cumulativeShares : 0;
          const eventPnL = (event.price - avgCostBasis) * soldShares;
          realizedPnL += eventPnL;
          
          cumulativeShares -= soldShares;
          cumulativeCostBasis = cumulativeShares * avgCostBasis;
          // Note: totalInvestment doesn't decrease on sells - it shows cumulative investment
        }
        endOfDayPrice = event.price; // Use last price of the day
      });
      
      const currentValue = cumulativeShares * endOfDayPrice;
      
      return {
        date: dateStr,
        shares: cumulativeShares,
        cost: totalInvestment, // Total money invested in the position over time
        value: currentValue,
        realizedPnL: realizedPnL,
        price: endOfDayPrice,
        eventsCount: dayEvents.length // Show how many events happened that day
      };
    });
  };

  const prepareVolumeData = () => {
    if (!positionDetails?.events) return [];
    
    // Group events by date
    const volumeByDate: { [date: string]: { buyVolume: number; sellVolume: number; totalValue: number; avgPrice: number } } = {};
    
    positionDetails.events.forEach((event) => {
      const dateStr = new Date(event.event_date).toLocaleDateString();
      if (!volumeByDate[dateStr]) {
        volumeByDate[dateStr] = { buyVolume: 0, sellVolume: 0, totalValue: 0, avgPrice: 0 };
      }
      
      const volume = Math.abs(event.shares);
      const value = volume * event.price;
      
      if (event.event_type === 'buy') {
        volumeByDate[dateStr].buyVolume += volume;
      } else {
        volumeByDate[dateStr].sellVolume += volume;
      }
      
      volumeByDate[dateStr].totalValue += value;
      volumeByDate[dateStr].avgPrice = event.price; // Use last price of the day
    });
    
    // Sort dates chronologically and convert to array
    return Object.keys(volumeByDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(dateStr => ({
        date: dateStr,
        buyVolume: volumeByDate[dateStr].buyVolume,
        sellVolume: volumeByDate[dateStr].sellVolume,
        totalVolume: volumeByDate[dateStr].buyVolume + volumeByDate[dateStr].sellVolume,
        value: volumeByDate[dateStr].totalValue,
        avgPrice: volumeByDate[dateStr].avgPrice
      }));
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'buy':
        return <BuyIcon sx={{ color: 'success.main' }} />;
      case 'sell':
        return <SellIcon sx={{ color: 'error.main' }} />;
      default:
        return <AnalyticsIcon />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'buy':
        return 'success';
      case 'sell':
        return 'error';
      default:
        return 'info';
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const calculateMetrics = () => {
    if (!positionDetails) return null;
    
    const { position, events, metrics } = positionDetails;
    
    // Fix total invested calculation - should be dollar amount, not share count
    const totalBoughtShares = Math.abs(metrics?.total_bought || 0);
    const totalInvested = totalBoughtShares * (position.avg_entry_price || 0);
    const totalRealized = metrics?.total_sold || 0;
    
    // Fix current value calculation - for open positions, we need current market price
    // For now, use entry price but this should eventually use real-time prices
    const currentValue = (position.current_shares || 0) * (position.avg_entry_price || 0);
    
    // Fix total value calculation - handle null realized PnL
    const realizedPnL = position.total_realized_pnl || 0;
    const totalValue = currentValue + realizedPnL;
    
    // Win rate for sells - moved up to use in current return calculation
    const sellEvents = events.filter(e => e.event_type === 'sell');
    
    // Calculate current return using the SAME METHOD as the chart
    // This ensures the numbers match exactly
    let chartRealizedPnL = 0;
    let chartTotalInvestment = 0;
    let chartCumulativeShares = 0;
    let chartCumulativeCostBasis = 0;
    
    // Process events in chronological order (same as chart)
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
    
    sortedEvents.forEach(event => {
      if (event.event_type === 'buy') {
        chartCumulativeShares += event.shares;
        const buyValue = event.shares * event.price;
        chartCumulativeCostBasis += buyValue;
        chartTotalInvestment += buyValue;
      } else {
        const soldShares = Math.abs(event.shares);
        const avgCostBasis = chartCumulativeShares > 0 ? chartCumulativeCostBasis / chartCumulativeShares : 0;
        const eventPnL = (event.price - avgCostBasis) * soldShares;
        chartRealizedPnL += eventPnL;
        
        chartCumulativeShares -= soldShares;
        chartCumulativeCostBasis = chartCumulativeShares * avgCostBasis;
      }
    });
    
    const currentReturnDollar = chartRealizedPnL;
    
    // For percentage, calculate against the cost basis of sold shares (not total investment)
    let totalCostBasisOfSoldShares = 0;
    let tempCumulativeShares = 0;
    let tempCumulativeCostBasis = 0;
    
    sortedEvents.forEach(event => {
      if (event.event_type === 'buy') {
        tempCumulativeShares += event.shares;
        tempCumulativeCostBasis += event.shares * event.price;
      } else {
        const soldShares = Math.abs(event.shares);
        const avgCostBasis = tempCumulativeShares > 0 ? tempCumulativeCostBasis / tempCumulativeShares : 0;
        totalCostBasisOfSoldShares += avgCostBasis * soldShares;
        
        tempCumulativeShares -= soldShares;
        tempCumulativeCostBasis = tempCumulativeShares * avgCostBasis;
      }
    });
    
    const currentReturnPercent = totalCostBasisOfSoldShares > 0 && chartRealizedPnL !== 0
      ? (chartRealizedPnL / totalCostBasisOfSoldShares) * 100 
      : null;
    
    // Fix days held calculation - use closed_at for closed positions, current date for open positions
    const daysHeld = position.opened_at ? 
      Math.max(0, Math.floor((
        (position.status === 'closed' && position.closed_at ? 
          new Date(position.closed_at).getTime() : 
          new Date().getTime()) - new Date(position.opened_at).getTime()
      ) / (1000 * 60 * 60 * 24))) : 0;
    
    // Win rate calculation
    const profitableSells = sellEvents.filter(e => (e.realized_pnl || 0) > 0);
    const winRate = sellEvents.length > 0 ? (profitableSells.length / sellEvents.length) * 100 : 0;
    
    return {
      totalInvested,
      totalRealized,
      currentValue,
      totalValue,
      currentReturnDollar,
      currentReturnPercent,
      daysHeld,
      winRate,
      averageHoldTime: daysHeld / Math.max(events.length, 1),
      totalEvents: events.length
    };
  };

  // Calculate correct current shares from events
  const calculateCurrentShares = () => {
    if (!positionDetails?.events) return position.current_shares || 0;
    
    return positionDetails.events.reduce((total, event) => {
      return event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares);
    }, 0);
  };

  const correctCurrentShares = calculateCurrentShares();
  const calculatedMetrics = calculateMetrics();
  const equityCurveData = prepareEquityCurveData();
  const volumeData = prepareVolumeData();

  return (
    <>
      <BaseModal
        open={open}
        onClose={onClose}
        title={`${position.ticker} - Position Analysis`}
        loading={loading}
        error={error}
        maxWidth="lg"
        actions={
          <>
            <Button 
              onClick={handleRefresh}
              disabled={loading}
              startIcon={<RefreshIcon />}
              color="inherit"
            >
              Refresh
            </Button>
            <Button
              onClick={() => {/* TODO: Export functionality */}}
              disabled={loading}
              startIcon={<ExportIcon />}
              color="inherit"
            >
              Export
            </Button>
            <Button 
              onClick={onClose}
              disabled={loading}
              variant="contained"
            >
              Close
            </Button>
          </>
        }
      >
      <Box sx={{ width: '100%' }}>
        
        {/* Header Summary */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center', position: 'relative' }}>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <Tooltip title="Edit Position">
                    <IconButton size="small" onClick={handleEditPosition}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.main', mx: 'auto', mb: 1 }}>
                  {position.ticker.charAt(0)}
                </Avatar>
                <Typography variant="h6">{position.ticker}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {position.strategy || 'No Strategy'}
                </Typography>
                <Chip 
                  label={position.status} 
                  color={position.status === 'open' ? 'success' : 'default'}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={9}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  📊 Position Metrics
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Current Shares</Typography>
                    <Typography variant="h6">{correctCurrentShares}</Typography>
                    {correctCurrentShares !== position.current_shares && (
                      <Typography variant="caption" color="warning.main">
                        (DB: {position.current_shares})
                      </Typography>
                    )}
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Avg Entry</Typography>
                    <Typography variant="h6">{formatCurrency(position.avg_entry_price || 0)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Current Return</Typography>
                    <Typography 
                      variant="h6"
                      sx={{ 
                        color: (calculatedMetrics?.currentReturnPercent !== null && calculatedMetrics?.currentReturnPercent !== undefined)
                          ? (calculatedMetrics.currentReturnPercent >= 0 ? 'success.main' : 'error.main')
                          : 'text.secondary'
                      }}
                    >
                      {(calculatedMetrics?.currentReturnPercent !== null && calculatedMetrics?.currentReturnPercent !== undefined)
                        ? `${formatCurrency(calculatedMetrics.currentReturnDollar)} (${calculatedMetrics.currentReturnPercent.toFixed(2)}%)`
                        : 'No Sales Yet'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Days Held</Typography>
                    <Typography variant="h6">{calculatedMetrics?.daysHeld || 0}</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab 
              label="📈 Analytics" 
              icon={<AnalyticsIcon />} 
              iconPosition="start" 
            />
            <Tab 
              label="📋 History" 
              icon={<HistoryIcon />} 
              iconPosition="start" 
            />
            <Tab 
              label="📊 Metrics" 
              icon={<MetricsIcon />} 
              iconPosition="start" 
            />
            <Tab 
              label="📝 Notes & Journal" 
              icon={<NotesIcon />} 
              iconPosition="start" 
            />
          </Tabs>
        </Box>

        {/* Analytics Tab */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            
            {/* Equity Curve Chart */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📈 Investment & Realized P&L Timeline
                </Typography>
                <Box sx={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <AreaChart data={equityCurveData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip 
                        formatter={(value, name) => [
                          typeof value === 'number' ? formatCurrency(value) : value,
                          name
                        ]}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="cost" 
                        stroke="#4caf50" 
                        fill="#4caf50" 
                        fillOpacity={0.3}
                        name="Cost Basis"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="realizedPnL" 
                        stroke="#1da0f0" 
                        fill="#1da0f0" 
                        fillOpacity={0.3}
                        name="Realized P&L"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>

            {/* Volume Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📊 Daily Trading Volume
                </Typography>
                <Box sx={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip 
                        formatter={(value, name) => [
                          name === 'value' ? formatCurrency(value as number) : value,
                          name === 'buyVolume' ? 'Buy Volume' : 
                          name === 'sellVolume' ? 'Sell Volume' : 
                          name === 'totalVolume' ? 'Total Volume' : name
                        ]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="buyVolume" 
                        stackId="a"
                        fill="#4caf50"
                        name="Buy Volume"
                      />
                      <Bar 
                        dataKey="sellVolume" 
                        stackId="a"
                        fill="#f44336"
                        name="Sell Volume"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>

              {/* Lifetime Ticker Analytics */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    🎯 {position.ticker} Lifetime Historical Data
                  </Typography>
                  {lifetimeAnalytics ? (
                    <Grid container spacing={2}>
                      {/* Core Performance Row 1 */}
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Lifetime Win Rate</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={lifetimeAnalytics.lifetimeWinRate}
                            sx={{ width: '100%', mr: 1 }}
                          />
                          <Typography variant="body2">
                            {lifetimeAnalytics.lifetimeWinRate.toFixed(0)}%
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Total Positions</Typography>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                          {lifetimeAnalytics.totalPositions}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({lifetimeAnalytics.openPositionsCount} open, {lifetimeAnalytics.closedPositionsCount} closed)
                        </Typography>
                      </Grid>
                      
                      {/* Core Performance Row 2 */}
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Lifetime P&L</Typography>
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            color: lifetimeAnalytics.lifetimePnL >= 0 ? 'success.main' : 'error.main',
                            mt: 1 
                          }}
                        >
                          {formatCurrency(lifetimeAnalytics.lifetimePnL)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Avg Return/Position</Typography>
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            color: lifetimeAnalytics.averageReturnPerPosition >= 0 ? 'success.main' : 'error.main',
                            mt: 1 
                          }}
                        >
                          {lifetimeAnalytics.averageReturnPerPosition.toFixed(1)}%
                        </Typography>
                      </Grid>
                      
                      {/* Additional Metrics Row */}
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Avg Days Held</Typography>
                        <Typography variant="body1" sx={{ mt: 1 }}>
                          {lifetimeAnalytics.averageDaysHeld.toFixed(0)} days
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Total Volume</Typography>
                        <Typography variant="body1" sx={{ mt: 1 }}>
                          {formatCurrency(lifetimeAnalytics.totalVolumeTraded)}
                        </Typography>
                      </Grid>
                      
                      {/* Best/Worst Positions */}
                      {(lifetimeAnalytics.bestPosition || lifetimeAnalytics.worstPosition) && (
                        <>
                          <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                          </Grid>
                          {lifetimeAnalytics.bestPosition && (
                            <Grid item xs={6}>
                              <Typography variant="body2" color="success.main">Best Position</Typography>
                              <Typography variant="body1" sx={{ mt: 0.5 }}>
                                {formatCurrency(lifetimeAnalytics.bestPosition.pnl)} • {lifetimeAnalytics.bestPosition.daysHeld}d
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                +{lifetimeAnalytics.bestPosition.returnPercent.toFixed(1)}%
                              </Typography>
                            </Grid>
                          )}
                          {lifetimeAnalytics.worstPosition && (
                            <Grid item xs={6}>
                              <Typography variant="body2" color="error.main">Worst Position</Typography>
                              <Typography variant="body1" sx={{ mt: 0.5 }}>
                                {formatCurrency(lifetimeAnalytics.worstPosition.pnl)} • {lifetimeAnalytics.worstPosition.daysHeld}d
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {lifetimeAnalytics.worstPosition.returnPercent.toFixed(1)}%
                              </Typography>
                            </Grid>
                          )}
                        </>
                      )}
                    </Grid>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                      <CircularProgress size={24} sx={{ mr: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        Loading lifetime analytics...
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Grid>
          </Grid>
        </TabPanel>

        {/* History Tab */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={3}>
            
            {/* Event Timeline */}
            <Grid item xs={12}>
              <EventBreakdown 
                position={position}
                events={positionDetails?.events || []}
                onUpdateStopLoss={handleUpdateEventStopLoss}
                onEditEvent={handleEditEvent}
                onRefreshPosition={refetchDetails}
                disabled={loading}
                accountBalance={accountBalance}
              />
            </Grid>
            
          </Grid>
        </TabPanel>

        {/* Metrics Tab */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={3}>
            
            {/* Risk Metrics */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  ⚡ Risk Analysis
                </Typography>

                {position.original_risk_percent != null ? (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Original Risk at Entry
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {position.original_risk_percent.toFixed(2)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Based on account value of{' '}
                      <strong>{formatCurrency(position.account_value_at_entry || 0)}</strong>
                      {' '}on {new Date(position.opened_at).toLocaleDateString()}
                    </Typography>

                    {position.status === 'open' && position.current_shares > 0 && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Current position value:{' '}
                          {formatCurrency((position.current_shares || 0) * (position.avg_entry_price || 0))}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          Current risk (today):{' '}
                          <strong>
                            {((position.current_shares || 0) * (position.avg_entry_price || 0) / accountBalance * 100).toFixed(2)}%
                          </strong>{' '}
                          of current ${formatCurrency(accountBalance)} account
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Original risk not recorded (position opened before risk tracking was enabled)
                  </Alert>
                )}

                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12}>
                    <Alert severity={position.current_stop_loss ? 'success' : 'warning'}>
                      {position.current_stop_loss
                        ? `Active Stop Loss: ${formatCurrency(position.current_stop_loss)}`
                        : 'No Active Stop Loss'}
                    </Alert>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity={position.current_take_profit ? 'info' : 'info'}>
                      {position.current_take_profit
                        ? `Take Profit Target: ${formatCurrency(position.current_take_profit)}`
                        : 'No Take Profit Set'}
                    </Alert>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Position Health */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  🏥 Position Health
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Status</Typography>
                    <Chip 
                      label={position.status.toUpperCase()} 
                      color={position.status === 'open' ? 'success' : 'default'}
                      sx={{ mt: 1 }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Events</Typography>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {positionDetails?.events.length || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Notes</Typography>
                    <Typography variant="body1" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {positionDetails?.position.notes || 'No notes available'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Strategy Performance Analytics */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  🎯 {position.ticker} Strategy Performance
                </Typography>
                {lifetimeAnalytics?.successByStrategy && lifetimeAnalytics.successByStrategy.length > 0 ? (
                  <List dense>
                    {lifetimeAnalytics.successByStrategy.map((strategy, index) => (
                      <ListItem key={strategy.strategy} sx={{ px: 0 }}>
                        <ListItemIcon>
                          <Avatar 
                            sx={{ 
                              width: 32, 
                              height: 32, 
                              bgcolor: strategy.winRate >= 50 ? 'success.main' : 'error.main',
                              fontSize: '0.75rem'
                            }}
                          >
                            {strategy.winRate.toFixed(0)}%
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={strategy.strategy}
                          secondary={`${strategy.positionsCount} positions • Avg: ${strategy.avgReturn.toFixed(1)}%`}
                        />
                        <Box sx={{ minWidth: 40 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(strategy.winRate, 100)}
                            sx={{ width: 60, mr: 1 }}
                          />
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    {lifetimeAnalytics ? 'No closed positions to analyze strategies' : 'Loading strategy data...'}
                  </Typography>
                )}
              </Paper>
            </Grid>

            {/* Risk-Adjusted Analytics */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  🛡️ Risk Analytics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Tooltip title="Measures return per unit of risk (volatility). Calculated as Average Return / Standard Deviation of returns. Higher values indicate better risk-adjusted performance. Similar to Sharpe Ratio but without risk-free rate.">
                      <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                        Risk-Adjusted Return ℹ️
                      </Typography>
                    </Tooltip>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {lifetimeAnalytics?.riskAdjustedReturn?.toFixed(2) || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Return per unit of volatility (Avg Return / Std Dev)
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Summary Statistics */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📈 Current Position Summary
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Bought</Typography>
                    <Typography variant="h6" sx={{ color: 'info.main' }}>
                      {positionDetails?.metrics?.total_bought || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Sold</Typography>
                    <Typography variant="h6" sx={{ color: 'warning.main' }}>
                      {positionDetails?.metrics?.total_sold || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Realized P&L</Typography>
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        color: (positionDetails?.metrics?.realized_pnl || 0) >= 0 ? 'success.main' : 'error.main' 
                      }}
                    >
                      {formatCurrency(positionDetails?.metrics?.realized_pnl || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Current Value</Typography>
                    <Typography variant="h6" sx={{ color: 'primary.main' }}>
                      {formatCurrency(positionDetails?.metrics?.current_value || 0)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Notes & Journal Tab */}
        <TabPanel value={activeTab} index={3}>
          <Grid container spacing={3}>
            
            {/* Journal Entries Section */}
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 2 }}>
                <ErrorBoundary>
                  <SmartJournal 
                    positionId={position.id}
                    positionNotes={positionDetails?.position.notes}
                    positionLessons={positionDetails?.position.lessons}
                    positionMistakes={positionDetails?.position.mistakes}
                    onViewImage={(imageUrl, imageDescription) => {
                      console.log('Journal image clicked:', imageUrl, imageDescription);
                      setSelectedChart(imageUrl);
                      setSelectedChartInfo({
                        id: 0,
                        image_url: imageUrl,
                        description: imageDescription || 'Journal Image',
                        timeframe: 'N/A',
                        created_at: new Date().toISOString()
                      });
                      setChartDialog(true);
                    }}
                  />
                </ErrorBoundary>
              </Paper>
            </Grid>

            {/* Charts Section */}
            <Grid item xs={12} md={4}>
              <Paper 
                sx={{ p: 2 }}
                onPaste={handlePaste}
                tabIndex={0}
                style={{ outline: 'none' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    📸 Charts & Screenshots
                  </Typography>
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<PhotoIcon />}
                    disabled={uploadingImage}
                    size="small"
                  >
                    {uploadingImage ? 'Uploading...' : 'Upload'}
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </Button>
                </Box>
                
                {charts.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <PhotoIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      No charts uploaded yet.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                      📋 Paste from clipboard (Ctrl+V) or click Upload
                    </Typography>
                    <Box 
                      sx={{ 
                        border: '2px dashed #999', 
                        borderRadius: 2, 
                        p: 2,
                        backgroundColor: 'grey.800',
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'grey.900',
                          borderColor: 'primary.main'
                        }
                      }}
                    >
                      <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>
                        Click here and paste (Ctrl+V) to upload screenshots
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ mb: 2, p: 1, backgroundColor: 'grey.800', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.primary">
                        Tip: Click here and paste (Ctrl+V) to quickly add screenshots
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {charts.map((chart) => (
                        <Grid item xs={12} key={chart.id}>
                          <Paper 
                            sx={{ 
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': { 
                                bgcolor: 'action.hover',
                                transform: 'scale(1.02)'
                              }
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Image clicked, calling handleViewChart');
                              handleViewChart(chart.image_url, chart);
                            }}
                          >
                            <Box sx={{ textAlign: 'center' }}>
                              <img
                                src={chart.image_url}
                                alt={chart.description}
                                style={{
                                  width: '100%',
                                  height: '150px',
                                  objectFit: 'cover',
                                  display: 'block'
                                }}
                              />
                            </Box>
                            <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                  {chart.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(chart.created_at).toLocaleDateString()}
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteChart(chart.id);
                                }}
                                sx={{ color: 'error.main' }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <InstructorNotesSection positionId={position.id} />
            </Grid>
          </Grid>
        </TabPanel>
      </Box>
    </BaseModal>

    {/* Chart Viewing Dialog - Outside BaseModal to avoid z-index conflicts */}
    <Dialog 
      open={chartDialog} 
      onClose={() => setChartDialog(false)}
      maxWidth="xl"
      fullWidth
      sx={{ zIndex: 2000 }} // Ensure it's above the BaseModal
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6">
              {selectedChartInfo?.description || 'Chart View'}
            </Typography>
            {selectedChartInfo && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
                <ChartIcon sx={{ fontSize: 14, mr: 0.5 }} />
                {selectedChartInfo.timeframe && `${selectedChartInfo.timeframe} • `}
                Uploaded {formatDate(selectedChartInfo.created_at)}
              </Typography>
            )}
          </Box>
          <IconButton onClick={() => setChartDialog(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {selectedChart && (
          <Box>
            {/* Chart Image */}
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <img 
                src={selectedChart} 
                alt="Trading Chart" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '75vh', 
                  objectFit: 'contain',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px'
                }}
                onError={(e) => {
                  console.error('Image failed to load:', selectedChart);
                  e.currentTarget.style.display = 'none';
                }}
              />
            </Box>

            {/* Chart Details */}
            {selectedChartInfo && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>Chart Details</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2">
                        <strong>Position:</strong> {position?.ticker}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Description:</strong> {selectedChartInfo.description || 'No description'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2">
                        <strong>Timeframe:</strong> {selectedChartInfo.timeframe || 'Not specified'}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Uploaded:</strong> {formatDateTime(selectedChartInfo.created_at)}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setChartDialog(false)}>Close</Button>
      </DialogActions>
    </Dialog>

    {/* Edit Position Modal */}
    <EditPositionModal
      open={editPositionModalOpen}
      onClose={() => setEditPositionModalOpen(false)}
      position={position}
      onSuccess={handleEditPositionSuccess}
    />

    {/* Edit Event Modal */}
    {selectedEvent && (
      <EditEventModal
        open={editEventModalOpen}
        onClose={() => {
          setEditEventModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        isOptions={position.instrument_type === 'OPTIONS'}
        onSuccess={handleEditEventSuccess}
      />
    )}
    </>
  );
};

export default PositionDetailsModal;
