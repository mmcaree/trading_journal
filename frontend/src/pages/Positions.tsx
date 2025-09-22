import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  InputAdornment,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab
} from '@mui/material';
import { 
  Search as SearchIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Remove as RemoveIcon
} from '@mui/icons-material';
import { fetchTrades, updateTrade, Trade, addToPositionGroup, sellFromPositionGroup, TradeEntryData, PartialExitData, getPositions, getActiveEntries, updatePositionStopLoss, getPositionDetails } from '../services/tradeService';
import { testApiConnection } from '../services/debugService';
import { accountService } from '../services/accountService';
import PositionDetailsModal from '../components/PositionDetails';

interface EditingPosition {
  id: number;
  stopLoss: number;
  takeProfit?: number;
  shares: number;
}

interface AddToPositionData {
  shares: number;
  entryPrice: number;
  stopLoss: number;
  originalStopLoss?: number;  // New field for tracking original stop loss
  notes?: string;
  sharesInput?: string;
  entryPriceInput?: string;
  stopLossInput?: string;
  originalStopLossInput?: string;  // Input string for original stop loss
}

interface SellPositionData {
  shares: number;
  exitPrice: number;
  notes?: string;
  sharesInput?: string;
  exitPriceInput?: string;
}

const Positions: React.FC = () => {
  const [positions, setPositions] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedPosition, setSelectedPosition] = useState<Trade | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [positionDetailsOpen, setPositionDetailsOpen] = useState(false);
  const [positionDetailsRefresh, setPositionDetailsRefresh] = useState<(() => Promise<void>) | null>(null);
  const [editingPosition, setEditingPosition] = useState<EditingPosition | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'edit' | 'add' | 'sell'>('edit');
  const [tabValue, setTabValue] = useState(0);
  const [addPositionData, setAddPositionData] = useState<AddToPositionData>({ 
    shares: 0, 
    entryPrice: 0, 
    stopLoss: 0,
    originalStopLoss: 0,  // Initialize original stop loss
    sharesInput: '',
    entryPriceInput: '',
    stopLossInput: '',
    originalStopLossInput: ''  // Initialize original stop loss input
  });
  const [sellPositionData, setSellPositionData] = useState<SellPositionData>({ 
    shares: 0, 
    exitPrice: 0,
    sharesInput: '',
    exitPriceInput: ''
  });
  const [positionDetails, setPositionDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Test API connection first
      await testApiConnection();
      
      // Use aggregated positions (grouped by trade_group_id)
      const positionsData = await getPositions();
      setPositions(positionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  const handlePositionClick = (position: Trade) => {
    setSelectedPosition(position);
    setPositionDetailsOpen(true);
    loadPositionDetails(position);
  };

  const loadPositionDetails = async (position: Trade) => {
    if (!(position as any).trade_group_id) return;
    
    try {
      setLoadingDetails(true);
      const details = await getPositionDetails((position as any).trade_group_id);
      setPositionDetails(details);
    } catch (error) {
      console.error('Error loading position details:', error);
      setPositionDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenTradingActions = () => {
    setPositionDetailsOpen(false);
    setEditingPosition({
      id: selectedPosition?.id || 0,
      stopLoss: selectedPosition?.stop_loss || 0,
      takeProfit: selectedPosition?.take_profit || 0,
      shares: selectedPosition?.position_size || 0
    });
    
    // Reset form data when opening modal
    setAddPositionData({ 
      shares: 0, 
      entryPrice: 0, 
      stopLoss: 0,
      originalStopLoss: 0,  // Reset original stop loss
      sharesInput: '',
      entryPriceInput: '',
      stopLossInput: '',
      originalStopLossInput: ''  // Reset original stop loss input
    });
    setSellPositionData({ 
      shares: 0, 
      exitPrice: 0,
      sharesInput: '',
      exitPriceInput: ''
    });
    
    setDetailsOpen(true);
    setUpdateError(null);
  };

  const handleOpenAddPosition = () => {
    setTabValue(1);
    handleOpenTradingActions();
  };

  const handleOpenSellPosition = () => {
    setTabValue(2);
    handleOpenTradingActions();
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedPosition(null);
    setEditingPosition(null);
    setUpdateError(null);
    setEditMode('edit');
    setTabValue(0);
    setAddPositionData({ 
      shares: 0, 
      entryPrice: 0, 
      stopLoss: 0,
      originalStopLoss: 0,  // Reset original stop loss
      sharesInput: '',
      entryPriceInput: '',
      stopLossInput: '',
      originalStopLossInput: ''  // Reset original stop loss input
    });
    setSellPositionData({ 
      shares: 0, 
      exitPrice: 0,
      sharesInput: '',
      exitPriceInput: ''
    });
  };

  const handleSaveChanges = async () => {
    if (!selectedPosition) return;

    try {
      setUpdateError(null);
      
      if (tabValue === 0) {
        // Edit Position
        if (!editingPosition) return;
        
        // Check if only stop loss changed - use position-level API
        const originalStopLoss = selectedPosition.stop_loss;
        const newStopLoss = editingPosition.stopLoss;
        const originalShares = selectedPosition.position_size;
        const newShares = editingPosition.shares;
        const originalTakeProfit = selectedPosition.take_profit;
        const newTakeProfit = editingPosition.takeProfit;
        
        const onlyStopLossChanged = (
          newStopLoss !== originalStopLoss &&
          newShares === originalShares &&
          newTakeProfit === originalTakeProfit
        );
        
        if (onlyStopLossChanged) {
          // Use position-level stop loss update API
          await updatePositionStopLoss((selectedPosition as any).trade_group_id || selectedPosition.id, newStopLoss);
        } else {
          // Use traditional trade update for other changes
          const updateData = {
            id: editingPosition.id,
            stopLoss: editingPosition.stopLoss.toString(),
            takeProfit: editingPosition.takeProfit?.toString() || '',
            shares: editingPosition.shares.toString(),
            // Keep other fields the same
            ticker: selectedPosition.ticker,
            direction: selectedPosition.displayDirection || selectedPosition.trade_type,
            entryPrice: ((selectedPosition as any).entryPrice || selectedPosition.entry_price).toString(),
            strategy: selectedPosition.strategy,
            setupType: selectedPosition.setup_type,
            timeframe: selectedPosition.timeframe || '',
            entryDate: (selectedPosition as any).entryDate || selectedPosition.entry_date
          };

          await updateTrade(updateData);
        }
        
      } else if (tabValue === 1) {
        // Add to Position
        const originalEntryDate = (selectedPosition as any).entryDate || selectedPosition.entry_date;
        const formattedDate = new Date(originalEntryDate).toLocaleDateString();
        const autoNote = `Add to original position from ${formattedDate}`;
        const finalNotes = addPositionData.notes ? `${autoNote}. ${addPositionData.notes}` : autoNote;
        
        const entryData: TradeEntryData = {
          entry_price: addPositionData.entryPrice,
          entry_date: new Date().toISOString(),
          shares: addPositionData.shares,
          stop_loss: addPositionData.stopLoss,
          original_stop_loss: addPositionData.originalStopLoss,  // Include original stop loss
          notes: finalNotes
        };

        await addToPositionGroup((selectedPosition as any).trade_group_id || selectedPosition.id, entryData);
        
      } else if (tabValue === 2) {
        // Sell Position
        const exitData: PartialExitData = {
          exit_price: sellPositionData.exitPrice,
          exit_date: new Date().toISOString(),
          shares_sold: sellPositionData.shares,
          profit_loss: sellPositionData.shares * (sellPositionData.exitPrice - (((selectedPosition as any).entryPrice || selectedPosition.entry_price) || 0)),
          notes: sellPositionData.notes
        };

        await sellFromPositionGroup((selectedPosition as any).trade_group_id || selectedPosition.id, exitData);
      }
      
      // Refresh positions list
      await loadPositions();
      
      // Trigger Position Details modal refresh (if it's open)
      if (positionDetailsOpen && positionDetailsRefresh) {
        await positionDetailsRefresh();
      }
      
      // Close modal
      handleCloseDetails();
      
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update position');
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setUpdateError(null);
  };

  const filteredPositions = positions.filter(position =>
    position.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    position.setup_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedPositions = filteredPositions.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) return 'default';
    switch (status.toLowerCase()) {
      case 'open': return 'success';
      case 'active': return 'success';
      case 'planned': return 'warning';
      case 'closed': return 'default';
      default: return 'default';
    }
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A';
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Typography>Loading positions...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Open Positions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search positions by ticker or setup..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ticker</TableCell>
                <TableCell>Entry Price</TableCell>
                <TableCell>Shares</TableCell>
                <TableCell>Stop Loss (Average)</TableCell>
                <TableCell>Open Risk %</TableCell>
                <TableCell>Original Risk %</TableCell>
                <TableCell>Realized P&L</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPositions.map((position) => (
                <TableRow 
                  key={position.id}
                  hover
                  onClick={() => handlePositionClick(position)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {position.ticker}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatCurrency((position as any).entryPrice || position.entry_price)}</TableCell>
                  <TableCell>{(position as any).current_shares || position.position_size}</TableCell>
                  <TableCell>
                    {position.stop_loss ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {formatCurrency(position.stop_loss)}
                        {(position as any).total_shares_bought > position.position_size && (
                          <Chip 
                            label="Avg" 
                            size="small" 
                            variant="outlined" 
                            color="primary"
                            sx={{ fontSize: '0.75rem', height: '20px' }}
                          />
                        )}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="error">
                        No Stop
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {(position as any).current_risk_percent !== undefined 
                      ? `${(position as any).current_risk_percent.toFixed(2)}%`
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    {(position as any).original_risk_percent !== undefined 
                      ? `${(position as any).original_risk_percent.toFixed(2)}%`
                      : `${accountService.calculateOriginalRiskPercent(
                          (position as any).total_shares_bought || position.position_size || 0,
                          ((position as any).entryPrice || position.entry_price) || 0,
                          position.stop_loss || 0
                        ).toFixed(2)}%`
                    }
                  </TableCell>
                  <TableCell>
                    <Typography 
                      color={(position as any).realized_pnl >= 0 ? 'success.main' : 'error.main'}
                      fontWeight="bold"
                    >
                      {formatCurrency((position as any).realized_pnl || 0)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredPositions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Position Details Modal with Inline Editing */}
      <Dialog 
        open={detailsOpen} 
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              Edit Position: {selectedPosition?.ticker}
            </Typography>
            <Chip 
              label={selectedPosition?.status || 'Unknown'} 
              color={getStatusColor(selectedPosition?.status) as any}
              size="small"
            />
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {updateError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {updateError}
            </Alert>
          )}
          
          {selectedPosition && editingPosition && (
            <>
              {/* Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tabValue} onChange={handleTabChange}>
                  <Tab label="Edit Position" />
                  <Tab label="Add to Position" />
                  <Tab label="Sell Position" />
                </Tabs>
              </Box>

              {/* Position Info - Always visible */}
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>Position Details</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="body2">
                        <strong>Entry Date:</strong> {new Date((selectedPosition as any).entryDate || selectedPosition.entry_date).toLocaleDateString()}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Entry Price:</strong> {formatCurrency((selectedPosition as any).entryPrice || selectedPosition.entry_price)}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Current Shares:</strong> {selectedPosition.position_size}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Strategy:</strong> {selectedPosition.strategy}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Setup:</strong> {selectedPosition.setup_type}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Timeframe:</strong> {selectedPosition.timeframe || 'N/A'}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
                
                {/* Tab Content */}
                <Grid item xs={12} md={6}>
                  {tabValue === 0 && (
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>Edit Position</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                          label="Shares"
                          type="number"
                          value={editingPosition.shares}
                          onChange={(e) => setEditingPosition({
                            ...editingPosition,
                            shares: parseFloat(e.target.value) || 0
                          })}
                          fullWidth
                        />
                        <TextField
                          label="Stop Loss"
                          type="number"
                          inputProps={{ step: "0.01" }}
                          value={editingPosition.stopLoss}
                          onChange={(e) => setEditingPosition({
                            ...editingPosition,
                            stopLoss: parseFloat(e.target.value) || 0
                          })}
                          fullWidth
                          helperText="Can be set above entry price for protective stops"
                        />
                      </Box>
                    </Paper>
                  )}

                  {tabValue === 1 && (
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>Add to Position</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                          label="Additional Shares"
                          type="number"
                          value={addPositionData.sharesInput}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            setAddPositionData({
                              ...addPositionData,
                              sharesInput: inputValue,
                              shares: parseFloat(inputValue) || 0
                            });
                          }}
                          onFocus={(e) => e.target.select()}
                          fullWidth
                        />
                        <TextField
                          label="Entry Price"
                          type="number"
                          inputProps={{ step: "0.01" }}
                          value={addPositionData.entryPriceInput}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            setAddPositionData({
                              ...addPositionData,
                              entryPriceInput: inputValue,
                              entryPrice: parseFloat(inputValue) || 0
                            });
                          }}
                          onFocus={(e) => e.target.select()}
                          fullWidth
                        />
                        <TextField
                          label="Stop Loss"
                          type="number"
                          inputProps={{ step: "0.01" }}
                          value={addPositionData.stopLossInput}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            setAddPositionData({
                              ...addPositionData,
                              stopLossInput: inputValue,
                              stopLoss: parseFloat(inputValue) || 0
                            });
                          }}
                          onFocus={(e) => e.target.select()}
                          fullWidth
                        />
                        <TextField
                          label="Original Stop Loss"
                          type="number"
                          inputProps={{ step: "0.01" }}
                          value={addPositionData.originalStopLossInput}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            setAddPositionData({
                              ...addPositionData,
                              originalStopLossInput: inputValue,
                              originalStopLoss: parseFloat(inputValue) || 0
                            });
                          }}
                          onFocus={(e) => e.target.select()}
                          helperText="Original stop loss when this entry was made (for risk calculation)"
                          fullWidth
                        />
                        <TextField
                          label="Notes (Optional)"
                          multiline
                          rows={2}
                          value={addPositionData.notes || ''}
                          onChange={(e) => setAddPositionData({
                            ...addPositionData,
                            notes: e.target.value
                          })}
                          fullWidth
                        />
                      </Box>
                    </Paper>
                  )}

                  {tabValue === 2 && (
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>Sell Position</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                          label="Shares to Sell"
                          type="number"
                          value={sellPositionData.sharesInput}
                          onChange={(e) => setSellPositionData({
                            ...sellPositionData,
                            sharesInput: e.target.value,
                            shares: parseFloat(e.target.value) || 0
                          })}
                          fullWidth
                          helperText={`Max: ${(selectedPosition as any).current_shares} shares`}
                        />
                        <TextField
                          label="Exit Price"
                          type="number"
                          inputProps={{ step: "0.01" }}
                          value={sellPositionData.exitPriceInput}
                          onChange={(e) => setSellPositionData({
                            ...sellPositionData,
                            exitPriceInput: e.target.value,
                            exitPrice: parseFloat(e.target.value) || 0
                          })}
                          fullWidth
                        />
                        <TextField
                          label="Notes (Optional)"
                          multiline
                          rows={2}
                          value={sellPositionData.notes || ''}
                          onChange={(e) => setSellPositionData({
                            ...sellPositionData,
                            notes: e.target.value
                          })}
                          fullWidth
                        />
                      </Box>
                    </Paper>
                  )}
                </Grid>
              </Grid>
            </>
          )}
        </DialogContent>        <DialogActions>
          <Button 
            onClick={handleCloseDetails}
            startIcon={<CancelIcon />}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSaveChanges}
            variant="contained"
            startIcon={<SaveIcon />}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Position Details Modal */}
      <PositionDetailsModal
        open={positionDetailsOpen}
        onClose={() => {
          setPositionDetailsOpen(false);
          setSelectedPosition(null);
          setPositionDetailsRefresh(null); // Clear the refresh callback
        }}
        tradeGroupId={(selectedPosition as any)?.trade_group_id || ''}
        ticker={selectedPosition?.ticker || ''}
        onAddToPosition={handleOpenAddPosition}
        onSellPosition={handleOpenSellPosition}
        onPositionUpdated={loadPositions} // Add refresh callback
        onRefreshReady={(refreshFn) => setPositionDetailsRefresh(() => refreshFn)} // Pass refresh function setter
      />
    </Box>
  );
};

export default Positions;
