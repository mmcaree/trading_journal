import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Pagination,
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
import { getPositionsPaginated, Position } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddToPositionModal from '../components/AddToPositionModal';
import SellFromPositionModal from '../components/SellFromPositionModal';
import UpdateStopLossModal from '../components/UpdateStopLossModal';
import PositionDetailsModal from '../components/PositionDetailsModal';
import CreatePositionModal from '../components/CreatePositionModal';
import UniversalImportModal from '../components/UniversalImportModal';
import TagChip from '../components/TagChip';
import { KeyboardShortcutsButton } from '../components/KeyboardShortcutsHelp';
import { useKeyboardShortcuts, createTradingShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePrefetch, POSITIONS_PAGINATED_KEY, CACHE_TTL } from '../hooks/usePrefetch';


const Positions: React.FC = () => {
  const [selectedForComparison, setSelectedForComparison] = useState<number[]>([]);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get params from URL or use defaults
  const page = parseInt(searchParams.get('page') || '1', 10);
  const searchQuery = searchParams.get('search') || '';
  
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
  const [hoveredPositionId, setHoveredPositionId] = useState<number | null>(null);

  
  const { formatCurrency } = useCurrency();
  const { prefetchPositionDetails, prefetchNextPage } = usePrefetch();

  // React Query integration for paginated positions
  const { 
    data, 
    isLoading: loading, 
    error: queryError,
    refetch: refetchPositions 
  } = useQuery({
    queryKey: [POSITIONS_PAGINATED_KEY, page, searchQuery],
    queryFn: () => getPositionsPaginated(page, 50, {
      status: 'open',
      search: searchQuery || undefined
    }),
    staleTime: CACHE_TTL.POSITIONS_LIST_STALE, // 30 seconds
    gcTime: CACHE_TTL.POSITIONS_LIST_GC, // 5 minutes
  });

  const positions = data?.positions || [];
  const totalPositions = data?.total || 0;
  const totalPages = data?.pages || 0;
  const error = queryError ? (queryError as Error).message : null;

  // Prefetch next page
  React.useEffect(() => {
    if (page < totalPages) {
      prefetchNextPage(page, 50, searchQuery);
    }
  }, [page, totalPages, searchQuery, prefetchNextPage]);

  // No client-side filtering needed - server handles it
  const paginatedPositions = positions;

  // Keyboard shortcuts for positions page
  const tradingShortcuts = createTradingShortcuts({
    onAddPosition: () => {
      setCreatePositionModal(true);
    },
    onSellPosition: () => {
      const position = selectedPosition || positions[0];
      if (position) {
        handleOpenSellFromPosition(position);
      }
    },
    onPositionDetails: () => {
      const position = selectedPosition || positions[0];
      if (position) {
        handleOpenPositionDetails(position);
      }
    },
    onRefresh: () => {
      refetchPositions();
    },
    onSearch: () => {
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

  React.useEffect(() => {
    if (hoveredPositionId) {
      const timer = setTimeout(() => {
        prefetchPositionDetails(hoveredPositionId);
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [hoveredPositionId, prefetchPositionDetails]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setSearchParams(prev => {
      prev.set('page', newPage.toString());
      return prev;
    });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (event.target.value) {
        newParams.set('search', event.target.value);
      } else {
        newParams.delete('search');
      }
      newParams.set('page', '1'); // Reset to page 1 on search
      return newParams;
    });
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

  const handleAddToPositionSuccess = () => {
    refetchPositions();
  };

  const handleOpenSellFromPosition = (position: Position) => {
    setSellFromPositionModal({ open: true, position });
  };

  const handleCloseSellFromPosition = () => {
    setSellFromPositionModal({ open: false, position: null });
  };

  const handleSellFromPositionSuccess = () => {
    refetchPositions();
  };

  const handleOpenUpdateStopLoss = (position: Position) => {
    setUpdateStopLossModal({ open: true, position });
  };

  const handleCloseUpdateStopLoss = () => {
    setUpdateStopLossModal({ open: false, position: null });
  };

  const handleUpdateStopLossSuccess = () => {
    refetchPositions();
  };

  const handleOpenPositionDetails = (position: Position) => {
    setPositionDetailsModal({ open: true, position });
  };

  const handleClosePositionDetails = () => {
    setPositionDetailsModal({ open: false, position: null });
  };

  const handlePositionDetailsRefresh = () => {
    refetchPositions();
  };

  const handleCreatePositionSuccess = () => {
    refetchPositions();
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
          <Button onClick={() => refetchPositions()} sx={{ ml: 2 }}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search positions by ticker, strategy, setup, or tag... (Ctrl+F)"
          value={searchQuery}
          onChange={handleSearchChange}
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
        {/* Pagination Info */}
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {positions.length === 0 ? 0 : ((page - 1) * 50) + 1}-{Math.min(page * 50, totalPositions)} of {totalPositions} positions
          </Typography>
          <Pagination 
            count={totalPages} 
            page={page} 
            onChange={handleChangePage}
            color="primary"
            size="small"
          />
        </Box>

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
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Risk</TableCell>
                <TableCell sx={{ color: 'primary.main', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPositions.map((position) => (
                <TableRow 
                  key={position.id}
                  hover
                  onMouseEnter={() => setHoveredPositionId(position.id)}
                  onMouseLeave={() => setHoveredPositionId(null)}
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
                    {position.original_risk_percent != null ? (
                      <Tooltip
                        title={
                          <Box>
                            <Typography variant="body2">
                              Original risk when position was opened
                            </Typography>
                            <Typography variant="caption">
                              {position.original_risk_percent.toFixed(2)}% of account
                              <br />
                              Account value: {formatCurrency(position.account_value_at_entry || 0)}
                              <br />
                              Date: {new Date(position.opened_at).toLocaleDateString()}
                            </Typography>
                          </Box>
                        }
                        arrow
                      >
                        <Chip
                          label={`${position.original_risk_percent.toFixed(2)}%`}
                          size="small"
                          color={
                            position.original_risk_percent > 5
                              ? 'error'
                              : position.original_risk_percent > 3
                              ? 'warning'
                              : 'success'
                          }
                          variant="outlined"
                          sx={{
                            fontWeight: 'bold',
                            borderWidth: 2,
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    )}
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

        {/* Bottom pagination */}
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
          <Pagination 
            count={totalPages} 
            page={page} 
            onChange={handleChangePage}
            color="primary"
          />
        </Box>
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
          refetchPositions();
          setImportModal(false);
        }}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsButton shortcuts={tradingShortcuts} />
    </Box>
  );
};

export default Positions;