import React, { useState, useEffect, useCallback } from 'react';
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
  CardContent,
  TextField,
  IconButton
} from '@mui/material';
import { 
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  MonetizationOn as MoneyIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { getPositionDetails, PositionDetails, PositionEntry, PositionExit, OpenOrderGroup, updateTradeEntryStopLoss, updateTradeEntryNotes, updatePositionGroupStopLoss } from '../services/tradeService';

interface PositionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  tradeGroupId: string;
  ticker: string;
  onAddToPosition?: () => void;
  onSellPosition?: () => void;
  onPositionUpdated?: () => void; // Add callback for when position is updated
  onRefreshReady?: (refreshFn: () => Promise<void>) => void; // Callback to provide refresh function
}

const PositionDetailsModal: React.FC<PositionDetailsModalProps> = ({
  open,
  onClose,
  tradeGroupId,
  ticker,
  onAddToPosition,
  onSellPosition,
  onPositionUpdated,
  onRefreshReady
}) => {
  const [details, setDetails] = useState<PositionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for editing
  const [editingStopLoss, setEditingStopLoss] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [tempStopLoss, setTempStopLoss] = useState<string>('');
  const [tempNotes, setTempNotes] = useState<string>('');

  const loadPositionDetails = useCallback(async () => {
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
  }, [tradeGroupId]);

  useEffect(() => {
    if (open && tradeGroupId) {
      loadPositionDetails();
    }
  }, [open, tradeGroupId, loadPositionDetails]);

  // Separate effect for providing the refresh function to avoid infinite loops
  useEffect(() => {
    if (open && onRefreshReady) {
      onRefreshReady(loadPositionDetails);
    }
  }, [open, onRefreshReady, loadPositionDetails]);

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

  const handleEditStopLoss = (orderId: string, currentValue: number) => {
    setEditingStopLoss(orderId);
    setTempStopLoss(currentValue.toString());
  };

  const handleSaveStopLoss = async (orderId: string) => {
    try {
      // Find the order to get current stop loss
      const order = details?.open_orders?.find(o => o.id === orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      
      const currentStopLoss = order.stop_loss;
      const newStopLoss = parseFloat(tempStopLoss);
      
      if (!details?.trade_group_id) {
        throw new Error('Trade group ID not found');
      }
      
      // Call the API to update the position group stop loss
      await updatePositionGroupStopLoss(details.trade_group_id, currentStopLoss, newStopLoss);
      
      setEditingStopLoss(null);
      setTempStopLoss('');
      
      // Reload details after save
      await loadPositionDetails();
      
      // Trigger refresh of main positions page
      if (onPositionUpdated) {
        onPositionUpdated();
      }
    } catch (error) {
      console.error('Error saving stop loss:', error);
      alert(`Error updating stop loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelStopLoss = () => {
    setEditingStopLoss(null);
    setTempStopLoss('');
  };

  const handleEditNotes = (entryId: number, currentValue: string) => {
    setEditingNotes(entryId);
    setTempNotes(currentValue);
  };

  const handleSaveNotes = async (entryId: number) => {
    try {
      await updateTradeEntryNotes(entryId, tempNotes);
      setEditingNotes(null);
      setTempNotes('');
      // Reload details after save
      await loadPositionDetails();
      // Trigger refresh of main positions page
      if (onPositionUpdated) {
        onPositionUpdated();
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      // You might want to show an error message to the user here
    }
  };

  const handleCancelNotes = () => {
    setEditingNotes(null);
    setTempNotes('');
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

            {/* Positions Table - What we have LEFT */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Positions ({(details.open_orders || []).length})
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Current remaining lots with stop losses
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Price</TableCell>
                      <TableCell>Shares</TableCell>
                      <TableCell>Stop Loss</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(details.open_orders || []).map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell>{formatCurrency(order.avg_entry_price)}</TableCell>
                        <TableCell>{order.shares}</TableCell>
                        <TableCell>
                          {editingStopLoss === order.id ? (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <TextField
                                size="small"
                                value={tempStopLoss}
                                onChange={(e) => setTempStopLoss(e.target.value)}
                                type="number"
                                inputProps={{ step: "0.01" }}
                                sx={{ width: 80 }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => handleSaveStopLoss(order.id)}
                                color="primary"
                              >
                                <CheckIcon />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={handleCancelStopLoss}
                                color="secondary"
                              >
                                <CloseIcon />
                              </IconButton>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{order.stop_loss ? formatCurrency(order.stop_loss) : '-'}</span>
                              <IconButton
                                size="small"
                                onClick={() => handleEditStopLoss(order.id, order.stop_loss || 0)}
                                sx={{ ml: 1 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.notes || `Open order @ ${formatCurrency(order.stop_loss || 0)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Entries Table - Original Purchase History */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Entries ({details.entries?.length || 0})
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Original purchase history (full amounts before any exits)
              </Typography>
              {details.entries && details.entries.length > 0 ? (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Shares</TableCell>
                        <TableCell>Notes</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(details.entries || []).map((entry: PositionEntry) => (
                        <TableRow key={`entry-${entry.id}`}>
                          <TableCell>{formatDate(entry.entry_date)}</TableCell>
                          <TableCell align="right">{formatCurrency(entry.entry_price)}</TableCell>
                          <TableCell align="right">{entry.shares}</TableCell>
                          <TableCell>
                            {entry.notes || `Purchase @ ${formatCurrency(entry.entry_price)}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No purchase history available
                </Typography>
              )}
            </Box>

            {/* Exits Table */}
            {details.exits && details.exits.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Exits ({details.exits.length})
                </Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Shares</TableCell>
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