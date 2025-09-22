import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Divider,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs
} from '@mui/material';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  NoteAdd as NoteAddIcon,
  ShowChart as ShowChartIcon
} from '@mui/icons-material';
import { fetchTrade, updateTrade, getTradeDetails } from '../services/tradeService';
import { imageService } from '../services/imageService';
import { notesService } from '../services/notesService';
import { useCurrency } from '../context/CurrencyContext';
import TradeCandlestickChart from '../components/TradeCandlestickChart';
import InlineNotesEditor from '../components/InlineNotesEditor';

interface PartialExit {
  exitDate: string;
  exitPrice: number;
  sharesSold: number;
  profitLoss: number;
  notes?: string;
}

interface Trade {
  id: number;
  ticker: string;
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  shares: number;
  remainingShares: number;
  strategy: string;
  setupType: string;
  status: 'Open' | 'Closed';
  direction: 'Long' | 'Short';
  instrumentType: string;
  accountBalanceSnapshot?: number;  // Account balance when trade was created
  partialExits: PartialExit[];
  result: number | null;
  resultAmount: number | null;
  returnOnRisk: number | null;  // R multiple (profit/risk)
  percentageGain: number | null;  // Investment percentage (profit/investment)
  risk: number;
  stopLoss: number;
  takeProfit: number;
  takeProfitTargets: { price: number; shares: number }[];
  notes: string;
  imageUrls: string[] | null;
  tags: string[] | null;
}

// Helper function to get the correct label for position size
const getPositionLabel = (instrumentType: string): string => {
  return instrumentType?.toLowerCase() === 'options' ? 'Contracts' : 'Shares';
};

const TradeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [tradeEntries, setTradeEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const { currentCurrency } = useCurrency();

  // Function to handle back navigation
  const handleBackToTrades = () => {
    // Check if we have a previous location state or can use browser history
    if (location.state?.from) {
      // If we have the previous location stored, navigate back to it
      navigate(location.state.from, { replace: true });
    } else {
      // Try to go back in browser history first
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        // Fallback to trades page
        navigate('/trades');
      }
    }
  };

  useEffect(() => {
    const loadTrade = async () => {
      try {
        if (id) {
          // Fetch basic trade data
          const fetchedTrade = await fetchTrade(parseInt(id));
          
          // Also fetch detailed exits data
          try {
            const tradeDetails = await getTradeDetails(parseInt(id));
            
            // Merge the partial exits from the detailed response
            fetchedTrade.partialExits = tradeDetails.exits ? tradeDetails.exits.map((exit: any) => ({
              exitDate: exit.exit_date,
              exitPrice: exit.exit_price,
              sharesSold: exit.shares_sold,
              profitLoss: exit.profit_loss,
              notes: exit.notes
            })) : [];
            
            // Store trade positions (remaining lots) and entries (purchase history)
            setTradeEntries(tradeDetails.positions || []);  // Use positions for current lots
            
            // TODO: Add state for original entries if needed to show purchase history
            
            // Update remaining shares from calculated data
            fetchedTrade.remainingShares = tradeDetails.calculated.current_shares;
          } catch (detailsError) {
            console.warn('Could not fetch detailed exits, using basic trade data:', detailsError);
          }
          
          setTrade(fetchedTrade);
        }
      } catch (error) {
        console.error('Error fetching trade:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTrade();
  }, [id]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleNotesUpdate = async (newNotes: string) => {
    try {
      if (trade && id) {
        // Use the dedicated notes service
        await notesService.updateTradeNotes(parseInt(id), newNotes);
        
        // Update local state
        setTrade(prev => prev ? { ...prev, notes: newNotes } : null);
      }
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  };

  const handleImagesUpdate = async (newImageUrls: string[]) => {
    try {
      if (trade && id) {
        // Update backend with new image URLs
        await imageService.updateTradeImages(trade.id, newImageUrls);
        
        // Update local state
        setTrade(prev => prev ? { ...prev, imageUrls: newImageUrls } : null);
        console.log('Images updated:', newImageUrls);
      }
    } catch (error) {
      console.error('Error updating images:', error);
    }
  };

  if (loading) {
    return <div>Loading trade details...</div>;
  }

  if (!trade) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5">Trade not found</Typography>
        <Button 
          onClick={handleBackToTrades}
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Back to Trades
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center">
          <Button 
            onClick={handleBackToTrades}
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="h4">
            {trade.ticker} 
            {trade.direction === 'Long' ? (
              <TrendingUpIcon color="success" sx={{ ml: 1 }} />
            ) : (
              <TrendingDownIcon color="error" sx={{ ml: 1 }} />
            )}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<EditIcon />}
          component={Link}
          to={`/trades/edit/${trade.id}`}
        >
          Edit Trade
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Trade Summary Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trade Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Chip 
                    label={trade.status} 
                    color={trade.status === 'Open' ? 'primary' : 'default'} 
                    size="small" 
                    sx={{ mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Strategy</Typography>
                  <Typography variant="body1">{trade.strategy}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Setup</Typography>
                  <Typography variant="body1">{trade.setupType}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Direction</Typography>
                  <Typography variant="body1">{trade.direction}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Entry Date</Typography>
                  <Typography variant="body1">{new Date(trade.entryDate).toLocaleDateString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Exit Date</Typography>
                  <Typography variant="body1">
                    {trade.exitDate ? new Date(trade.exitDate).toLocaleDateString() : '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Trade Details Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trade Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Entry Price</Typography>
                  <Typography variant="body1">${(trade.entryPrice || 0).toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Exit Price</Typography>
                  <Typography variant="body1">
                    {trade.exitPrice ? `$${trade.exitPrice.toFixed(2) || 0}` : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Stop Loss</Typography>
                  <Typography variant="body1">${(trade.stopLoss || 0).toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">{getPositionLabel(trade.instrumentType)}</Typography>
                  <Typography variant="body1">{trade.remainingShares || trade.shares}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Risk</Typography>
                  <Typography variant="body1">${(trade.risk || 0).toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Risk %</Typography>
                  <Typography variant="body1">
                    {trade.accountBalanceSnapshot && trade.risk 
                      ? ((trade.risk / trade.accountBalanceSnapshot) * 100).toFixed(2) + '%'
                      : 'N/A'
                    }
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Tags</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {trade.tags && trade.tags.length > 0 ? (
                      trade.tags.map((tag, index) => (
                        <Chip 
                          key={index}
                          label={tag} 
                          size="small" 
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">No tags</Typography>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Trade Result Card */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trade Result
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {trade.status === 'Closed' ? (
                <>
                  {/* Return on Risk (R multiple) */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Return on Risk:
                    </Typography>
                    <Typography variant="h6" 
                      color={trade.returnOnRisk && trade.returnOnRisk >= 0 ? 'success.main' : 'error.main'}
                      sx={{ fontWeight: 'bold' }}
                    >
                      {trade.returnOnRisk && trade.returnOnRisk >= 0 ? '+' : ''}
                      {trade.returnOnRisk?.toFixed(2)}R
                    </Typography>
                  </Box>
                  
                  {/* Percentage Gain on Investment */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      % Return:
                    </Typography>
                    <Typography variant="h6" 
                      color={trade.percentageGain && trade.percentageGain >= 0 ? 'success.main' : 'error.main'}
                      sx={{ fontWeight: 'bold' }}
                    >
                      {trade.percentageGain && trade.percentageGain >= 0 ? '+' : ''}
                      {trade.percentageGain?.toFixed(2)}%
                    </Typography>
                  </Box>
                  
                  {/* Dollar Amount */}
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {currentCurrency?.symbol || '$'} Return:
                    </Typography>
                    <Typography variant="h6" 
                      color={trade.resultAmount && trade.resultAmount >= 0 ? 'success.main' : 'error.main'}
                      sx={{ fontWeight: 'bold' }}
                    >
                      {trade.resultAmount && trade.resultAmount >= 0 ? '+' : ''}
                      {currentCurrency?.symbol || '$'}{trade.resultAmount?.toFixed(2)}
                    </Typography>
                  </Box>
                </>
              ) : (
                <Typography variant="body1" align="center" sx={{ py: 3 }}>
                  Trade is still open
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Tabs for Notes and Charts */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Tabs value={tabValue} onChange={handleTabChange}>
              <Tab icon={<NoteAddIcon />} label="Notes" />
              <Tab icon={<ShowChartIcon />} label="Charts" />
            </Tabs>
            
            <Box sx={{ mt: 2 }}>
              {tabValue === 0 && (
                <InlineNotesEditor
                  tradeId={trade.id}
                  initialNotes={trade.notes || ''}
                  imageUrls={trade.imageUrls || []}
                  onNotesUpdate={handleNotesUpdate}
                  onImagesUpdate={handleImagesUpdate}
                />
              )}
              
              {tabValue === 1 && (
                <Box>
                  {/* Professional Candlestick Chart */}
                  <TradeCandlestickChart tradeId={trade.id} />
                  
                  {/* Image Charts - Legacy support */}
                  {trade.imageUrls && trade.imageUrls.length > 0 && (
                    <>
                      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                        Uploaded Chart Images
                      </Typography>
                      <Grid container spacing={2}>
                        {trade.imageUrls.map((url, index) => (
                          <Grid item xs={12} md={6} lg={4} key={index}>
                            <Card>
                              <CardMedia
                                component="img"
                                height="300"
                                image={url}
                                alt={`Chart ${index + 1}`}
                              />
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    </>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Exits & Take Profits Card - New Section */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Adds and Exits
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {/* Exits */}
              <Typography variant="subtitle1" gutterBottom>
                Exits
              </Typography>
              {trade.partialExits && trade.partialExits.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Price</TableCell>
                        <TableCell>{getPositionLabel(trade.instrumentType)}</TableCell>
                        <TableCell>P/L</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trade.partialExits.map((exit, index) => (
                        <TableRow key={index}>
                          <TableCell>{new Date(exit.exitDate).toLocaleDateString()}</TableCell>
                          <TableCell>${exit.exitPrice.toFixed(2)}</TableCell>
                          <TableCell>{exit.sharesSold}</TableCell>
                          <TableCell>
                            <Typography 
                              color={exit.profitLoss >= 0 ? 'success.main' : 'error.main'}
                            >
                              ${exit.profitLoss.toFixed(2)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No exits recorded
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Current Positions */}
              <Typography variant="subtitle1" gutterBottom>
                Entries
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Historical entries to build current positions
              </Typography>
              {tradeEntries && tradeEntries.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Price</TableCell>
                        <TableCell>{getPositionLabel(trade.instrumentType)}</TableCell>
                        <TableCell>Stop Loss</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tradeEntries.map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                          <TableCell>${entry.entry_price.toFixed(2)}</TableCell>
                          <TableCell>{entry.shares}</TableCell>
                          <TableCell>
                            ${entry.stop_loss ? entry.stop_loss.toFixed(2) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No position adds recorded
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TradeDetail;
