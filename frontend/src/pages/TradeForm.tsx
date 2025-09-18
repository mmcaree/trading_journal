import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  InputAdornment,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Autocomplete
} from '@mui/material';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { 
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { createTrade, updateTrade, fetchTrade } from '../services/tradeService';
import { getCurrentUser, updateProfile } from '../services/userService';
import { accountService } from '../services/accountService';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import PartialExits from '../components/PartialExits';
import { PartialExit } from '../services/tradeService';

// Define validation schema
const TradeSchema = Yup.object().shape({
  ticker: Yup.string().required('Ticker is required').uppercase(),
  entryDate: Yup.date().required('Entry date is required'),
  exitDate: Yup.date().nullable(),
  entryPrice: Yup.number().required('Entry price is required').positive('Must be positive'),
  stopLoss: Yup.number().when('instrumentType', {
    is: (val: string) => val?.toLowerCase() === 'stock',
    then: (schema) => schema.positive('Must be positive').required('Stop loss is required for stock trades'),
    otherwise: (schema) => schema.nullable()
  }),
  exitPrice: Yup.number().nullable().positive('Must be positive'),
  accountSize: Yup.number().required('Balance at time of trade is required').positive('Must be positive'),
  strategy: Yup.string().required('Strategy is required'),
  setupType: Yup.string().required('Setup type is required'),
  timeframe: Yup.string().required('Timeframe is required'),
  direction: Yup.string().required('Direction is required'),
  instrumentType: Yup.string().required('Instrument type is required'),
  notes: Yup.string(),
  status: Yup.string().required('Status is required'),
  shares: Yup.number().required('Number of shares is required').positive('Must be positive'),
  takeProfit: Yup.string()
});

// Strategies and setups
const strategies = ['Breakout', 'Reversal', 'Episodic Pivot','BBKC Mean Reversion','Parabolic Short','Other'];
const setups = ['Flag', 'Cup and Handle', 'Earnings Gap', 'ABCD', 'VWAP Reversal', 'Support/Resistance', 'Other'];
const timeframes = ['1min', '5min', '15min', '30min', '1H', '4H', 'Daily', 'Weekly', 'Monthly'];

const TradeForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(id ? true : false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [partialExits, setPartialExits] = useState<PartialExit[]>([]);

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
  // Note: Account balance is now handled per-trade via account_balance_snapshot
  const isEditMode = Boolean(id);  // Helper function to check if instrument type is options (case-insensitive)
  const isOptionsInstrument = (instrumentType: string) => {
    return instrumentType?.toLowerCase() === 'options';
  };

  const formik = useFormik({
    initialValues: {
      ticker: '',
      entryDate: new Date(),
      exitDate: null as Date | null,
      entryPrice: '',
      stopLoss: '',
      exitPrice: '',
      accountSize: accountService.getCurrentBalance().toString(),
      strategy: '',
      setupType: '',
      timeframe: 'Daily',
      direction: 'Long',
      instrumentType: 'stock',
      notes: '',
      status: 'Open',
      shares: '',
      takeProfit: '',
    },
    validationSchema: TradeSchema,    onSubmit: async (values) => {
      try {
        // Skip validation for options trades since they don't have stop losses
        if (!isOptionsInstrument(values.instrumentType)) {
          // First, validate the trade data ourselves
          const entryPrice = parseFloat(values.entryPrice);
          const stopLoss = parseFloat(values.stopLoss);
          const isLong = values.direction === 'Long';
          const isValidTrade = isLong ? (entryPrice > stopLoss) : (stopLoss > entryPrice);
          
          if (!isValidTrade) {
            alert(isLong 
              ? 'For Long trades, stop loss must be lower than entry price.' 
              : 'For Short trades, stop loss must be higher than entry price.');
            return;
          }
          
          // Also check that we can calculate a positive position size
          const riskPerShare = Math.abs(entryPrice - stopLoss);
          if (riskPerShare <= 0) {
            alert('Cannot calculate position size: entry price and stop loss are too close.');
            return;
          }
        }

        // Calculate risk info for notes based on shares and price difference
        const userShares = parseInt(values.shares) || 0;
        if (userShares <= 0) {
          alert(`Please enter a valid number of ${isOptionsInstrument(values.instrumentType) ? 'contracts' : 'shares'}.`);
          return;
        }
        
        // For options trades, skip risk calculations since they don't have stop losses
        let riskAmount = 0;
        let calculatedTargetPrice = 0;
        
        if (!isOptionsInstrument(values.instrumentType)) {
          const entryPrice = parseFloat(values.entryPrice);
          const stopLoss = parseFloat(values.stopLoss);
          const isLong = values.direction === 'Long';
          
          // Calculate actual risk amount
          const riskPerShare = Math.abs(entryPrice - stopLoss);
          riskAmount = userShares * riskPerShare;
          
          // Calculate suggested take profit (5R) based on user's actual shares
          const rMultiple = 5;
          const targetMove = riskPerShare * rMultiple;
          calculatedTargetPrice = isLong 
            ? entryPrice + targetMove
            : entryPrice - targetMove;
        }
        
          // Prepare trade data, keeping any existing notes that don't contain risk info
          let cleanNotes = values.notes || '';
          // Remove any existing risk information (only for non-options trades)
          if (!isOptionsInstrument(values.instrumentType)) {
            cleanNotes = cleanNotes.replace(/Risk:\s*\$[\d,.]+(\n|$)/, '').trim();
            
            // Add new risk information
            const riskInfo = `Risk: $${riskAmount.toFixed(2)}`;
            cleanNotes = cleanNotes ? `${cleanNotes}\n${riskInfo}` : riskInfo;
          }
          
          const tradeData = {
            ...values,
            entryPrice: values.entryPrice,
            exitPrice: values.exitPrice,
            stopLoss: isOptionsInstrument(values.instrumentType) ? null : values.stopLoss,
            shares: values.shares, 
            takeProfit: calculatedTargetPrice > 0 ? calculatedTargetPrice.toFixed(2) : values.takeProfit,
            notes: cleanNotes,
            instrumentType: values.instrumentType,
            tags,
            partial_exits: partialExits,
            id: isEditMode ? parseInt(id!) : undefined,
            account_balance_snapshot: parseFloat(values.accountSize)  // Set the snapshot balance
          };
        
        if (isEditMode) {
          await updateTrade(tradeData);
        } else {
          await createTrade(tradeData);
        }
        
        handleBackToTrades();
      } catch (error: any) {
        console.error('Error saving trade:', error);
        alert(error.message || 'Failed to save trade');
      }
    },
  });
  
  React.useEffect(() => {
    const loadTrade = async () => {
      if (id) {
        try {          const trade = await fetchTrade(parseInt(id));
          console.log('Loaded trade:', trade);
          
          // Use account balance snapshot from the trade when editing, or current balance for new trades
          const balanceForTrade = trade.accountBalanceSnapshot || accountService.getCurrentBalance();
          
          // Map API fields to form fields
          const tradeInstrumentType = trade.instrumentType || 'stock';
          
          formik.setValues({
            ticker: trade.ticker || '',
            entryDate: trade.entryDate ? new Date(trade.entryDate) : new Date(),
            exitDate: trade.exitDate ? new Date(trade.exitDate) : null,
            entryPrice: trade.entryPrice ? trade.entryPrice.toString() : '',
            stopLoss: trade.stopLoss ? trade.stopLoss.toString() : '',
            exitPrice: trade.exitPrice ? trade.exitPrice.toString() : '',
            accountSize: balanceForTrade.toString(),
            strategy: trade.strategy || '',
            setupType: trade.setupType || '',
            timeframe: trade.timeframe || 'Daily',
            direction: trade.direction || 'Long',
            instrumentType: tradeInstrumentType,
            notes: trade.notes || '',
            status: trade.status || 'Open',
            shares: trade.shares ? trade.shares.toString() : '',
            takeProfit: trade.takeProfit ? trade.takeProfit.toString() : '',
          });
            // If the API returns tags, set them
          if (trade.tags && Array.isArray(trade.tags)) {
            setTags(trade.tags);
          } else {
            setTags([]);
          }
          
          // Load partial exits if available
          if (trade.partialExits && Array.isArray(trade.partialExits)) {
            setPartialExits(trade.partialExits);
          } else {
            setPartialExits([]);
          }
        } catch (error) {
          console.error('Error loading trade:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadTrade();
  }, [id]);

  // Handle tag input
  const handleAddTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const handleDeleteTag = (tagToDelete: string) => {
    setTags(tags.filter(tag => tag !== tagToDelete));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput) {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Functions to calculate risk management values
  const calculateRiskDollarAmount = () => {
    const entryPrice = parseFloat(formik.values.entryPrice) || 0;
    const stopLoss = parseFloat(formik.values.stopLoss) || 0;
    const shares = parseFloat(formik.values.shares) || 0;
    
    // If no stop loss is entered, return null/empty
    if (stopLoss <= 0) return '';
    
    // Calculate risk per share
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const totalRisk = shares * riskPerShare;
    
    return totalRisk.toFixed(2);
  };

  const calculateRiskPercent = () => {
    const entryPrice = parseFloat(formik.values.entryPrice) || 0;
    const stopLoss = parseFloat(formik.values.stopLoss) || 0;
    const shares = parseFloat(formik.values.shares) || 0;
    const accountSize = parseFloat(formik.values.accountSize) || 0;
    
    // If no stop loss is entered, return empty
    if (stopLoss <= 0 || accountSize <= 0) return '';
    
    // Calculate risk per share and total risk
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const totalRisk = shares * riskPerShare;
    const riskPercent = (totalRisk / accountSize) * 100;
    
    return riskPercent.toFixed(2);
  };
  const calculateTakeProfitPrice = () => {
    const entryPrice = parseFloat(formik.values.entryPrice) || 0;
    const stopLoss = parseFloat(formik.values.stopLoss) || 0;
    const isLong = formik.values.direction === 'Long';
    
    // Validate that the values make sense for the trade direction
    const isValidTrade = isLong ? (entryPrice > stopLoss) : (stopLoss > entryPrice);
    
    if (!isValidTrade || entryPrice <= 0 || stopLoss <= 0) {
      return 'Calculate after entering valid prices';
    }
    
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const rMultiple = 5; // 5R target
    
    const targetMove = riskPerShare * rMultiple;
    const targetPrice = isLong 
      ? entryPrice + targetMove
      : entryPrice - targetMove;
    
    return targetPrice.toFixed(2);
  };

  if (loading) {
    return <div>Loading trade data...</div>;
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
            {isEditMode ? 'Edit Trade' : 'New Trade'}
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={3}>
            {/* Basic Trade Info */}
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="ticker"
                name="ticker"
                label="Ticker Symbol"
                value={formik.values.ticker}
                onChange={formik.handleChange}
                error={formik.touched.ticker && Boolean(formik.errors.ticker)}
                helperText={formik.touched.ticker && formik.errors.ticker}
                InputProps={{
                  style: { textTransform: 'uppercase' }
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel id="direction-label">Direction</InputLabel>
                <Select
                  labelId="direction-label"
                  id="direction"
                  name="direction"
                  value={formik.values.direction}
                  onChange={formik.handleChange}
                  label="Direction"
                >
                  <MenuItem value="Long">Long</MenuItem>
                  <MenuItem value="Short">Short</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel id="instrumentType-label">Instrument Type</InputLabel>
                <Select
                  labelId="instrumentType-label"
                  id="instrumentType"
                  name="instrumentType"
                  value={formik.values.instrumentType}
                  onChange={formik.handleChange}
                  label="Instrument Type"
                >
                  <MenuItem value="stock">Shares</MenuItem>
                  <MenuItem value="options">Options</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>              <FormControl fullWidth>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  labelId="status-label"
                  id="status"
                  name="status"
                  value={formik.values.status}
                  onChange={formik.handleChange}
                  label="Status"
                >
                  <MenuItem value="Open">Open</MenuItem>
                  <MenuItem value="Closed">Closed</MenuItem>
                  <MenuItem value="Planned">Planned</MenuItem>
                  <MenuItem value="Canceled">Canceled</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Entry/Exit Information */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Entry Date"
                  value={formik.values.entryDate}
                  onChange={(date) => formik.setFieldValue('entryDate', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: formik.touched.entryDate && Boolean(formik.errors.entryDate),
                      helperText: formik.touched.entryDate && formik.errors.entryDate as string
                    }
                  }}
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Exit Date"
                  value={formik.values.exitDate}
                  onChange={(date) => formik.setFieldValue('exitDate', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: formik.touched.exitDate && Boolean(formik.errors.exitDate),
                      helperText: formik.touched.exitDate && formik.errors.exitDate as string
                    }
                  }}
                  disabled={formik.values.status === 'Open'}
                />
              </LocalizationProvider>
            </Grid>            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="entryPrice"
                name="entryPrice"
                label={isOptionsInstrument(formik.values.instrumentType) ? "Entry Price (per contract)" : "Entry Price"}
                value={formik.values.entryPrice}
                onChange={formik.handleChange}
                error={formik.touched.entryPrice && Boolean(formik.errors.entryPrice)}
                helperText={
                  isOptionsInstrument(formik.values.instrumentType) 
                    ? "For options: Enter $0.10 for $10/contract" 
                    : formik.touched.entryPrice && formik.errors.entryPrice
                }
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            
            {!isOptionsInstrument(formik.values.instrumentType) && (
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  id="stopLoss"
                  name="stopLoss"
                  label="Stop Loss Price"
                  value={formik.values.stopLoss}
                  onChange={formik.handleChange}
                  error={formik.touched.stopLoss && Boolean(formik.errors.stopLoss)}
                  helperText={formik.touched.stopLoss && formik.errors.stopLoss}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                />
              </Grid>
            )}
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="exitPrice"
                name="exitPrice"
                label={isOptionsInstrument(formik.values.instrumentType) ? 'Exit Price (per contract)' : 'Exit Price'}
                value={formik.values.exitPrice}
                onChange={formik.handleChange}
                error={formik.touched.exitPrice && Boolean(formik.errors.exitPrice)}
                helperText={
                  (formik.touched.exitPrice && formik.errors.exitPrice) || 
                  (isOptionsInstrument(formik.values.instrumentType) ? 'Enter in dollars (e.g., 0.10 for $0.10)' : '')
                }
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                disabled={formik.values.status === 'Open'}
              />
            </Grid>
            
            {/* Risk Management Fields */}
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="accountSize"
                name="accountSize"
                label={isEditMode ? "Balance at Time of Trade" : "Current Account Balance"}
                value={formik.values.accountSize}
                onChange={formik.handleChange}
                error={formik.touched.accountSize && Boolean(formik.errors.accountSize)}
                helperText={formik.touched.accountSize && formik.errors.accountSize}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="riskDollarAmount"
                label="Risk Dollar Amount"
                value={calculateRiskDollarAmount()}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="riskPercent"
                label="Risk Percentage"
                value={calculateRiskPercent()}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="takeProfitPrice"
                label="Suggested Take Profit Price (5R)"
                value={calculateTakeProfitPrice()}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  readOnly: true,
                }}
                disabled
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                id="shares"
                name="shares"
                label={isOptionsInstrument(formik.values.instrumentType) ? 'Number of Contracts' : 'Number of Shares'}
                value={formik.values.shares}
                onChange={formik.handleChange}
                error={formik.touched.shares && Boolean(formik.errors.shares)}
                helperText={formik.touched.shares && formik.errors.shares}
                placeholder={isOptionsInstrument(formik.values.instrumentType) ? 'Enter number of contracts purchased' : 'Enter number of shares purchased'}
              />
            </Grid>

            {/* Strategy and Setup */}
            <Grid item xs={12} md={4}>
              <Autocomplete
                freeSolo
                options={strategies}
                value={formik.values.strategy}
                onChange={(event, newValue) => {
                  formik.setFieldValue('strategy', newValue || '');
                }}
                onInputChange={(event, newInputValue) => {
                  formik.setFieldValue('strategy', newInputValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Strategy"
                    name="strategy"
                    error={formik.touched.strategy && Boolean(formik.errors.strategy)}
                    helperText={formik.touched.strategy && formik.errors.strategy}
                    placeholder="Select or type custom strategy"
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Autocomplete
                freeSolo
                options={setups}
                value={formik.values.setupType}
                onChange={(event, newValue) => {
                  formik.setFieldValue('setupType', newValue || '');
                }}
                onInputChange={(event, newInputValue) => {
                  formik.setFieldValue('setupType', newInputValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Setup Type"
                    name="setupType"
                    error={formik.touched.setupType && Boolean(formik.errors.setupType)}
                    helperText={formik.touched.setupType && formik.errors.setupType}
                    placeholder="Select or type custom setup"
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth error={formik.touched.timeframe && Boolean(formik.errors.timeframe)}>
                <InputLabel id="timeframe-label">Timeframe</InputLabel>
                <Select
                  labelId="timeframe-label"
                  id="timeframe"
                  name="timeframe"
                  value={formik.values.timeframe}
                  onChange={formik.handleChange}
                  label="Timeframe"
                >
                  {timeframes.map((timeframe) => (
                    <MenuItem key={timeframe} value={timeframe}>{timeframe}</MenuItem>
                  ))}
                </Select>
                {formik.touched.timeframe && formik.errors.timeframe && (
                  <FormHelperText>{formik.errors.timeframe}</FormHelperText>
                )}
              </FormControl>
            </Grid>
              <Grid item xs={12} md={4}>              <TextField
                fullWidth
                id="takeProfit"
                name="takeProfit"
                label="Target Price 1st Trim"
                value={formik.values.takeProfit}
                onChange={formik.handleChange}
                error={formik.touched.takeProfit && Boolean(formik.errors.takeProfit)}
                helperText={formik.touched.takeProfit && formik.errors.takeProfit}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>

            {/* Tags */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Tags
              </Typography>
              <Box display="flex" alignItems="center" mb={2}>
                <TextField
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  placeholder="Add a tag and press Enter"
                  size="small"
                  sx={{ mr: 1 }}
                />
                <Button 
                  variant="outlined" 
                  onClick={handleAddTag}
                  disabled={!tagInput}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    onDelete={() => handleDeleteTag(tag)}
                    color="primary"
                    variant="outlined"
                  />
                ))}              </Box>
            </Grid>

            {/* Partial Exits */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2, mt: 2 }}>
                <PartialExits
                  partialExits={partialExits}
                  onPartialExitsChange={setPartialExits}
                  entryPrice={parseFloat(formik.values.entryPrice) || 0}
                  totalShares={parseInt(formik.values.shares) || 0}
                  tradeType={formik.values.direction.toLowerCase() as 'long' | 'short'}
                  disabled={formik.values.status === 'Closed'}
                />
              </Paper>
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                id="notes"
                name="notes"
                label="Trade Notes"
                multiline
                rows={4}
                value={formik.values.notes}
                onChange={formik.handleChange}
                error={formik.touched.notes && Boolean(formik.errors.notes)}
                helperText={formik.touched.notes && formik.errors.notes}
              />
            </Grid>

            {/* Submit Button */}
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  color="primary"
                  type="submit"
                  startIcon={<SaveIcon />}
                  size="large"
                >
                  {isEditMode ? 'Save Changes' : 'Create Trade'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
};

export default TradeForm;
