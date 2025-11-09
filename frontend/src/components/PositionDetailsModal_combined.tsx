import React, { useState, useEffect } from 'react';
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
  ListItemText
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
  Refresh as RefreshIcon
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
import { Position, PositionDetails, PositionEvent, getPositionDetails } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import EventBreakdown from './EventBreakdown';

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

const CHART_COLORS = ['#4caf50', '#f44336', '#2196f3', '#ff9800', '#9c27b0', '#607d8b'];

const PositionDetailsModal: React.FC<PositionDetailsModalProps> = ({
  open,
  onClose,
  position,
  onRefresh
}) => {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionDetails, setPositionDetails] = useState<PositionDetails | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Load position details when modal opens
  useEffect(() => {
    if (open) {
      loadPositionDetails();
    }
  }, [open, position.id]);

  const loadPositionDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading position details for:', position.id);
      const details = await getPositionDetails(position.id);
      setPositionDetails(details);
      
    } catch (err: any) {
      console.error('Failed to load position details:', err);
      setError(err.message || 'Failed to load position details');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadPositionDetails();
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleUpdateEventStopLoss = async (eventId: number, newStopLoss: number | null) => {
    try {
      setLoading(true);
      
      // Import the updatePositionEvent function
      const { updatePositionEvent } = await import('../services/positionsService');
      
      // Update the event
      await updatePositionEvent(eventId, {
        stop_loss: newStopLoss
      });
      
      // Refresh the position details to show updated data
      await loadPositionDetails();
      
    } catch (err: any) {
      console.error('Failed to update event stop loss:', err);
      setError(err.message || 'Failed to update stop loss');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Prepare chart data
  const prepareEquityCurveData = () => {
    if (!positionDetails?.events) return [];
    
    let cumulativeShares = 0;
    let cumulativeCost = 0;
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
          cumulativeCost += event.shares * event.price;
        } else {
          const soldShares = Math.abs(event.shares);
          const avgCostBasis = cumulativeShares > 0 ? cumulativeCost / cumulativeShares : 0;
          const eventPnL = (event.price - avgCostBasis) * soldShares;
          realizedPnL += eventPnL;
          
          cumulativeShares -= soldShares;
          cumulativeCost = cumulativeShares * avgCostBasis;
        }
        endOfDayPrice = event.price; // Use last price of the day
      });
      
      const currentValue = cumulativeShares * endOfDayPrice;
      const totalValue = currentValue + realizedPnL;
      
      return {
        date: dateStr,
        shares: cumulativeShares,
        cost: cumulativeCost,
        value: currentValue,
        realizedPnL: realizedPnL,
        totalPnL: totalValue - (positionDetails.metrics?.total_bought || 0),
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
    return new Date(dateStr).toLocaleString();
  };

  const calculateMetrics = () => {
    if (!positionDetails) return null;
    
    const { position, events, metrics } = positionDetails;
    const totalInvested = metrics?.total_bought || 0;
    const totalRealized = metrics?.total_sold || 0;
    const currentValue = (position.current_shares || 0) * (position.avg_entry_price || 0);
    const totalValue = currentValue + (position.total_realized_pnl || 0);
    const totalReturn = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;
    
    // Risk metrics
    const daysHeld = position.opened_at ? 
      Math.floor((new Date().getTime() - new Date(position.opened_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    // Win rate for sells
    const sellEvents = events.filter(e => e.event_type === 'sell');
    const profitableSells = sellEvents.filter(e => (e.realized_pnl || 0) > 0);
    const winRate = sellEvents.length > 0 ? (profitableSells.length / sellEvents.length) * 100 : 0;
    
    return {
      totalInvested,
      totalRealized,
      currentValue,
      totalValue,
      totalReturn,
      daysHeld,
      winRate,
      averageHoldTime: daysHeld / Math.max(events.length, 1),
      totalEvents: events.length
    };
  };

  const calculatedMetrics = calculateMetrics();
  const equityCurveData = prepareEquityCurveData();
  const volumeData = prepareVolumeData();

  return (
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
              <CardContent sx={{ textAlign: 'center' }}>
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
                    <Typography variant="h6">{position.current_shares}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Avg Entry</Typography>
                    <Typography variant="h6">{formatCurrency(position.avg_entry_price || 0)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Return</Typography>
                    <Typography 
                      variant="h6"
                      sx={{ 
                        color: (calculatedMetrics?.totalReturn || 0) >= 0 ? 'success.main' : 'error.main' 
                      }}
                    >
                      {calculatedMetrics?.totalReturn?.toFixed(2) || 0}%
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
          </Tabs>
        </Box>

        {/* Analytics Tab */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            
            {/* Equity Curve Chart */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📈 Position Equity Curve
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
                        dataKey="totalPnL" 
                        stroke="#4caf50" 
                        fill="#4caf50" 
                        fillOpacity={0.3}
                        name="Total P&L"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="realizedPnL" 
                        stroke="#2196f3" 
                        fill="#2196f3" 
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

            {/* Performance Metrics */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  🎯 Performance Summary
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Win Rate</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={calculatedMetrics?.winRate || 0}
                        sx={{ width: '100%', mr: 1 }}
                      />
                      <Typography variant="body2">
                        {calculatedMetrics?.winRate?.toFixed(0) || 0}%
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Total Events</Typography>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {calculatedMetrics?.totalEvents || 0}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Invested</Typography>
                    <Typography variant="h6" sx={{ color: 'info.main' }}>
                      {formatCurrency(calculatedMetrics?.totalInvested || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Current Value</Typography>
                    <Typography variant="h6" sx={{ 
                      color: (calculatedMetrics?.totalReturn || 0) >= 0 ? 'success.main' : 'error.main' 
                    }}>
                      {formatCurrency(calculatedMetrics?.totalValue || 0)}
                    </Typography>
                  </Grid>
                </Grid>
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
                disabled={loading}
                accountBalance={user?.current_account_balance}
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
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Alert severity={position.current_stop_loss ? 'success' : 'warning'}>
                      {position.current_stop_loss 
                        ? `Stop Loss: ${formatCurrency(position.current_stop_loss)}`
                        : 'No Stop Loss Set'
                      }
                    </Alert>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity={position.current_take_profit ? 'info' : 'info'}>
                      {position.current_take_profit 
                        ? `Take Profit: ${formatCurrency(position.current_take_profit)}`
                        : 'No Take Profit Set'
                      }
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
                      {position.notes || 'No notes available'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Summary Statistics */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  📈 Summary Statistics
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Bought</Typography>
                    <Typography variant="h6" sx={{ color: 'info.main' }}>
                      {formatCurrency(positionDetails?.metrics?.total_bought || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Sold</Typography>
                    <Typography variant="h6" sx={{ color: 'warning.main' }}>
                      {formatCurrency(positionDetails?.metrics?.total_sold || 0)}
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
      </Box>
    </BaseModal>
  );
};

export default PositionDetailsModal;
