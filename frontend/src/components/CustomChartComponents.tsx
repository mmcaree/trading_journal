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

  const formatDate = (label: any) => {
    if (typeof label === 'string' && label.includes('-')) {
      try {
        return new Date(label).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      } catch {
        return label;
      }
    }
    return label;
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
        {formatDate(label)}
      </Typography>
      {payload.map((entry, i) => (
        <Box key={i} sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
            <span style={{ color: entry.color || entry.fill, fontWeight: 600 }}>
              {entry.name}:
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
              {typeof entry.value === 'number'
                ? entry.value >= 1000 || entry.value <= -1000
                  ? `$${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : `$${entry.value.toFixed(2)}`
                : entry.value}
            </span>
          </Typography>
        </Box>
      ))}
    </Paper>
  );
};