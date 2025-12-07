import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  IconButton,
  Divider
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useDayEventDetails } from '../hooks/useCalendarData';
import { useCurrency } from '../context/CurrencyContext';

interface DayDetailsModalProps {
  open: boolean;
  onClose: () => void;
  date: string | null;
  eventIds?: number[];
  initialPnl?: number;
}

export const DayDetailsModal: React.FC<DayDetailsModalProps> = ({
  open,
  onClose,
  date,
  eventIds,
  initialPnl
}) => {
  const { data: events, isLoading, error } = useDayEventDetails(date, eventIds);
  const { formatCurrency } = useCurrency();

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';

  const totalPnl = events?.reduce((sum, event) => sum + event.realized_pnl, 0) || initialPnl || 0;
  const totalTrades = events?.length || 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6">Trading Activity</Typography>
          <Typography variant="body2" color="text.secondary">
            {formattedDate}
          </Typography>
        </Box>
        <IconButton onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent>
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total P&L
              </Typography>
              <Typography
                variant="h5"
                color={totalPnl >= 0 ? 'success.main' : 'error.main'}
                sx={{ fontWeight: 'bold' }}
              >
                {formatCurrency(totalPnl)}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Number of Trades
              </Typography>
              <Typography variant="h5">{totalTrades}</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Avg P&L per Trade
              </Typography>
              <Typography
                variant="h5"
                color={totalPnl >= 0 ? 'success.main' : 'error.main'}
              >
                {totalTrades > 0 ? formatCurrency(totalPnl / totalTrades) : '$0.00'}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {isLoading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load trade details: {error.message}
          </Alert>
        )}

        {!isLoading && !error && events && events.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="medium">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>Ticker</TableCell>
                  <TableCell align="right">Shares</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">P&L</TableCell>
                  <TableCell>Strategy</TableCell>
                  <TableCell>Setup</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.event_id}
                    sx={{
                      '&:hover': { bgcolor: 'action.hover' },
                      bgcolor: event.realized_pnl >= 0 
                        ? 'rgba(46, 125, 50, 0.1)' 
                        : 'rgba(211, 47, 47, 0.1)',
                    }}
                  >
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {event.ticker}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{event.shares}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{formatCurrency(event.price)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        color={event.realized_pnl >= 0 ? 'success.main' : 'error.main'}
                      >
                        {formatCurrency(event.realized_pnl)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {event.strategy ? (
                        <Chip label={event.strategy} size="small" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {event.setup_type ? (
                        <Chip label={event.setup_type} size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(event.event_date).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {event.notes ? (
                        <Typography variant="body2" sx={{ maxWidth: 200 }}>
                          {event.notes}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {!isLoading && !error && (!events || events.length === 0) && (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="300px"
            flexDirection="column"
            gap={2}
          >
            <Typography variant="h6" color="text.secondary">
              No trades found for this day
            </Typography>
            <Typography variant="body2" color="text.secondary">
              There may have been trading activity, but no closed positions with realized P&L.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DayDetailsModal;