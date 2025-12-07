import React from 'react';
import { TableCell, Typography, Box, Tooltip } from '@mui/material';
import { DailyPnLEntry } from '../services/analyticsCalendarService';

interface CalendarDayProps {
  date: Date | null;
  dayData?: DailyPnLEntry;
  isToday?: boolean;
  formatCurrency: (value: number, decimalPlaces?: number) => string;
  onClick?: () => void;
}

export const CalendarDay: React.FC<CalendarDayProps> = ({
  date,
  dayData,
  isToday = false,
  formatCurrency,
  onClick
}) => {
  if (!date) {
    return <TableCell sx={{ bgcolor: 'action.disabledBackground' }} />;
  }

  const pnl = dayData?.net_pnl || 0;
  const trades = dayData?.trades_count || 0;
  const hasActivity = trades > 0;

  const intensity = pnl === 0 ? 0 : Math.min(Math.abs(pnl) / 1000, 1);
  
  const bgColor = hasActivity
    ? pnl > 0
      ? `rgba(46, 125, 50, ${0.2 + intensity * 0.7})`
      : `rgba(211, 47, 47, ${0.2 + intensity * 0.7})`
    : 'background.paper';

  const tooltipContent = hasActivity
    ? `${trades} trade${trades > 1 ? 's' : ''} • ${formatCurrency(pnl)}`
    : 'No activity';

  return (
    <TableCell
      align="center"
      sx={{
        height: 90,
        border: isToday ? '2px solid' : '1px solid',
        borderColor: isToday ? 'primary.main' : 'divider',
        bgcolor: bgColor,
        cursor: hasActivity ? 'pointer' : 'default',
        '&:hover': hasActivity
          ? {
              bgcolor: pnl > 0 ? 'success.light' : 'error.light',
              transform: 'scale(1.02)',
              transition: 'all 0.2s ease'
            }
          : {},
        position: 'relative',
        p: 1
      }}
      onClick={hasActivity ? onClick : undefined}
    >
      <Tooltip title={tooltipContent} arrow placement="top">
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.75rem',
              fontWeight: isToday ? 'bold' : 'normal',
              color: isToday ? 'primary.main' : 'text.primary'
            }}
          >
            {date.getDate()}
          </Typography>

          {hasActivity && (
            <>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 'bold',
                  color: pnl >= 0 ? 'success.main' : 'error.main',
                  mt: 0.5,
                  fontSize: '0.875rem'
                }}
              >
                {formatCurrency(pnl)}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  color: 'text.secondary',
                  display: 'block',
                  mt: 0.25
                }}
              >
                {trades} {trades === 1 ? 'trade' : 'trades'}
              </Typography>
            </>
          )}
        </Box>
      </Tooltip>
    </TableCell>
  );
};

export default CalendarDay;