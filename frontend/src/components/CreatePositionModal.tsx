import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Typography,
  Divider,
  Alert,
  InputAdornment,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Security as StopLossIcon,
  TrendingUp as TakeProfitIcon,
  Calculate as CalculateIcon,
  Timeline as StrategyIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';

import BaseModal from './BaseModal';
import { createPosition, CreatePositionData, Position } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { accountService } from '../services/accountService';
import { getCurrentLocalDateTime, parseLocalDateTimeToISO } from '../utils/dateUtils';


export interface CreatePositionFormData {
  ticker: string;
  instrument_type: 'STOCK' | 'OPTIONS';
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  shares: number;
  price: number;
  event_date: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
  strike_price?: number;
  expiration_date?: string;
  option_type?: 'CALL' | 'PUT';
}

export interface CreatePositionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (newPosition: Position) => void;
}

// Common strategy options
const STRATEGIES = [
  'Breakout',
  'Pullback', 
  'Support/Resistance',
  'Moving Average',
  'Earnings Play',
  'Gap Fill',
  'Momentum',
  'Mean Reversion',
  'Day Trade',
  'Reversal'
];

const SETUP_TYPES = [
  'Up-Flat Flag',
  'Channel',
  'Down Flat Flag',
  'Symmetrical Flag',
  'Bear Flag',
  'Triangle',
  'Cup and Handle',
  'Double Bottom',
  'Double Top',
  'Head and Shoulders',
  'Ascending Triangle',
  'Descending Triangle',
  'Channel Breakout',
  'Support Bounce',
  'Resistance Break'
];

const TIMEFRAMES = [
  '1m', '5m', '15m', '30m', '1h', '4h', 'Daily', 'Weekly'
];

