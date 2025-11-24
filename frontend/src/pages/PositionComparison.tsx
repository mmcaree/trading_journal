import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Autocomplete,
  TextField,
  CircularProgress,
  Alert,
  Button,
  Card,
  CardContent
} from '@mui/material';
import {
  Compare as CompareIcon,
  TrendingUp as TrendingUpIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Position } from '../types/api';
import { getAllPositions, getBulkPositionChartData, ChartDataResponse } from '../services/positionsService';
import PositionComparisonCard from '../components/PositionComparisonCard';
import ComparisonTable from '../components/ComparisonTable';
import PositionPriceChart from '../components/PositionPriceChart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useCurrency } from '../context/CurrencyContext';

const COLORS = ['#1da0f0', '#f44336', '#4caf50', '#ff9800'];

const PositionComparison: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Chart data state
  const [chartDataMap, setChartDataMap] = useState<Record<number, ChartDataResponse>>({});
  const [chartLoading, setChartLoading] = useState(false);

  // Load all positions
  useEffect(() => {
    const loadPositions = async () => {
      try {
        setLoading(true);
        const positions = await getAllPositions({ limit: 100000 });
        setAllPositions(positions);

        // Check for pre-selected positions from URL params
        const preSelectedIds = searchParams.get('ids');
        if (preSelectedIds) {
          const ids = preSelectedIds.split(',').map(Number);
          const preSelected = positions.filter((p) => ids.includes(p.id));
          setSelectedPositions(preSelected.slice(0, 4)); // Limit to 4
        }
      } catch (err) {
        console.error('Error loading positions:', err);
        setError('Failed to load positions. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadPositions();
  }, [searchParams]);

  // Load chart data when positions are selected
  useEffect(() => {
    const loadChartData = async () => {
      if (selectedPositions.length === 0) {
        setChartDataMap({});
        return;
      }

      try {
        setChartLoading(true);
        const positionIds = selectedPositions.map(p => p.id);
        console.log('Loading chart data for positions:', positionIds);
        
        const response = await getBulkPositionChartData(positionIds, 120, 30);
        console.log('Chart data response:', response);
        
        // Convert array to map keyed by position_id
        const dataMap: Record<number, ChartDataResponse> = {};
        response.charts.forEach(chart => {
          console.log(`Chart for position ${chart.position_id}:`, chart);
          if (!chart.error) {
            dataMap[chart.position_id] = chart;
          } else {
            console.error(`Error loading chart for position ${chart.position_id}:`, chart.error);
          }
        });
        
        console.log('Chart data map:', dataMap);
        setChartDataMap(dataMap);
      } catch (err) {
        console.error('Error loading chart data:', err);
        // Don't set error state, just log - chart data is optional
      } finally {
        setChartLoading(false);
      }
    };

    loadChartData();
  }, [selectedPositions]);

  // Generate comparison chart data
  const generateChartData = () => {
    if (selectedPositions.length === 0) return [];

    return selectedPositions.map((position, index) => ({
      name: position.ticker,
      pnl: position.total_realized_pnl,
      returnPercent: position.return_percent || 0,
      avgEntry: position.avg_entry_price || 0,
      totalCost: position.total_cost,
      daysHeld: position.closed_at
        ? Math.floor(
            (new Date(position.closed_at).getTime() - new Date(position.opened_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : Math.floor(
            (new Date().getTime() - new Date(position.opened_at).getTime()) /
              (1000 * 60 * 60 * 24)
          ),
      fill: COLORS[index % COLORS.length]
    }));
  };

  const chartData = generateChartData();

  // Find best and worst performers
  const bestPerformer =
    selectedPositions.length > 0
      ? selectedPositions.reduce((best, current) =>
          current.total_realized_pnl > best.total_realized_pnl ? current : best
        )
      : null;

  const worstPerformer =
    selectedPositions.length > 0
      ? selectedPositions.reduce((worst, current) =>
          current.total_realized_pnl < worst.total_realized_pnl ? current : worst
        )
      : null;

  const handleClearSelection = () => {
    setSelectedPositions([]);
    navigate('/compare', { replace: true });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <CompareIcon fontSize="large" color="primary" />
          <Typography variant="h4" component="h1" fontWeight="bold">
            Position Comparison
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Position Selector */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select Positions to Compare (Max 4)
        </Typography>
        <Box display="flex" gap={2} alignItems="flex-start">
          <Autocomplete
            multiple
            fullWidth
            options={allPositions}
            value={selectedPositions}
            onChange={(_, newValue) => {
              if (newValue.length <= 4) {
                setSelectedPositions(newValue);
              }
            }}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) =>
              `${option.ticker} - ${option.status === 'open' ? 'Open' : 'Closed'} (${
                option.strategy || 'No strategy'
              })`
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search Positions"
                placeholder="Type ticker, strategy, or status..."
                helperText={`${selectedPositions.length}/4 positions selected`}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    {option.ticker}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.strategy || 'No strategy'} • {option.status} •{' '}
                    {formatCurrency(option.total_realized_pnl)}
                  </Typography>
                </Box>
              </li>
            )}
            disabled={loading}
          />
          {selectedPositions.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<ClearIcon />}
              onClick={handleClearSelection}
              sx={{ minWidth: 120 }}
            >
              Clear
            </Button>
          )}
        </Box>
      </Paper>

      {/* No Selection State */}
      {selectedPositions.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <TrendingUpIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" color="text.secondary" gutterBottom>
            Select positions to compare
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Choose 2-4 positions from the dropdown above to analyze their performance side-by-side
          </Typography>
        </Paper>
      )}

      {/* Comparison Content */}
      {selectedPositions.length > 0 && (
        <>
          {/* Summary Stats */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Positions Compared
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {selectedPositions.length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Total Combined P&L
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    color={
                      selectedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0) > 0
                        ? 'success.main'
                        : 'error.main'
                    }
                  >
                    {formatCurrency(
                      selectedPositions.reduce((sum, p) => sum + p.total_realized_pnl, 0)
                    )}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Avg Return %
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {(
                      selectedPositions.reduce((sum, p) => sum + (p.return_percent || 0), 0) /
                      selectedPositions.length
                    ).toFixed(2)}
                    %
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Position Cards */}
          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Position Details
          </Typography>
          <Grid container spacing={3} mb={4}>
            {selectedPositions.map((position) => (
              <Grid item xs={12} sm={6} md={selectedPositions.length === 2 ? 6 : 3} key={position.id}>
                <PositionComparisonCard
                  position={position}
                  highlightBest={bestPerformer?.id === position.id && selectedPositions.length > 1}
                  highlightWorst={
                    worstPerformer?.id === position.id &&
                    selectedPositions.length > 1 &&
                    bestPerformer?.id !== worstPerformer?.id
                  }
                />
              </Grid>
            ))}
          </Grid>

          {/* Charts */}
          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Performance Comparison
          </Typography>
          <Grid container spacing={3} mb={4}>
            {/* P&L Bar Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Total P&L Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: '#000' }}
                    />
                    <Bar dataKey="pnl" fill="#1da0f0" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Return % Bar Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Return % Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} labelStyle={{ color: '#000' }} />
                    <Bar dataKey="returnPercent" fill="#4caf50" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Days Held Comparison */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Days Held Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `${value} days`} labelStyle={{ color: '#000' }} />
                    <Bar dataKey="daysHeld" fill="#ff9800" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Entry Price Line Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Average Entry Price
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: '#000' }}
                    />
                    <Line type="monotone" dataKey="avgEntry" stroke="#f44336" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          {/* Historical Price Charts */}
          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Historical Price Charts
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
            Daily price data from 7 days before entry to 7 days after exit
          </Typography>
          <Grid container spacing={3} mb={4}>
            {selectedPositions.map((position) => {
              const chartData = chartDataMap[position.id];
              const hasChartData = chartData && chartData.price_data && chartData.price_data.length > 0;
              
              return (
                <Grid 
                  item 
                  xs={12} 
                  md={selectedPositions.length === 2 ? 6 : selectedPositions.length === 3 ? 4 : 6}
                  key={position.id}
                >
                  <PositionPriceChart
                    ticker={position.ticker}
                    priceData={chartData?.price_data || []}
                    entryDate={chartData?.entry_date}
                    exitDate={chartData?.exit_date}
                    loading={chartLoading}
                    error={!chartLoading && !hasChartData ? 'Unable to load chart data' : undefined}
                  />
                </Grid>
              );
            })}
          </Grid>

          {/* Comparison Table */}
          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Detailed Metrics Comparison
          </Typography>
          <ComparisonTable positions={selectedPositions} />
        </>
      )}
    </Box>
  );
};

export default PositionComparison;
