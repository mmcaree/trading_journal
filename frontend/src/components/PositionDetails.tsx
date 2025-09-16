import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import { 
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  MonetizationOn as MoneyIcon,
  Add as AddIcon,
  Remove as RemoveIcon
} from '@mui/icons-material';
import { getPositionDetails, PositionDetails, PositionEntry, PositionExit } from '../services/tradeService';

interface PositionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  tradeGroupId: string;
  ticker: string;
  onAddToPosition?: () => void;
  onSellPosition?: () => void;
}

const PositionDetailsModal: React.FC<PositionDetailsModalProps> = ({
  open,
  onClose,
  tradeGroupId,
  ticker,
  onAddToPosition,
  onSellPosition
}) => {
  const [details, setDetails] = useState<PositionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && tradeGroupId) {
      loadPositionDetails();
    }
  }, [open, tradeGroupId]);

  const loadPositionDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPositionDetails(tradeGroupId);
      setDetails(data);
    } catch (error) {
      console.error('Error loading position details:', error);
      setError('Failed to load position details');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogContent>
          <Typography>Loading position details...</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogContent>
          <Typography color="error">{error}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h6">Position Details: {ticker}</Typography>
          <Chip 
            label={`Trade Group: ${tradeGroupId}`} 
            variant="outlined" 
            size="small"
          />
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {details && (
          <Box>
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Current Position
                    </Typography>
                    <Typography variant="h6">
                      {details.summary.current_shares} shares
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Avg. Entry: {formatCurrency(details.summary.avg_entry_price)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Total Investment
                    </Typography>
                    <Typography variant="h6">
                      {formatCurrency(details.summary.total_cost)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {details.summary.entries_count} entries
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Realized P&L
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography 
                        variant="h6" 
                        color={details.summary.total_realized_pnl >= 0 ? 'success.main' : 'error.main'}
                      >
                        {formatCurrency(details.summary.total_realized_pnl)}
                      </Typography>
                      {details.summary.total_realized_pnl >= 0 ? 
                        <TrendingUpIcon color="success" fontSize="small" /> : 
                        <TrendingDownIcon color="error" fontSize="small" />
                      }
                    </Box>
                    <Typography variant="body2" color="textSecondary">
                      {details.summary.exits_count} exits
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Shares Traded
                    </Typography>
                    <Typography variant="h6">
                      {details.summary.total_shares_sold} sold
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      of {details.summary.total_shares_bought} bought
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Entries Table */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Entry Positions ({details.entries.length})
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell align="right">Shares</TableCell>
                      <TableCell align="right">Cost</TableCell>
                      <TableCell align="right">Stop Loss</TableCell>
                      <TableCell align="right">Take Profit</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {details.entries.map((entry: PositionEntry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.entry_date)}</TableCell>
                        <TableCell align="right">{formatCurrency(entry.entry_price)}</TableCell>
                        <TableCell align="right">{entry.shares}</TableCell>
                        <TableCell align="right">{formatCurrency(entry.cost)}</TableCell>
                        <TableCell align="right">
                          {entry.stop_loss ? formatCurrency(entry.stop_loss) : '-'}
                        </TableCell>
                        <TableCell align="right">
                          {entry.take_profit ? formatCurrency(entry.take_profit) : '-'}
                        </TableCell>
                        <TableCell>{entry.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Exits Table */}
            {details.exits.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Exit Positions ({details.exits.length})
                </Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Shares</TableCell>
                        <TableCell align="right">Proceeds</TableCell>
                        <TableCell align="right">P&L</TableCell>
                        <TableCell>Notes</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {details.exits.map((exit: PositionExit) => (
                        <TableRow key={exit.id}>
                          <TableCell>{formatDate(exit.exit_date)}</TableCell>
                          <TableCell align="right">{formatCurrency(exit.exit_price)}</TableCell>
                          <TableCell align="right">{exit.shares_sold}</TableCell>
                          <TableCell align="right">{formatCurrency(exit.proceeds)}</TableCell>
                          <TableCell 
                            align="right"
                            sx={{ 
                              color: exit.profit_loss >= 0 ? 'success.main' : 'error.main',
                              fontWeight: 'bold'
                            }}
                          >
                            {formatCurrency(exit.profit_loss)}
                          </TableCell>
                          <TableCell>{exit.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        {onAddToPosition && (
          <Button 
            onClick={onAddToPosition} 
            variant="outlined" 
            startIcon={<AddIcon />}
            color="primary"
          >
            Add to Position
          </Button>
        )}
        {onSellPosition && (
          <Button 
            onClick={onSellPosition} 
            variant="outlined" 
            startIcon={<RemoveIcon />}
            color="secondary"
          >
            Sell Position
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PositionDetailsModal;