const CreatePositionModal: React.FC<CreatePositionModalProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form setup with React Hook Form
  const form = useForm<CreatePositionFormData>({
    mode: 'onChange',
    defaultValues: {
      ticker: '',
      instrument_type: 'STOCK',
      strategy: '',
      setup_type: '',
      timeframe: '',
      shares: 0,
      price: 0,
      event_date: getCurrentLocalDateTime(), // Format for datetime-local input in user's local time
      stop_loss: undefined,
      take_profit: undefined,
      notes: '',
      strike_price: undefined,
      expiration_date: '',
      option_type: 'CALL'
    }
  });

  const { control, handleSubmit, formState: { errors }, watch, reset } = form;

  // Watch form values for real-time calculations
  const watchedValues = watch();
  const { ticker, instrument_type, shares, price, stop_loss, take_profit } = watchedValues;

  // Real-time calculations with options multiplier
  const isOptions = instrument_type === 'OPTIONS';
  const multiplier = isOptions ? 100 : 1;
  const displayPrice = price || 0;
  const actualPrice = isOptions ? displayPrice * multiplier : displayPrice;
  
  const totalCost = (shares || 0) * actualPrice;
  const stopLossDistance = stop_loss && price ? Math.abs(price - stop_loss) * multiplier : 0;
  const takeProfitDistance = take_profit && price ? Math.abs(take_profit - price) * multiplier : 0;
  const totalRisk = stopLossDistance * (shares || 0);
  const totalReward = takeProfitDistance * (shares || 0);
  const riskRewardRatio = totalRisk > 0 && totalReward > 0 ? totalReward / totalRisk : 0;
  
  // Risk percentage based on account balance (proper risk management calculation)
  const accountBalance = accountService.getCurrentBalance();
  const riskPercent = accountBalance > 0 ? (totalRisk / accountBalance) * 100 : 0;

  // Handle form submission
  const onSubmit = async (data: CreatePositionFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Validation
      if (!data.ticker || data.ticker.trim() === '') {
        setError('Ticker symbol is required');
        return;
      }
      if (!data.shares || data.shares <= 0) {
        setError('Shares must be greater than 0');
        return;
      }
      if (!data.price || data.price <= 0) {
        setError('Price must be greater than 0');
        return;
      }
      
      // Additional validation
      if (data.stop_loss && data.stop_loss <= 0) {
        setError('Stop loss must be greater than 0 if provided');
        return;
      }
      if (data.take_profit && data.take_profit <= 0) {
        setError('Take profit must be greater than 0 if provided');
        return;
      }

      // Additional validation for options
      if (isOptions) {
        if (!data.strike_price || data.strike_price <= 0) {
          setError('Strike price is required and must be positive for options');
          return;
        }
        if (!data.expiration_date) {
          setError('Expiration date is required for options');
          return;
        }
      }

      // Prepare data for API
      const positionData: CreatePositionData = {
        ticker: data.ticker.toUpperCase().trim(),
        instrument_type: data.instrument_type,
        strategy: data.strategy || undefined,
        setup_type: data.setup_type || undefined,
        timeframe: data.timeframe || undefined,
        account_balance_at_entry: accountBalance > 0 ? accountBalance : undefined,  // Snapshot account balance
        // Add options-specific fields
        strike_price: isOptions ? data.strike_price : undefined,
        expiration_date: isOptions ? data.expiration_date : undefined,
        option_type: isOptions ? data.option_type : undefined,
        initial_event: {
          event_type: 'buy',
          shares: data.shares,
          // For options, send the actual dollar price (contract price × 100)
          price: isOptions ? data.price * 100 : data.price,
          event_date: parseLocalDateTimeToISO(data.event_date),
          stop_loss: data.stop_loss ? (isOptions ? data.stop_loss * 100 : data.stop_loss) : undefined,
          take_profit: data.take_profit ? (isOptions ? data.take_profit * 100 : data.take_profit) : undefined,
          notes: data.notes || undefined
        }
      };

      const newPosition = await createPosition(positionData);

      // Reset form
      reset({
        ticker: '',
        instrument_type: 'STOCK',
        strategy: '',
        setup_type: '',
        timeframe: '',
        shares: 0,
        price: 0,
        event_date: getCurrentLocalDateTime(),
        stop_loss: undefined,
        take_profit: undefined,
        notes: '',
        strike_price: undefined,
        expiration_date: '',
        option_type: 'CALL'
      });
      
      // Notify parent
      if (onSuccess) {
        onSuccess(newPosition);
      }
      
      // Close modal
      onClose();

    } catch (err: any) {
      console.error('Create position error:', err);
      
      // Enhanced error messaging
      let errorMessage = 'Failed to create position';
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Check for specific common issues
      if (err.message?.includes('Network Error') || err.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection.';
      } else if (err.response?.status === 401) {
        errorMessage = 'Authentication error: Please log in again.';
      } else if (err.response?.status === 422) {
        errorMessage = 'Validation error: Please check your input values.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    reset({
      ticker: '',
      strategy: '',
      setup_type: '',
      timeframe: '',
      shares: 0,
      price: 0,
      event_date: getCurrentLocalDateTime(),
      stop_loss: undefined,
      take_profit: undefined,
      notes: ''
    });
    setError(null);
    onClose();
  };

  // Risk color helper
  const getRiskColor = () => {
    if (riskPercent <= 0.25) return 'success.main';
    if (riskPercent <= 0.75) return 'warning.main';
    return 'error.main';
  };

  const getRiskLabel = () => {
    if (riskPercent <= 0.25) return 'Low Risk';
    if (riskPercent <= 0.75) return 'Medium Risk';
    return 'High Risk';
  };

  return (
    <BaseModal
      open={open}
      onClose={handleCancel}
      title="Create New Position"
      loading={loading}
      error={error}
      maxWidth="md"
      onSubmit={handleSubmit(onSubmit)}
      submitDisabled={loading || !ticker || !shares || !price}
      actions={
        <>
          <Button 
            onClick={handleCancel} 
            disabled={loading}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            variant="contained"
            disabled={loading || !ticker || !shares || !price}
            startIcon={<AddIcon />}
          >
            Create Position
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          
          {/* Basic Position Info */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
          </Grid>

          {/* Options-Specific Fields */}
          {isOptions && (
            <>
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'info.light', color: 'info.contrastText', borderRadius: 2 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    � Options Contract Details
                    <Chip 
                      label="OPTIONS" 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                  </Typography>
                </Paper>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Controller
                  name="option_type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Option Type</InputLabel>
                      <Select {...field} label="Option Type">
                        <MenuItem value="CALL">Call</MenuItem>
                        <MenuItem value="PUT">Put</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Controller
                  name="strike_price"
                  control={control}
                  rules={{
                    required: isOptions ? 'Strike price is required for options' : false,
                    min: { value: 0.01, message: 'Strike price must be positive' }
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Strike Price"
                      type="number"
                      fullWidth
                      error={!!errors.strike_price}
                      helperText={errors.strike_price?.message}
                      inputProps={{ 
                        min: 0.01,
                        step: 0.01
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                    />
                  )}
                />
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Controller
                  name="expiration_date"
                  control={control}
                  rules={{
                    required: isOptions ? 'Expiration date is required for options' : false
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Expiration Date"
                      type="date"
                      fullWidth
                      error={!!errors.expiration_date}
                      helperText={errors.expiration_date?.message}
                      InputLabelProps={{
                        shrink: true,
                      }}
                    />
                  )}
                />
              </Grid>
            </>
          )}

          <Grid item xs={12} sm={4}>
            <Controller
              name="ticker"
              control={control}
              rules={{ 
                required: 'Ticker is required',
                minLength: { value: 1, message: 'Ticker is required' }
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Ticker Symbol"
                  fullWidth
                  error={!!errors.ticker}
                  helperText={errors.ticker?.message || 'e.g., AAPL, SPY, etc.'}
                  placeholder="AAPL"
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="instrument_type"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Instrument Type</InputLabel>
                  <Select {...field} label="Instrument Type">
                    <MenuItem value="STOCK">Stock</MenuItem>
                    <MenuItem value="OPTIONS">Options</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="strategy"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Strategy</InputLabel>
                  <Select {...field} label="Strategy">
                    <MenuItem value="">None</MenuItem>
                    {STRATEGIES.map(strategy => (
                      <MenuItem key={strategy} value={strategy}>{strategy}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="timeframe"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Timeframe</InputLabel>
                  <Select {...field} label="Timeframe">
                    <MenuItem value="">None</MenuItem>
                    {TIMEFRAMES.map(tf => (
                      <MenuItem key={tf} value={tf}>{tf}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid item xs={12}>
            <Controller
              name="setup_type"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Setup Type</InputLabel>
                  <Select {...field} label="Setup Type">
                    <MenuItem value="">None</MenuItem>
                    {SETUP_TYPES.map(setup => (
                      <MenuItem key={setup} value={setup}>{setup}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          {/* Entry Details */}
          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="h6" gutterBottom>
              Initial Entry
            </Typography>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="shares"
              control={control}
              rules={{ 
                required: `${isOptions ? 'Contracts' : 'Shares'} is required`,
                min: { value: 1, message: `Must be at least 1 ${isOptions ? 'contract' : 'share'}` }
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label={isOptions ? "Contracts" : "Shares"}
                  fullWidth
                  error={!!errors.shares}
                  helperText={errors.shares?.message}
                  inputProps={{ min: 1, step: 1 }}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {isOptions ? 'contracts' : 'shares'}
                      </InputAdornment>
                    )
                  }}
                />
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="price"
              control={control}
              rules={{ 
                required: 'Price is required',
                min: { value: 0.01, message: 'Must be greater than 0' }
              }}
              render={({ field }) => (
                <Tooltip title={isOptions ? "Contract price (will be multiplied by 100 automatically)" : "Price per share"}>
                  <TextField
                    {...field}
                    type="number"
                    label={isOptions ? "Contract Price" : "Entry Price"}
                    fullWidth
                    error={!!errors.price}
                    helperText={isOptions 
                      ? `Contract price (× 100 = $${actualPrice.toFixed(2)} actual)` 
                      : errors.price?.message
                    }
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                    inputProps={{ min: 0.01, step: 0.01 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </Tooltip>
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Controller
              name="event_date"
              control={control}
              rules={{ required: 'Entry date is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Entry Date & Time"
                  type="datetime-local"
                  fullWidth
                  required
                  error={!!errors.event_date}
                  helperText={errors.event_date?.message || "When did you enter this position?"}
                  InputLabelProps={{ shrink: true }}
                />
              )}
            />
          </Grid>

          {/* Risk Management */}
          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="h6" gutterBottom>
              Risk Management
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Controller
              name="stop_loss"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Stop Loss (Optional)"
                  fullWidth
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  inputProps={{ min: 0.01, step: 0.01 }}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              )}
            />
          </Grid>

          <Grid item xs={6}>
            <Controller
              name="take_profit"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label="Take Profit (Optional)"
                  fullWidth
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  inputProps={{ min: 0.01, step: 0.01 }}
                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              )}
            />
          </Grid>

          {/* Account Balance Warning */}
          {accountBalance <= 0 && totalRisk > 0 && (
            <Grid item xs={12}>
              <Alert 
                severity="info" 
                sx={{ mb: 1 }}
                action={
                  <Button 
                    color="inherit" 
                    size="small" 
                    onClick={() => window.open('/settings', '_blank')}
                  >
                    Update Balance
                  </Button>
                }
              >
                <Typography variant="body2">
                  <strong>Set Account Balance:</strong> To see accurate risk percentages, update your account balance in Settings. 
                  Current balance: {formatCurrency(accountBalance)}
                </Typography>
              </Alert>
            </Grid>
          )}

          {/* Real-time Calculations */}
          {totalCost > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2, backgroundColor: 'action.hover' }}>
                <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                  Position Summary
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                    <Typography variant="h6">{formatCurrency(totalCost)}</Typography>
                  </Grid>
                  {totalRisk > 0 && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Risk Amount</Typography>
                      <Typography variant="h6" color="error.main">
                        {formatCurrency(totalRisk)}
                      </Typography>
                      <Chip 
                        label={accountBalance > 0 ? `${riskPercent.toFixed(1)}% - ${getRiskLabel()}` : 'Set Account Balance'}
                        color={accountBalance > 0 ? (getRiskColor() === 'success.main' ? 'success' : getRiskColor() === 'warning.main' ? 'warning' : 'error') : 'default'}
                        size="small"
                      />
                    </Grid>
                  )}
                  {totalReward > 0 && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Reward Potential</Typography>
                      <Typography variant="h6" color="success.main">
                        {formatCurrency(totalReward)}
                      </Typography>
                    </Grid>
                  )}
                  {riskRewardRatio > 0 && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Risk/Reward</Typography>
                      <Typography variant="h6">
                        1:{riskRewardRatio.toFixed(1)}
                      </Typography>
                      <Chip 
                        label={riskRewardRatio >= 2 ? 'Good' : riskRewardRatio >= 1 ? 'Fair' : 'Poor'}
                        color={riskRewardRatio >= 2 ? 'success' : riskRewardRatio >= 1 ? 'warning' : 'error'}
                        size="small"
                      />
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Notes */}
          <Grid item xs={12}>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Notes (Optional)"
                  multiline
                  rows={3}
                  fullWidth
                  placeholder="Trade thesis, setup details, market conditions..."
                  inputProps={{ maxLength: 500 }}
                />
              )}
            />
          </Grid>

        </Grid>
      </form>
    </BaseModal>
  );
};

export default CreatePositionModal;