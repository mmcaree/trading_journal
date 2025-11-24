import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Divider,
  Stack
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ShowChartIcon
} from '@mui/icons-material';
import { Position } from '../types/api';
import { useCurrency } from '../context/CurrencyContext';

interface PositionComparisonCardProps {
  position: Position;
  highlightBest?: boolean;
  highlightWorst?: boolean;
}

const PositionComparisonCard: React.FC<PositionComparisonCardProps> = ({
  position,
  highlightBest = false,
  highlightWorst = false
}) => {
  const { formatCurrency } = useCurrency();

  // Calculate metrics
  const totalPnL = position.total_realized_pnl;
  const isProfitable = totalPnL > 0;
  const returnPercent = position.return_percent || 0;
  const daysHeld = position.closed_at
    ? Math.floor(
        (new Date(position.closed_at).getTime() - new Date(position.opened_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : Math.floor(
        (new Date().getTime() - new Date(position.opened_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );

  // Risk/Reward
  const riskAmount = position.avg_entry_price && position.current_stop_loss
    ? (position.avg_entry_price - position.current_stop_loss) * (position.original_shares || position.current_shares)
    : 0;
  
  const rewardAmount = position.avg_entry_price && position.current_take_profit
    ? (position.current_take_profit - position.avg_entry_price) * (position.original_shares || position.current_shares)
    : 0;

  const riskRewardRatio = riskAmount > 0 ? rewardAmount / riskAmount : 0;

  // Card border color based on highlighting
  const getBorderColor = () => {
    if (highlightBest) return '#4caf50';
    if (highlightWorst) return '#f44336';
    return 'transparent';
  };

  return (
    <Card
      sx={{
        height: '100%',
        border: `2px solid ${getBorderColor()}`,
        boxShadow: highlightBest || highlightWorst ? 4 : 1,
        transition: 'all 0.3s ease'
      }}
    >
      <CardContent>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="div" fontWeight="bold">
            {position.ticker}
          </Typography>
          <Chip
            label={position.status === 'open' ? 'Open' : 'Closed'}
            color={position.status === 'open' ? 'primary' : 'default'}
            size="small"
          />
        </Box>

        {/* Strategy Info */}
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          {position.strategy && (
            <Chip label={position.strategy} size="small" variant="outlined" />
          )}
          {position.setup_type && (
            <Chip label={position.setup_type} size="small" variant="outlined" />
          )}
          {position.timeframe && (
            <Chip label={position.timeframe} size="small" variant="outlined" />
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Key Metrics */}
        <Stack spacing={1.5}>
          {/* P&L */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Total P&L
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              {isProfitable ? (
                <TrendingUpIcon color="success" fontSize="small" />
              ) : (
                <TrendingDownIcon color="error" fontSize="small" />
              )}
              <Typography
                variant="h6"
                color={isProfitable ? 'success.main' : 'error.main'}
                fontWeight="bold"
              >
                {formatCurrency(totalPnL)}
              </Typography>
              <Typography
                variant="body2"
                color={isProfitable ? 'success.main' : 'error.main'}
              >
                ({returnPercent > 0 ? '+' : ''}{returnPercent.toFixed(2)}%)
              </Typography>
            </Box>
          </Box>

          {/* Entry Price */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Avg Entry Price
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {position.avg_entry_price ? formatCurrency(position.avg_entry_price) : 'N/A'}
            </Typography>
          </Box>

          {/* Shares */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              {position.status === 'open' ? 'Current Shares' : 'Total Shares Traded'}
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {position.status === 'open'
                ? position.current_shares
                : position.original_shares || position.current_shares}
            </Typography>
          </Box>

          {/* Days Held */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Days Held
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {daysHeld} days
            </Typography>
          </Box>

          {/* Risk/Reward Ratio */}
          {riskRewardRatio > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                Risk/Reward Ratio
              </Typography>
              <Typography
                variant="body1"
                fontWeight="medium"
                color={riskRewardRatio >= 2 ? 'success.main' : 'warning.main'}
              >
                1:{riskRewardRatio.toFixed(2)}
              </Typography>
            </Box>
          )}

          {/* Total Cost */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Total Cost
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {formatCurrency(position.total_cost)}
            </Typography>
          </Box>

          {/* Events Count */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Number of Events
            </Typography>
            <Box display="flex" alignItems="center" gap={0.5}>
              <ShowChartIcon fontSize="small" color="action" />
              <Typography variant="body1" fontWeight="medium">
                {position.events_count || 0}
              </Typography>
            </Box>
          </Box>
        </Stack>

        {/* Best/Worst Badge */}
        {(highlightBest || highlightWorst) && (
          <Box mt={2} textAlign="center">
            <Chip
              label={highlightBest ? '🏆 Best Performer' : '⚠️ Needs Review'}
              color={highlightBest ? 'success' : 'error'}
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default PositionComparisonCard;
