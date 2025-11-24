import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Chip
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { Position } from '../types/api';
import { useCurrency } from '../context/CurrencyContext';

interface ComparisonTableProps {
  positions: Position[];
}

interface MetricRow {
  label: string;
  getValue: (position: Position) => string | number;
  format?: (value: any) => string;
  highlightBest?: boolean;
  inverse?: boolean; // true if lower is better (e.g., risk)
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ positions }) => {
  const { formatCurrency } = useCurrency();

  const calculateDaysHeld = (position: Position): number => {
    const endDate = position.closed_at ? new Date(position.closed_at) : new Date();
    const startDate = new Date(position.opened_at);
    return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const calculateRiskRewardRatio = (position: Position): number => {
    if (!position.avg_entry_price || !position.current_stop_loss) return 0;
    
    const riskPerShare = position.avg_entry_price - position.current_stop_loss;
    const rewardPerShare = position.current_take_profit
      ? position.current_take_profit - position.avg_entry_price
      : 0;
    
    return riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  };

  const metrics: MetricRow[] = [
    {
      label: 'Ticker',
      getValue: (p) => p.ticker,
      highlightBest: false
    },
    {
      label: 'Status',
      getValue: (p) => p.status,
      format: (v) => v.charAt(0).toUpperCase() + v.slice(1),
      highlightBest: false
    },
    {
      label: 'Total P&L',
      getValue: (p) => p.total_realized_pnl,
      format: (v) => formatCurrency(v),
      highlightBest: true
    },
    {
      label: 'Return %',
      getValue: (p) => p.return_percent || 0,
      format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`,
      highlightBest: true
    },
    {
      label: 'Avg Entry Price',
      getValue: (p) => p.avg_entry_price || 0,
      format: (v) => formatCurrency(v),
      highlightBest: false
    },
    {
      label: 'Current/Final Shares',
      getValue: (p) => p.current_shares,
      highlightBest: false
    },
    {
      label: 'Total Cost',
      getValue: (p) => p.total_cost,
      format: (v) => formatCurrency(v),
      highlightBest: false
    },
    {
      label: 'Days Held',
      getValue: (p) => calculateDaysHeld(p),
      format: (v) => `${v} days`,
      highlightBest: false
    },
    {
      label: 'Risk/Reward Ratio',
      getValue: (p) => calculateRiskRewardRatio(p),
      format: (v) => v > 0 ? `1:${v.toFixed(2)}` : 'N/A',
      highlightBest: true
    },
    {
      label: 'Strategy',
      getValue: (p) => p.strategy || 'N/A',
      highlightBest: false
    },
    {
      label: 'Setup Type',
      getValue: (p) => p.setup_type || 'N/A',
      highlightBest: false
    },
    {
      label: 'Timeframe',
      getValue: (p) => p.timeframe || 'N/A',
      highlightBest: false
    },
    {
      label: 'Number of Events',
      getValue: (p) => p.events_count || 0,
      highlightBest: false
    },
    {
      label: 'Original Risk %',
      getValue: (p) => p.original_risk_percent || 0,
      format: (v) => `${v.toFixed(2)}%`,
      highlightBest: false,
      inverse: true
    }
  ];

  // Find best values for highlighting
  const getBestIndex = (metric: MetricRow): number => {
    if (!metric.highlightBest || positions.length === 0) return -1;

    const values = positions.map((p) => {
      const val = metric.getValue(p);
      return typeof val === 'number' ? val : 0;
    });

    if (metric.inverse) {
      const minValue = Math.min(...values);
      return values.indexOf(minValue);
    } else {
      const maxValue = Math.max(...values);
      return values.indexOf(maxValue);
    }
  };

  const getCellStyle = (metricIndex: number, positionIndex: number) => {
    const metric = metrics[metricIndex];
    const bestIndex = getBestIndex(metric);

    if (bestIndex === positionIndex && metric.highlightBest) {
      return {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fontWeight: 'bold'
      };
    }

    return {};
  };

  const renderValue = (value: any, format?: (v: any) => string) => {
    if (format) return format(value);
    if (typeof value === 'number') return value.toFixed(2);
    return value;
  };

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell
              sx={{
                backgroundColor: 'background.paper',
                fontWeight: 'bold',
                minWidth: 180
              }}
            >
              Metric
            </TableCell>
            {positions.map((position) => (
              <TableCell
                key={position.id}
                align="center"
                sx={{
                  backgroundColor: 'background.paper',
                  fontWeight: 'bold',
                  minWidth: 150
                }}
              >
                <Box display="flex" flexDirection="column" alignItems="center" gap={0.5}>
                  <Typography variant="subtitle2">{position.ticker}</Typography>
                  <Chip
                    label={position.status}
                    size="small"
                    color={position.status === 'open' ? 'primary' : 'default'}
                    sx={{ fontSize: '0.7rem' }}
                  />
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {metrics.map((metric, metricIndex) => (
            <TableRow
              key={metric.label}
              sx={{
                '&:nth-of-type(odd)': {
                  backgroundColor: 'action.hover'
                }
              }}
            >
              <TableCell component="th" scope="row" sx={{ fontWeight: 'medium' }}>
                {metric.label}
              </TableCell>
              {positions.map((position, positionIndex) => {
                const value = metric.getValue(position);
                const numericValue = typeof value === 'number' ? value : 0;
                const displayValue = renderValue(value, metric.format);

                return (
                  <TableCell
                    key={position.id}
                    align="center"
                    sx={getCellStyle(metricIndex, positionIndex)}
                  >
                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                      {metric.label === 'Total P&L' && (
                        numericValue > 0 ? (
                          <TrendingUpIcon fontSize="small" color="success" />
                        ) : numericValue < 0 ? (
                          <TrendingDownIcon fontSize="small" color="error" />
                        ) : null
                      )}
                      <Typography
                        variant="body2"
                        color={
                          metric.label === 'Total P&L' || metric.label === 'Return %'
                            ? numericValue > 0
                              ? 'success.main'
                              : numericValue < 0
                              ? 'error.main'
                              : 'text.primary'
                            : 'text.primary'
                        }
                      >
                        {displayValue}
                      </Typography>
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ComparisonTable;
