import React from 'react';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { Box, Paper, Typography } from '@mui/material';

export const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  gray: '#6b7280',
  grid: '#374151',
  text: '#9ca3af',
  background: '#111827',
  card: '#1f2937',
};

export const PIE_CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316'
];

export const currencyTickFormatter = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const CustomTooltip: React.FC<TooltipProps<ValueType, NameType>> = ({
  active,
  payload,
  label,
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const formatLabel = (label: string | number | Date): string => {
    if (typeof label === 'string' && /^\d{4}-\d{2}-\d{2}/.test(label)) {
      const date = new Date(label);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    }
    return String(label);
  };

  // Check if the value should be formatted as a count/integer (not currency)
  const isCountMetric = (name: string): boolean => {
    const countKeywords = ['count', 'trade', 'wins', 'losses', 'position'];
    const nameLower = String(name).toLowerCase();
    return countKeywords.some(keyword => nameLower.includes(keyword));
  };

  const formatValue = (value: any, name: string): string => {
    if (typeof value !== 'number') return String(value);
    
    // If it's a count metric, format as integer
    if (isCountMetric(name)) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    
    // Otherwise format as currency
    if (value >= 1000 || value <= -1000) {
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <Paper
      elevation={12}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        minWidth: 180,
        maxWidth: 320,
      }}
    >
      <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
        {formatLabel(label)}
      </Typography>
      {payload.map((entry, i) => (
        <Box key={i} sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
            <span style={{ color: entry.color || entry.fill, fontWeight: 600 }}>
              {entry.name}:
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
              {formatValue(entry.value, String(entry.name))}
            </span>
          </Typography>
        </Box>
      ))}
    </Paper>
  );
};