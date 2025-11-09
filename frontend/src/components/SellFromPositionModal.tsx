import React, { useState, useEffect, useMemo } from 'react';
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
  Slider,
  Chip,
  Tooltip
} from '@mui/material';
import {
  TrendingDown as SellIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';

import BaseModal from './BaseModal';
import { Position, sellFromPosition } from '../services/positionsService';
import { getCurrentLocalDateTime, parseLocalDateTimeToISO } from '../utils/dateUtils';
import { accountService } from '../services/accountService';
import { useCurrency } from '../context/CurrencyContext';
import PerEventStopLossManager, { PerEventRiskLevels } from './PerEventStopLossManager';


export interface SellFromPositionFormData {
  shares: number;
  price: number;
  event_date: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

export interface SellFromPositionModalProps {
  open: boolean;
  onClose: () => void;
  position: Position;
  onSuccess?: (updatedPosition: Position) => void;
}

const SellFromPositionModal: React.FC<SellFromPositionModalProps> = ({
  open,
  onClose,
  position,
  onSuccess
}) => {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-event risk management state
  const [perEventRisk, setPerEventRisk] = useState<PerEventRiskLevels>({
    useEventLevels: false,
    stopLoss: undefined,
    takeProfit: undefined
  });

  // Form setup with React Hook Form
  const form = useForm<SellFromPositionFormData>({
    mode: 'onChange',
    defaultValues: {
      shares: 0,
      price: 0,
      event_date: getCurrentLocalDateTime(),
      notes: ''
    }
  });

  const { control, handleSubmit, formState: { errors }, watch, reset, setValue } = form;

  // Watch form values for real-time calculations
  const watchedValues = watch();
  const { shares, price } = watchedValues;

  // Options detection from position
  const isOptions = position.instrument_type === 'OPTIONS';

  // Calculate price multiplier (100x for options contracts)
  const multiplier = isOptions ? 100 : 1;
  const actualPrice = (price || 0) * multiplier;

  // Get account balance for risk percentage calculations
  const accountBalance = accountService.getCurrentBalance();

  // Real-time calculations
  const maxShares = position.current_shares || 0;
  const saleValue = (shares || 0) * actualPrice;
  const avgCostBasis = position.avg_entry_price || 0;
  const costBasis = (shares || 0) * avgCostBasis;
  const estimatedPnL = saleValue - costBasis;
  const estimatedReturn = costBasis > 0 ? ((estimatedPnL / costBasis) * 100) : 0;
  
  // Remaining position calculations
  const remainingShares = maxShares - (shares || 0);
  const remainingValue = remainingShares * avgCostBasis;
  const newTotalCost = position.total_cost - costBasis;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({
        shares: 0,
        price: parseFloat((avgCostBasis || 0).toFixed(2)), // Format to 2 decimal places
        event_date: getCurrentLocalDateTime(),
        notes: ''
      });
      setError(null);
    }
  }, [open, position, reset, avgCostBasis]);

  // Handle form submission
  const onSubmit = async (data: SellFromPositionFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Validation
      if (!data.shares || data.shares <= 0) {
        setError('Shares must be greater than 0');
        return;
      }
      if (data.shares > maxShares) {
        setError(`Cannot sell more than ${maxShares} shares`);
        return;
      }
      if (!data.price || data.price <= 0) {
        setError('Price must be greater than 0');
        return;
      }



      // Determine which stop loss and take profit to use
      const finalStopLoss = perEventRisk.useEventLevels 
        ? perEventRisk.stopLoss 
        : undefined;
      const finalTakeProfit = perEventRisk.useEventLevels 
        ? perEventRisk.takeProfit 
        : undefined;

      // Call the API with properly converted price for options
      await sellFromPosition(position.id, {
        shares: data.shares,
        price: actualPrice,
        event_date: parseLocalDateTimeToISO(data.event_date),
        stop_loss: finalStopLoss,
        take_profit: finalTakeProfit,
        notes: data.notes
      });

      // Create optimistic update for immediate UI feedback
      const optimisticPosition: Position = {
        ...position,
        current_shares: remainingShares,
        total_cost: newTotalCost,
        total_realized_pnl: position.total_realized_pnl + estimatedPnL,
        events_count: position.events_count + 1,
        // Close position if all shares sold
        status: remainingShares === 0 ? 'closed' : position.status,
        closed_at: remainingShares === 0 ? new Date().toISOString() : position.closed_at
      };

      // Success callback
      if (onSuccess) {
        onSuccess(optimisticPosition);
      }

      // Close modal
      onClose();

    } catch (err: any) {
      console.error('Failed to sell from position:', err);
      setError(err.message || 'Failed to sell from position. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (!loading) {
      onClose();
    }
  };

  // Quick share amount buttons
  const handleQuickShares = (percentage: number) => {
    const quickShares = Math.floor(maxShares * (percentage / 100));
    setValue('shares', quickShares);
  };

  // Smart price suggestion based on current position
  const suggestCurrentPrice = () => {
    if (position.avg_entry_price) {
      const formattedPrice = parseFloat(position.avg_entry_price.toFixed(2));
      setValue('price', formattedPrice);
    }
  };

  // Determine P&L color - use contrasting text on colored backgrounds
  const getPnLColor = () => {
    if (estimatedPnL > 0) return 'success.contrastText'; // White text on green background
    if (estimatedPnL < 0) return 'error.contrastText';   // White text on red background
    return 'text.primary';
  };

  // Check if this is a significant sale
  const isSignificantSale = shares > 0 && (shares / maxShares) >= 0.5;
  const isCompleteExit = shares === maxShares;

  return (
    <BaseModal
      open={open}
      onClose={handleCancel}
      title={`Sell ${position.ticker} Position`}
      loading={loading}
      error={error}
      maxWidth="md"
      onSubmit={handleSubmit(onSubmit)}
      submitDisabled={loading || !shares || shares <= 0 || !price || price <= 0 || shares > maxShares}
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
            disabled={loading || !shares || shares <= 0 || !price || price <= 0 || shares > maxShares}
            startIcon={<SellIcon />}
            color={isCompleteExit ? "warning" : "primary"}
          >
            {isCompleteExit ? 'Close Position' : 'Sell Shares'} (Ctrl+Enter)
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          
          {/* Position Summary */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, backgroundColor: 'action.hover' }}>
              <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                Current Position Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Current Shares</Typography>
                  <Typography variant="h6">{position.current_shares}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Avg Entry</Typography>
                  <Typography variant="h6">{formatCurrency(position.avg_entry_price || 0)}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                  <Typography variant="h6">{formatCurrency(position.total_cost)}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Realized P&L</Typography>
                  <Typography 
                    variant="h6"
                    sx={{ color: position.total_realized_pnl >= 0 ? 'success.main' : 'error.main' }}
                  >
                    {formatCurrency(position.total_realized_pnl)}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Options Details Display */}
          {isOptions && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2, backgroundColor: 'info.light', color: 'info.contrastText' }}>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  📈 Options Contract Details
                  <Chip 
                    label="OPTIONS" 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="inherit">Strike Price</Typography>
                    <Typography variant="h6" color="inherit">
                      ${position.strike_price || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="inherit">Expiration</Typography>
                    <Typography variant="h6" color="inherit">
                      {position.expiration_date || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="inherit">Type</Typography>
                    <Typography variant="h6" color="inherit" sx={{ textTransform: 'uppercase' }}>
                      {position.option_type || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Quick Share Selection */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Quick Share Selection
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => handleQuickShares(25)}
              >
                25% ({Math.floor(maxShares * 0.25)} shares)
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => handleQuickShares(50)}
              >
                50% ({Math.floor(maxShares * 0.5)} shares)
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => handleQuickShares(75)}
              >
                75% ({Math.floor(maxShares * 0.75)} shares)
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => handleQuickShares(100)}
                color="warning"
              >
                100% (Close Position)
              </Button>
            </Box>
          </Grid>

          {/* Shares Input */}
          <Grid item xs={12} sm={6}>
            <Controller
              name="shares"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={isOptions ? "Contracts to Sell" : "Shares to Sell"}
                  type="number"
                  fullWidth
                  required
                  error={!!errors.shares || (field.value > maxShares)}
                  helperText={
                    field.value > maxShares 
                      ? `Cannot exceed ${maxShares} ${isOptions ? 'contracts' : 'shares'}` 
                      : errors.shares?.message || `Max: ${maxShares} ${isOptions ? 'contracts' : 'shares'}`
                  }
                  inputProps={{ 
                    min: 1, 
                    max: maxShares,
                    step: 1
                  }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">
                      {isOptions ? 'contracts' : 'shares'}
                    </InputAdornment>
                  }}
                  onChange={(e) => {
                    // Ensure we convert to number to prevent string concatenation
                    const value = e.target.value ? parseInt(e.target.value, 10) : 0;
                    field.onChange(value);
                  }}
                />
              )}
            />
          </Grid>

          {/* Price Input */}
          <Grid item xs={12} sm={6}>
            <Controller
              name="price"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={isOptions ? "Price per Contract" : "Sale Price"}
                  type="number"
                  fullWidth
                  required
                  error={!!errors.price}
                  helperText={
                    isOptions 
                      ? "Price per contract (will be multiplied by 100)"
                      : errors.price?.message || `Current avg: ${formatCurrency(avgCostBasis)}`
                  }
                  inputProps={{ 
                    min: 0.01, 
                    max: isOptions ? 1000 : 10000,
                    step: 0.01
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        {isOptions ? (
                          <Tooltip title="Options contracts are multiplied by 100. For example, $1.50 per contract = $150 actual value">
                            <Chip 
                              label="per contract" 
                              size="small" 
                              variant="outlined"
                              sx={{ marginRight: 1 }}
                            />
                          </Tooltip>
                        ) : (
                          <Button 
                            size="small" 
                            onClick={suggestCurrentPrice}
                            sx={{ minWidth: 'auto', px: 1 }}
                          >
                            Use Avg
                          </Button>
                        )}
                      </InputAdornment>
                    )
                  }}
                  onChange={(e) => {
                    // Ensure we convert to number with proper decimal handling
                    const value = e.target.value ? parseFloat(e.target.value) : 0;
                    field.onChange(value);
                  }}
                />
              )}
            />
          </Grid>

          {/* Date Input */}
          <Grid item xs={12} sm={6}>
            <Controller
              name="event_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Sale Date & Time"
                  type="datetime-local"
                  fullWidth
                  required
                  error={!!errors.event_date}
                  helperText={errors.event_date?.message}
                  InputLabelProps={{ shrink: true }}
                />
              )}
            />
          </Grid>

          {/* P&L Calculations */}
          <Grid item xs={12} sm={6}>
            <Paper sx={{ p: 2, backgroundColor: estimatedPnL >= 0 ? 'success.light' : 'error.light' }}>
              <Typography variant="subtitle2" gutterBottom>
                📊 Estimated P&L
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Sale Value:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(saleValue)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Cost Basis:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(costBasis)}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>Profit/Loss:</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: getPnLColor() }}>
                  {formatCurrency(estimatedPnL)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Return:</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: getPnLColor() }}>
                  {estimatedReturn.toFixed(2)}%
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Warnings for significant sales */}
          {(isSignificantSale || isCompleteExit) && (
            <Grid item xs={12}>
              <Alert 
                severity={isCompleteExit ? "warning" : "info"} 
                icon={<WarningIcon />}
              >
                {isCompleteExit ? (
                  <strong>Complete Exit:</strong>
                ) : (
                  <strong>Large Sale:</strong>
                )} You are selling {((shares / maxShares) * 100).toFixed(0)}% of your position.
                {isCompleteExit && " This will close your position entirely."}
              </Alert>
            </Grid>
          )}

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
          </Grid>

          {/* Remaining Position Info */}
          {remainingShares > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2, backgroundColor: 'info.light', color: 'info.contrastText' }}>
                <Typography variant="subtitle2" gutterBottom>
                  📈 Remaining Position
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Remaining Shares:</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {remainingShares.toLocaleString()}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Remaining Value:</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatCurrency(remainingValue)}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Advanced Per-Event Risk Management */}
          <Grid item xs={12}>
            <PerEventStopLossManager
              position={position}
              eventShares={shares || 0}
              eventPrice={price || 0}
              eventType="sell"
              riskLevels={perEventRisk}
              onRiskLevelsChange={setPerEventRisk}
              accountBalance={accountBalance}
              disabled={loading}
            />
          </Grid>

          {/* Notes Input */}
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
                  error={!!errors.notes}
                  helperText={errors.notes?.message || "Reason for sale, market conditions, etc."}
                  inputProps={{ maxLength: 1000 }}
                />
              )}
            />
          </Grid>

        </Grid>
      </form>
    </BaseModal>
  );
};

export default SellFromPositionModal;