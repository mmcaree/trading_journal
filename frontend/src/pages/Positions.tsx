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
  CircularProgress,
  Button,
  IconButton,
  Checkbox,
  Tooltip
} from '@mui/material';
import { 
  Search as SearchIcon,
  Add as AddIcon,
  TrendingDown as SellIcon,
  Security as StopLossIcon,
  Visibility as DetailsIcon,
  Upload as UploadIcon,
  Compare as CompareIcon
} from '@mui/icons-material';
import { getAllPositions, getPositionDetails, Position, PositionDetails } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import AddToPositionModal from '../components/AddToPositionModal';
import SellFromPositionModal from '../components/SellFromPositionModal';
import UpdateStopLossModal from '../components/UpdateStopLossModal';
import PositionDetailsModal from '../components/PositionDetailsModal';
import CreatePositionModal from '../components/CreatePositionModal';
import UniversalImportModal from '../components/UniversalImportModal';
import TagChip from '../components/TagChip';
import { KeyboardShortcutsButton } from '../components/KeyboardShortcutsHelp';
import { useKeyboardShortcuts, createTradingShortcuts } from '../hooks/useKeyboardShortcuts';

const Positions: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [selectedForComparison, setSelectedForComparison] = useState<number[]>([]);
  
  const navigate = useNavigate();
  
  // Modal state
  const [addToPositionModal, setAddToPositionModal] = useState<{
    open: boolean;
    position: Position | null;
  }>({
    open: false,
    position: null
  });
  
  const [sellFromPositionModal, setSellFromPositionModal] = useState<{
    open: boolean;
    position: Position | null;
  }>({
    open: false,
    position: null
  });
  
  const [updateStopLossModal, setUpdateStopLossModal] = useState<{
    open: boolean;
    position: Position | null;
  }>({
    open: false,
    position: null
  });
  
  const [positionDetailsModal, setPositionDetailsModal] = useState<{
    open: boolean;
    position: Position | null;
  }>({
    open: false,
    position: null
  });

  const [createPositionModal, setCreatePositionModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  
  const { formatCurrency } = useCurrency();

  // Keyboard shortcuts for positions page
  const tradingShortcuts = createTradingShortcuts({
    onAddPosition: () => {
      // Open create position modal
      setCreatePositionModal(true);
    },
    onSellPosition: () => {
      // Sell from selected position or first position
      const position = selectedPosition || filteredPositions[0];
      if (position) {
        handleOpenSellFromPosition(position);
      }
    },
    onPositionDetails: () => {
      // Show details for selected position or first position
      const position = selectedPosition || filteredPositions[0];
      if (position) {
        handleOpenPositionDetails(position);
      }
    },
    onRefresh: () => {
      loadPositions();
    },
    onSearch: () => {
      // Focus search input
      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  useKeyboardShortcuts({
    shortcuts: tradingShortcuts,
    enabled: true,
    context: 'positions'
  });

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading open positions from new API...');
      const positionsData = await getAllPositions({ status: 'open', limit: 100 });
      console.log('Loaded positions:', positionsData);
      
      setPositions(positionsData);
    } catch (err: any) {
      console.error('Failed to load positions:', err);
      setError(err.message || 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  const filteredPositions = positions.filter(position =>
    position.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (position.setup_type && position.setup_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (position.strategy && position.strategy.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (position.tags && position.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase())))  // ← ADD THIS LINE
  );

  const paginatedPositions = filteredPositions.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 25));
    setPage(0);
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString();
  };

  // Modal handlers
  const handleOpenAddToPosition = (position: Position) => {
    setAddToPositionModal({ open: true, position });
  };

  const handleCloseAddToPosition = () => {
    setAddToPositionModal({ open: false, position: null });
  };

  const handleAddToPositionSuccess = (updatedPosition: Position) => {
    // Update the position in the list with optimistic update
    setPositions(prev => 
      prev.map(p => p.id === updatedPosition.id ? updatedPosition : p)
    );
  };

  const handleOpenSellFromPosition = (position: Position) => {
    setSellFromPositionModal({ open: true, position });
  };

  const handleCloseSellFromPosition = () => {
    setSellFromPositionModal({ open: false, position: null });
  };

  const handleSellFromPositionSuccess = (updatedPosition: Position) => {
    // Handle both partial sale and complete position closure
    if (updatedPosition.status === 'closed' || updatedPosition.current_shares === 0) {
      // Position was closed, remove from the list
      setPositions(prev => prev.filter(p => p.id !== updatedPosition.id));
    } else {
      // Partial sale, update the position in the list
      setPositions(prev => 
        prev.map(p => p.id === updatedPosition.id ? updatedPosition : p)
      );
    }
  };

  const handleOpenUpdateStopLoss = (position: Position) => {
    setUpdateStopLossModal({ open: true, position });
  };

  const handleCloseUpdateStopLoss = () => {
    setUpdateStopLossModal({ open: false, position: null });
  };

  const handleUpdateStopLossSuccess = (updatedPosition: Position) => {
    // Update the position in the list with new stop loss/take profit levels
    setPositions(prev => 
      prev.map(p => p.id === updatedPosition.id ? updatedPosition : p)
    );
  };

  const handleOpenPositionDetails = (position: Position) => {
    setPositionDetailsModal({ open: true, position });
  };

  const handleClosePositionDetails = () => {
    setPositionDetailsModal({ open: false, position: null });
  };

  const handlePositionDetailsRefresh = () => {
    // Refresh the positions list when details modal is refreshed
    loadPositions();
  };

  // Create Position Modal handlers
  const handleCreatePositionSuccess = (newPosition: Position) => {
    // Refresh positions list to include the new position
    loadPositions();
  };

  // Comparison handlers
  const handleToggleComparison = (positionId: number) => {
    setSelectedForComparison(prev => {
      if (prev.includes(positionId)) {
        return prev.filter(id => id !== positionId);
      } else if (prev.length < 4) {
        return [...prev, positionId];
      }
      return prev;
    });
  };

  const handleComparePositions = () => {
    if (selectedForComparison.length >= 2) {
      navigate(`/compare?ids=${selectedForComparison.join(',')}`);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading positions...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header with title and Create Position button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Open Positions
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {selectedForComparison.length >= 2 && (
            <Button
              variant="contained"
              color="secondary"
              startIcon={<CompareIcon />}
              onClick={handleComparePositions}
              sx={{ height: 'fit-content' }}
            >
              Compare {selectedForComparison.length} Positions
            </Button>
          )}
          <Button
            variant="outlined"
            color="primary"
            startIcon={<UploadIcon />}
            onClick={() => setImportModal(true)}
            sx={{ height: 'fit-content' }}
          >
            Import from Broker
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setCreatePositionModal(true)}
            sx={{ height: 'fit-content' }}
          >
            Create Position
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <Button onClick={loadPositions} sx={{ ml: 2 }}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search positions by ticker, strategy, or setup type... (Ctrl+F)"
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
      </Paper>

      {/* Positions Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                  <Tooltip title="Select up to 4 positions to compare">
                    <span>Compare</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Ticker</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Strategy</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Setup</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Tags</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Shares</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Avg Entry</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Total Cost</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Opened</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPositions.map((position) => (
                <TableRow 
                  key={position.id}
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                    backgroundColor: selectedPosition?.id === position.id 
                      ? 'rgba(25, 118, 210, 0.08)' 
                      : 'transparent',
                    borderLeft: selectedPosition?.id === position.id 
                      ? '3px solid' 
                      : '3px solid transparent',
                    borderLeftColor: 'primary.main'
                  }}
                  onClick={(e) => {
                    // Allow double-click to open details, single click to select
                    if (e.detail === 2) {
                      handleOpenPositionDetails(position);
                    } else {
                      setSelectedPosition(position);
                    }
                  }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedForComparison.includes(position.id)}
                      onChange={() => handleToggleComparison(position.id)}
                      disabled={
                        !selectedForComparison.includes(position.id) &&
                        selectedForComparison.length >= 4
                      }
                      color="primary"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {position.ticker}
                    </Typography>
                  </TableCell>
                  <TableCell>{position.strategy || 'N/A'}</TableCell>
                  <TableCell>{position.setup_type || 'N/A'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 300 }}>
                      {position.tags && position.tags.length > 0 ? (
                        position.tags.map((tag) => (
                          <TagChip key={tag.id} tag={tag} />
                        ))
                      ) : (
                        <Typography variant="body2" color="text.disabled" fontStyle="italic">
                          No tags
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{position.current_shares}</TableCell>
                  <TableCell>{formatCurrency(position.avg_entry_price || 0)}</TableCell>
                  <TableCell>{formatCurrency(position.total_cost)}</TableCell>
                  <TableCell>{formatDate(position.opened_at)}</TableCell>
                  <TableCell>
                    <Chip 
                      label={position.status} 
                      color="success"
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPositionDetails(position);
                        }}
                        title="View Position Details (Ctrl+D)"
                        color="info"
                      >
                        <DetailsIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddToPosition(position);
                        }}
                        title="Add to Position (Ctrl+A)"
                        color="primary"
                      >
                        <AddIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSellFromPosition(position);
                        }}
                        title="Sell from Position (Ctrl+S)"
                        color="warning"
                      >
                        <SellIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenUpdateStopLoss(position);
                        }}
                        title="Update Stop Loss & Take Profit"
                        color="secondary"
                      >
                        <StopLossIcon />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[20, 30, 50, 100]}
          component="div"
          count={filteredPositions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {positions.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            No open positions found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Open positions will appear here once you create some trades.
          </Typography>
        </Paper>
      )}

      {/* Add to Position Modal */}
      {addToPositionModal.position && (
        <AddToPositionModal
          open={addToPositionModal.open}
          onClose={handleCloseAddToPosition}
          position={addToPositionModal.position}
          onSuccess={handleAddToPositionSuccess}
        />
      )}

      {/* Sell from Position Modal */}
      {sellFromPositionModal.position && (
        <SellFromPositionModal
          open={sellFromPositionModal.open}
          onClose={handleCloseSellFromPosition}
          position={sellFromPositionModal.position}
          onSuccess={handleSellFromPositionSuccess}
        />
      )}

      {/* Update Stop Loss Modal */}
      {updateStopLossModal.position && (
        <UpdateStopLossModal
          open={updateStopLossModal.open}
          onClose={handleCloseUpdateStopLoss}
          position={updateStopLossModal.position}
          onSuccess={handleUpdateStopLossSuccess}
        />
      )}

      {/* Position Details Modal */}
      {positionDetailsModal.position && (
        <PositionDetailsModal
          open={positionDetailsModal.open}
          onClose={handleClosePositionDetails}
          position={positionDetailsModal.position}
          onRefresh={handlePositionDetailsRefresh}
        />
      )}

      {/* Create Position Modal */}
      <CreatePositionModal
        open={createPositionModal}
        onClose={() => setCreatePositionModal(false)}
        onSuccess={handleCreatePositionSuccess}
      />

      {/* Universal Import Modal */}
      <UniversalImportModal
        open={importModal}
        onClose={() => setImportModal(false)}
        onImportSuccess={() => {
          loadPositions();
          setImportModal(false);
        }}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsButton shortcuts={tradingShortcuts} />
    </Box>
  );
};

export default Positions;