// frontend/src/components/EquityCurveChart.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  ButtonGroup,
  Button
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon
} from '@mui/icons-material';
import api from '../services/apiConfig';
import { useCurrency } from '../context/CurrencyContext';
import { CHART_COLORS, currencyTickFormatter, CustomTooltip } from './CustomChartComponents';

interface EquityPoint {
  date: string;
  value: number;
  event_type?: string;
  description?: string;
}

interface EquityCurveProps {
  startDate?: string;
  endDate?: string;
  height?: number;
}

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export const EquityCurveChart: React.FC<EquityCurveProps> = ({ 
  startDate, 
  endDate,
  height = 400
}) => {
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('ALL');
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    fetchEquityCurve();
  }, [startDate, endDate, selectedRange]);

  const getDateRangeForSelection = (range: TimeRange) => {
    const now = new Date();
    let calculatedStartDate: Date | null = null;

    switch (range) {
      case '1M':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '3M':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6M':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case 'YTD':
        calculatedStartDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '1Y':
        calculatedStartDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case 'ALL':
      default:
        calculatedStartDate = null;
    }

    return calculatedStartDate?.toISOString().split('T')[0];
  };

  const fetchEquityCurve = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      const effectiveStartDate = startDate || getDateRangeForSelection(selectedRange);
      if (effectiveStartDate) {
        params.append('start_date', effectiveStartDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }
      
      const response = await api.get(`/api/users/me/equity-curve?${params}`);
      
      if (response.data && response.data.equity_curve) {
        setEquityCurve(response.data.equity_curve);
      } else {
        setEquityCurve([]);
      }
    } catch (err: any) {
      console.error('Error fetching equity curve:', err);
      setError(err.response?.data?.detail || 'Failed to load equity curve data');
    } finally {
      setLoading(false);
    }
  };

  const getPointColor = (eventType?: string) => {
    if (!eventType) return CHART_COLORS.primary;
    switch (eventType) {
      case 'deposit':
        return '#2e7d32'; // Green
      case 'withdrawal':
        return '#d32f2f'; // Red
      case 'position_close':
        return '#1976d2'; // Blue
      default:
        return CHART_COLORS.primary;
    }
  };

  const getChartStats = () => {
    if (equityCurve.length === 0) return null;

    const firstValue = equityCurve[0].value;
    const lastValue = equityCurve[equityCurve.length - 1].value;
    const change = lastValue - firstValue;
    const changePercent = (change / firstValue) * 100;

    const maxValue = Math.max(...equityCurve.map(p => p.value));
    const minValue = Math.min(...equityCurve.map(p => p.value));

    return {
      firstValue,
      lastValue,
      change,
      changePercent,
      maxValue,
      minValue
    };
  };

  const stats = getChartStats();

  if (loading) {
    return (
      <Paper sx={{ p: 3, height }}>
        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading equity curve...</Typography>
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  if (equityCurve.length === 0) {
    return (
      <Paper sx={{ p: 3, height }}>
        <Typography variant="h6" gutterBottom>
          Account Equity Curve
        </Typography>
        <Box display="flex" justifyContent="center" alignItems="center" height="80%">
          <Alert severity="info">
            No equity data available yet. Start trading to see your account growth!
          </Alert>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
            <AccountBalanceIcon color="primary" />
            Account Equity Curve
          </Typography>
          {stats && (
            <Box display="flex" gap={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Start: {formatCurrency(stats.firstValue)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Current: {formatCurrency(stats.lastValue)}
              </Typography>
              <Chip
                icon={stats.change >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={`${stats.change >= 0 ? '+' : ''}${formatCurrency(stats.change)} (${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%)`}
                color={stats.change >= 0 ? 'success' : 'error'}
                size="small"
              />
            </Box>
          )}
        </Box>

        <ButtonGroup size="small" variant="outlined">
          {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map((range) => (
            <Button
              key={range}
              variant={selectedRange === range ? 'contained' : 'outlined'}
              onClick={() => setSelectedRange(range)}
            >
              {range}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      <Box sx={{ width: '100%', height: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={equityCurve}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              dataKey="date"
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              tickFormatter={(date) => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              tickFormatter={currencyTickFormatter}
              width={80}
              label={{ 
                value: 'Account Value ($)', 
                angle: -90, 
                position: 'insideLeft',
                style: { fill: CHART_COLORS.text }
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                
                const data = payload[0].payload as EquityPoint;
                return (
                  <Box
                    sx={{
                      bgcolor: 'background.paper',
                      p: 1.5,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      boxShadow: 2
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                      {new Date(data.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                    <Typography variant="body2" color="primary">
                      Value: {formatCurrency(data.value)}
                    </Typography>
                    {data.event_type && (
                      <Chip
                        label={data.event_type.replace('_', ' ').toUpperCase()}
                        size="small"
                        sx={{ 
                          mt: 0.5,
                          bgcolor: getPointColor(data.event_type),
                          color: 'white'
                        }}
                      />
                    )}
                    {data.description && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        {data.description}
                      </Typography>
                    )}
                  </Box>
                );
              }}
              cursor={{ strokeDasharray: '5 5' }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              content={() => (
                <Box display="flex" justifyContent="center" gap={3} mt={1}>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#2e7d32'
                      }}
                    />
                    <Typography variant="caption">Deposits</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#d32f2f'
                      }}
                    />
                    <Typography variant="caption">Withdrawals</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#1976d2'
                      }}
                    />
                    <Typography variant="caption">Position Closed</Typography>
                  </Box>
                </Box>
              )}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                const hasEvent = payload.event_type;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hasEvent ? 5 : 2}
                    fill={getPointColor(payload.event_type)}
                    stroke="white"
                    strokeWidth={hasEvent ? 2 : 0}
                  />
                );
              }}
              activeDot={{ r: 6 }}
            />
            {stats && (
              <ReferenceLine
                y={stats.firstValue}
                stroke={CHART_COLORS.grid}
                strokeDasharray="3 3"
                label={{
                  value: 'Starting Value',
                  position: 'right',
                  fill: CHART_COLORS.text
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {stats && (
        <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Peak
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {formatCurrency(stats.maxValue)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Lowest
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {formatCurrency(stats.minValue)}
            </Typography>
          </Box>
        </Box>
      )}
    </Paper>
  );
};