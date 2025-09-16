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
  Grid
} from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { fetchTrades, deleteTrade, Trade as ServiceTrade } from '../services/tradeService';
import { testApiConnection } from '../services/debugService';

// TODo: this is a mess, should just use the main Trade interface
// TODO: cleanup later
interface Trade {
  id: number;
  ticker: string;
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  strategy: string;
  risk_percent?: number;
  total_risk?: number;
  status: 'Open' | 'Closed';
  result: number | null;
  notes: string;
  setup_type?: string;
}

const TradesList: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<{status: string, message: string} | null>(null);  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Trade>('entryDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    minProfit: '',
    maxProfit: ''
  });

  // Helper function to get URL search params
  const getSearchParams = () => new URLSearchParams(location.search);
  
  // Helper function to update URL with current filter state
  const updateURL = (newFilters: typeof filters, newSearchTerm: string) => {
    const searchParams = new URLSearchParams();
    
    // Add filters to URL if they have values
    if (newSearchTerm) searchParams.set('search', newSearchTerm);
    if (newFilters.status) searchParams.set('status', newFilters.status);
    if (newFilters.dateFrom) searchParams.set('dateFrom', newFilters.dateFrom);
    if (newFilters.dateTo) searchParams.set('dateTo', newFilters.dateTo);
    if (newFilters.minProfit) searchParams.set('minProfit', newFilters.minProfit);
    if (newFilters.maxProfit) searchParams.set('maxProfit', newFilters.maxProfit);
    
    // Update URL without triggering navigation
    const newSearch = searchParams.toString();
    const newURL = newSearch ? `${location.pathname}?${newSearch}` : location.pathname;
    navigate(newURL, { replace: true });
  };

  // Restore filters from URL on component mount
  useEffect(() => {
    const searchParams = getSearchParams();
    
    const restoredFilters = {
      status: searchParams.get('status') || '',
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      minProfit: searchParams.get('minProfit') || '',
      maxProfit: searchParams.get('maxProfit') || ''
    };
    
    const restoredSearchTerm = searchParams.get('search') || '';
    
    setFilters(restoredFilters);
    setSearchTerm(restoredSearchTerm);
  }, []);

  // Update URL when filters or search term change
  useEffect(() => {
    updateURL(filters, searchTerm);
  }, [filters, searchTerm]);

  // Clear filters when navigating away from trades (to main pages like dashboard, import, analytics)
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Check if we're navigating away from any trades-related page to a main page
    const isMainPage = ['/', '/import', '/analytics', '/settings'].includes(currentPath);
    const isTradesPage = currentPath.startsWith('/trades');
    
    // If we're on a main page and not on trades, clear any stored filters in URL
    if (isMainPage && !isTradesPage) {
      // Clear filters from sessionStorage if it exists
      sessionStorage.removeItem('tradesFilters');
    }
  }, [location.pathname]);

  // Load trades function (moved outside useEffect so it can be reused)
  const loadTrades = async () => {
    try {
      setLoading(true);
      
      // First test API connection
      const connectionResult = await testApiConnection();
      setApiStatus(connectionResult);
      
      if (connectionResult.status === 'success') {
        console.log('TradesList: API connection successful, now fetching trades...');
        const fetchedTrades = await fetchTrades();
        console.log('Trades loaded successfully:', fetchedTrades);
        setTrades(fetchedTrades as any);
        setError(null);
      } else {
        setError('Cannot connect to the API. Please check if the backend server is running.');
      }
    } catch (err: any) {
      console.error('Error loading trades:', err);
      setError(err.message || 'An error occurred while loading trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
  }, []);

  // Render loading state
  if (loading) {
    return (
      <Box p={3}>
        <Typography variant="h5" gutterBottom>Trades</Typography>
        <Typography>Loading trades... Please wait.</Typography>
      </Box>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <Box p={3}>
        <Typography variant="h5" gutterBottom>Trades</Typography>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        {apiStatus && (
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            API Status: {apiStatus.message}
          </Typography>
        )}
        <Button 
          variant="contained" 
          color="primary" 
          onClick={() => window.location.reload()} 
        >
          Retry
        </Button>
      </Box>
    );
  }
  // Filter trades based on search term and advanced filters
  const filteredTrades = trades.filter(trade => {
    // Text search filter
    const matchesSearch = trade.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (trade.notes && trade.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Status filter
    const matchesStatus = !filters.status || trade.status.toLowerCase() === filters.status.toLowerCase();
    
    // Date filters
    const tradeDate = new Date(trade.entryDate);
    const matchesDateFrom = !filters.dateFrom || tradeDate >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || tradeDate <= new Date(filters.dateTo);
    
    // Profit/Loss filters
    const matchesMinProfit = !filters.minProfit || (trade.result !== null && trade.result >= parseFloat(filters.minProfit));
    const matchesMaxProfit = !filters.maxProfit || (trade.result !== null && trade.result <= parseFloat(filters.maxProfit));
    
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesMinProfit && matchesMaxProfit;
  });

  // Sort trades
  const sortedTrades = [...filteredTrades].sort((a, b) => {
    if (a[sortField] === null) return 1;
    if (b[sortField] === null) return -1;
      if (sortField === 'result' || sortField === 'entryPrice' || sortField === 'exitPrice' || sortField === 'risk_percent' || sortField === 'total_risk') {
      return sortDirection === 'asc' 
        ? (a[sortField] || 0) - (b[sortField] || 0)
        : (b[sortField] || 0) - (a[sortField] || 0);
    }
    
    return sortDirection === 'asc'
      ? String(a[sortField]).localeCompare(String(b[sortField]))
      : String(b[sortField]).localeCompare(String(a[sortField]));
  });

  // Pagination
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sorting
  const handleSort = (field: keyof Trade) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortField(field);
  };

  // Delete function with confirmation
  const handleDelete = async (id: number) => {
    const trade = trades.find(t => t.id === id);
    const tradeName = trade ? `${trade.ticker} trade` : `trade #${id}`;
    
    if (window.confirm(`Are you sure you want to delete the ${tradeName}? This action cannot be undone.`)) {
      try {
        await deleteTrade(id);
        // Refresh the trades list
        await loadTrades();
        console.log(`Successfully deleted trade ${id}`);
      } catch (error) {
        console.error('Error deleting trade:', error);
        alert('Failed to delete trade. Please try again.');
      }
    }
  };

  if (loading) {
    return <div>Loading trades...</div>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4">Trades</Typography>
          {filteredTrades.length !== trades.length && (
            <Typography variant="body2" color="textSecondary">
              Showing {filteredTrades.length} of {trades.length} trades
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          component={Link}
          to="/trades/new"
        >
          New Trade
        </Button>
      </Box>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <TextField
            placeholder="Search trades..."
            variant="outlined"
            size="small"
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
          
          <Box display="flex" alignItems="center" gap={1}>
            {/* Active filters indicator */}
            {(searchTerm || filters.status || filters.dateFrom || filters.dateTo || filters.minProfit || filters.maxProfit) && (
              <Chip 
                label={`${Object.values(filters).filter(Boolean).length + (searchTerm ? 1 : 0)} filter(s) active`}
                color="primary" 
                size="small"
                onDelete={() => {
                  const clearedFilters = {
                    status: '',
                    dateFrom: '',
                    dateTo: '',
                    minProfit: '',
                    maxProfit: ''
                  };
                  setFilters(clearedFilters);
                  setSearchTerm('');
                }}
              />
            )}
            
            <Button 
              startIcon={<FilterListIcon />}
              variant="outlined"
              onClick={() => setFilterDialogOpen(true)}
            >
              Filters
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Advanced Filter Dialog */}
      <Dialog 
        open={filterDialogOpen} 
        onClose={() => setFilterDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Advanced Filters</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              {/* Spacer */}
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date From"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date To"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Min P&L (%)"
                type="number"
                value={filters.minProfit}
                onChange={(e) => setFilters(prev => ({ ...prev, minProfit: e.target.value }))}
                placeholder="e.g., -10"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Max P&L (%)"
                type="number"
                value={filters.maxProfit}
                onChange={(e) => setFilters(prev => ({ ...prev, maxProfit: e.target.value }))}
                placeholder="e.g., 15"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              const clearedFilters = {
                status: '',
                dateFrom: '',
                dateTo: '',
                minProfit: '',
                maxProfit: ''
              };
              setFilters(clearedFilters);
              setSearchTerm('');
            }}
          >
            Clear All
          </Button>
          <Button onClick={() => setFilterDialogOpen(false)} variant="contained">
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Ticker
                  <IconButton size="small" onClick={() => handleSort('ticker')}>
                    {sortField === 'ticker' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Entry Date
                  <IconButton size="small" onClick={() => handleSort('entryDate')}>
                    {sortField === 'entryDate' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Exit Date
                  <IconButton size="small" onClick={() => handleSort('exitDate')}>
                    {sortField === 'exitDate' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Risk $
                  <IconButton size="small" onClick={() => handleSort('total_risk')}>
                    {sortField === 'total_risk' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Risk %
                  <IconButton size="small" onClick={() => handleSort('risk_percent')}>
                    {sortField === 'risk_percent' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Status
                  <IconButton size="small" onClick={() => handleSort('status')}>
                    {sortField === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  Result
                  <IconButton size="small" onClick={() => handleSort('result')}>
                    {sortField === 'result' ? (
                      sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    ) : null}
                  </IconButton>
                </Box>
              </TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTrades
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((trade) => (
                <TableRow key={trade.id} hover>
                  <TableCell component="th" scope="row">
                    <Link 
                      to={`/trades/${trade.id}`} 
                      state={{ from: `${location.pathname}${location.search}` }}
                      style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}
                    >
                      {trade.ticker}
                    </Link>
                  </TableCell>                  <TableCell>
                    {trade.entryDate ? 
                      new Date(trade.entryDate).toLocaleDateString() !== 'Invalid Date' ?
                      new Date(trade.entryDate).toLocaleDateString() : 
                      trade.entryDate.split('T')[0] : 
                      '-'
                    }
                  </TableCell>
                  <TableCell>
                    {trade.exitDate ? 
                      new Date(trade.exitDate).toLocaleDateString() !== 'Invalid Date' ? 
                      new Date(trade.exitDate).toLocaleDateString() : 
                      trade.exitDate.split('T')[0] : 
                      '-'
                    }
                  </TableCell>
                  <TableCell>{trade.total_risk ? `$${trade.total_risk.toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{trade.risk_percent ? `${trade.risk_percent}%` : '-'}</TableCell>
                  <TableCell>
                    <Chip 
                      label={trade.status} 
                      color={trade.status === 'Open' ? 'primary' : 'default'} 
                      size="small" 
                    />
                  </TableCell>                  <TableCell>
                    {trade.result !== null && trade.result !== undefined ? (
                      <Typography 
                        color={trade.result >= 0 ? 'success.main' : 'error.main'}
                        fontWeight="bold"
                      >
                        {trade.result >= 0 ? '+' : ''}
                        $
                        {Number(trade.result).toFixed(2)}
                      </Typography>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      component={Link} 
                      to={`/trades/edit/${trade.id}`}
                      state={{ from: `${location.pathname}${location.search}` }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small"
                      color="error"
                      onClick={() => handleDelete(trade.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            {sortedTrades.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body1" py={3}>
                    No trades found. Add your first trade to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100, 250]}
          component="div"
          count={sortedTrades.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
    </Box>
  );
};

export default TradesList;
