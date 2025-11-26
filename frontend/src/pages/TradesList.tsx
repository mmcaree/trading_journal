import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress
} from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Visibility as VisibilityIcon,
  TrendingUp as AddSharesIcon,
  TrendingDown as SellSharesIcon,
  Assessment as DetailsIcon
} from '@mui/icons-material';
import { getAllPositions, Position, deletePosition } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import PositionDetailsModal from '../components/PositionDetailsModal';
import AddToPositionModal from '../components/AddToPositionModal';
import SellFromPositionModal from '../components/SellFromPositionModal';
import { KeyboardShortcutsButton } from '../components/KeyboardShortcutsHelp';
import { useKeyboardShortcuts, createTradingShortcuts } from '../hooks/useKeyboardShortcuts';

const TradesList: React.FC = () => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Position>('opened_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    strategy: '',
    setup_type: ''
  });

  // Modal state for position details
  const [positionDetailsModal, setPositionDetailsModal] = useState<{
    open: boolean;
    position: Position | null;
  }>({
    open: false,
    position: null
  });

  // Modal state for add/sell position actions
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

  // Keyboard shortcuts for trades list page
  const tradingShortcuts = createTradingShortcuts({
    onPositionDetails: () => {
      // Show details for first filtered position
      if (filteredPositions.length > 0) {
        handleOpenPositionDetails(filteredPositions[0]);
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
    },
    onFilter: () => {
      setFilterDialogOpen(true);
    }
  });

  useKeyboardShortcuts({
    shortcuts: tradingShortcuts,
    enabled: true,
    context: 'trades-list'
  });

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading all positions from new API...');
      const positionsData = await getAllPositions({ limit: 100000 }); // Get all positions
      console.log('Loaded positions:', positionsData);
      
      setPositions(positionsData);
    } catch (err: any) {
      console.error('Failed to load positions:', err);
      setError(err.message || 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePosition = async (id: number) => {
    if (!confirm('Are you sure you want to delete this position? This action cannot be undone.')) {
      return;
    }

    try {
      await deletePosition(id);
      setPositions(positions.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete position');
    }
  };

  const handleSort = (field: keyof Position) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: keyof Position) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />;
  };

  // Modal handlers
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

  // Add/Sell modal handlers
  const handleOpenAddToPosition = (position: Position) => {
    setAddToPositionModal({ open: true, position });
  };

  const handleCloseAddToPosition = () => {
    setAddToPositionModal({ open: false, position: null });
  };

  const handleOpenSellFromPosition = (position: Position) => {
    setSellFromPositionModal({ open: true, position });
  };

  const handleCloseSellFromPosition = () => {
    setSellFromPositionModal({ open: false, position: null });
  };

  const handlePositionUpdate = () => {
    // Refresh positions after add/sell operations
    loadPositions();
    handleCloseAddToPosition();
    handleCloseSellFromPosition();
  };

  // Filter positions based on search and filters
  const filteredPositions = positions.filter(position => {
    const matchesSearch = !searchTerm || (
      position.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (position.strategy && position.strategy.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (position.setup_type && position.setup_type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (position.notes && position.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const matchesStatus = !filters.status || position.status === filters.status;
    const matchesStrategy = !filters.strategy || position.strategy === filters.strategy;
    const matchesSetupType = !filters.setup_type || position.setup_type === filters.setup_type;
    
    const matchesDateFrom = !filters.dateFrom || new Date(position.opened_at) >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || new Date(position.opened_at) <= new Date(filters.dateTo);

    return matchesSearch && matchesStatus && matchesStrategy && matchesSetupType && matchesDateFrom && matchesDateTo;
  });

  // Sort positions
  const sortedPositions = [...filteredPositions].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    
    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }
    
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const paginatedPositions = sortedPositions.slice(
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

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString();
  };

  const calculatePnL = (position: Position): number => {
    if (position.status === 'open') {
      return 0; // Would need current price to calculate unrealized PnL
    }
    return position.total_realized_pnl || 0;
  };

  const calculateReturn = (position: Position): number | null => {
    // Use the return percentage calculated by the backend
    return position.return_percent || null;
  };

  const applyFilters = () => {
    setPage(0); // Reset to first page when filters change
    setFilterDialogOpen(false);
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      dateFrom: '',
      dateTo: '',
      strategy: '',
      setup_type: ''
    });
    setSearchTerm('');
    setPage(0);
  };

  // Get unique values for filter dropdowns
  const uniqueStrategies = [...new Set(positions.map(p => p.strategy).filter(Boolean))];
  const uniqueSetupTypes = [...new Set(positions.map(p => p.setup_type).filter(Boolean))];

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <div>
          <Typography variant="h4" gutterBottom>
            All Positions
          </Typography>
        </div>
        <Button
          component={Link}
          to="/positions"
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ height: 'fit-content' }}
        >
          Go to Positions
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <Button onClick={loadPositions} sx={{ ml: 2 }}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Search and Filter Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              placeholder="Search by ticker, strategy, setup type, or notes... (Ctrl+F)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<FilterListIcon />}
                onClick={() => setFilterDialogOpen(true)}
              >
                Filters
              </Button>
              <Button variant="outlined" onClick={clearFilters}>
                Clear
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Positions Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Button
                    onClick={() => handleSort('ticker')}
                    endIcon={getSortIcon('ticker')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Ticker
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('strategy')}
                    endIcon={getSortIcon('strategy')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Strategy
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('setup_type')}
                    endIcon={getSortIcon('setup_type')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Setup
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('current_shares')}
                    endIcon={getSortIcon('current_shares')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Shares
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('avg_entry_price')}
                    endIcon={getSortIcon('avg_entry_price')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Avg Entry
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('total_cost')}
                    endIcon={getSortIcon('total_cost')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Total Cost
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('opened_at')}
                    endIcon={getSortIcon('opened_at')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Opened
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('closed_at')}
                    endIcon={getSortIcon('closed_at')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Closed
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('total_realized_pnl')}
                    endIcon={getSortIcon('total_realized_pnl')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    P&L
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('return_percent')}
                    endIcon={getSortIcon('return_percent')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Return %
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleSort('status')}
                    endIcon={getSortIcon('status')}
                    sx={{ textTransform: 'none', fontWeight: 'bold' }}
                  >
                    Status
                  </Button>
                </TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPositions.map((position) => {
                const pnl = calculatePnL(position);
                const returnPercent = calculateReturn(position);
                
                return (
                  <TableRow 
                    key={position.id}
                    sx={{ 
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                      cursor: 'pointer'
                    }}
                    onClick={() => handleOpenPositionDetails(position)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {position.ticker}
                      </Typography>
                    </TableCell>
                    <TableCell>{position.strategy || 'N/A'}</TableCell>
                    <TableCell>{position.setup_type || 'N/A'}</TableCell>
                    <TableCell>{position.current_shares}</TableCell>
                    <TableCell>{formatCurrency(position.avg_entry_price || 0)}</TableCell>
                    <TableCell>{formatCurrency(position.total_cost)}</TableCell>
                    <TableCell>{formatDate(position.opened_at)}</TableCell>
                    <TableCell>
                      {position.closed_at ? formatDate(position.closed_at) : '-'}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={pnl >= 0 ? 'success.main' : 'error.main'}
                        fontWeight="bold"
                      >
                        {formatCurrency(pnl)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {returnPercent !== null ? (
                        <Typography
                          variant="body2"
                          color={returnPercent >= 0 ? 'success.main' : 'error.main'}
                          fontWeight="bold"
                        >
                          {returnPercent.toFixed(2)}%
                        </Typography>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={position.status} 
                        color={position.status === 'open' ? 'success' : 'default'}
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
                          title="View Position Analytics"
                          color="info"
                        >
                          <DetailsIcon />
                        </IconButton>
                        
                        {position.status === 'open' ? (
                          // Open position actions - same as Positions page
                          <>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAddToPosition(position);
                              }}
                              title="Add to Position (Ctrl+A)"
                              color="success"
                            >
                              <AddSharesIcon />
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
                              <SellSharesIcon />
                            </IconButton>
                          </>
                        ) : (
                          <>
                          </>
                        )}
                        
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePosition(position.id);
                          }}
                          title="Delete"
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50, 100]}
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
            No positions found
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Start by creating your first position to track your trades.
          </Typography>
          <Button
            component={Link}
            to="/positions/new"
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ mt: 2 }}
          >
            Add First Position
          </Button>
        </Paper>
      )}

      {/* Filter Dialog */}
      <Dialog open={filterDialogOpen} onClose={() => setFilterDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Filter Positions</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Strategy</InputLabel>
                <Select
                  value={filters.strategy}
                  label="Strategy"
                  onChange={(e) => setFilters({...filters, strategy: e.target.value})}
                >
                  <MenuItem value="">All</MenuItem>
                  {uniqueStrategies.map(strategy => (
                    <MenuItem key={strategy} value={strategy}>{strategy}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Setup Type</InputLabel>
                <Select
                  value={filters.setup_type}
                  label="Setup Type"
                  onChange={(e) => setFilters({...filters, setup_type: e.target.value})}
                >
                  <MenuItem value="">All</MenuItem>
                  {uniqueSetupTypes.map(setup => (
                    <MenuItem key={setup} value={setup}>{setup}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date From"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date To"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFilterDialogOpen(false)}>Cancel</Button>
          <Button onClick={clearFilters}>Clear All</Button>
          <Button onClick={applyFilters} variant="contained">Apply Filters</Button>
        </DialogActions>
      </Dialog>

      {/* Position Details Modal */}
      {positionDetailsModal.position && (
        <PositionDetailsModal
          position={positionDetailsModal.position}
          open={positionDetailsModal.open}
          onClose={handleClosePositionDetails}
          onRefresh={handlePositionDetailsRefresh}
        />
      )}

      {/* Add to Position Modal */}
      {addToPositionModal.position && (
        <AddToPositionModal
          position={addToPositionModal.position}
          open={addToPositionModal.open}
          onClose={handleCloseAddToPosition}
          onSuccess={handlePositionUpdate}
        />
      )}

      {/* Sell from Position Modal */}
      {sellFromPositionModal.position && (
        <SellFromPositionModal
          position={sellFromPositionModal.position}
          open={sellFromPositionModal.open}
          onClose={handleCloseSellFromPosition}
          onSuccess={handlePositionUpdate}
        />
      )}

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsButton shortcuts={tradingShortcuts} />
    </Box>
  );
};

export default TradesList;