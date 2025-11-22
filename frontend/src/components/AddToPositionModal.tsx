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
  Chip,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';

import BaseModal from './BaseModal';
import { Position, addToPosition } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import PerEventStopLossManager, { PerEventRiskLevels } from './PerEventStopLossManager';

import { getCurrentLocalDateTime, parseLocalDateTimeToISO } from '../utils/dateUtils';
import { accountService } from '../services/accountService';
import { HELPER_TEXT } from '../utils/validationSchemas';

export interface AddToPositionFormData {
  shares: number;
  price: number;
  event_date: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

export interface AddToPositionModalProps {
  open: boolean;
  onClose: () => void;
  position: Position;
  onSuccess?: (updatedPosition: Position) => void;
}

const AddToPositionModal: React.FC<AddToPositionModalProps> = ({
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
  const form = useForm<AddToPositionFormData>({
    mode: 'onChange',
    defaultValues: {
      shares: 0,
      price: 0,
      event_date: getCurrentLocalDateTime(), // Format for datetime-local input in user's local time
      notes: ''
    }
  });

  const { control, handleSubmit, formState: { errors, isValid }, watch, reset, setValue } = form;

  // Watch form values for real-time calculations
  const watchedValues = watch();
  const { shares, price } = watchedValues;

  // Options detection from position
  const isOptions = position.instrument_type === 'OPTIONS';
  const multiplier = isOptions ? 100 : 1;

  // Get account balance for risk percentage calculations
  const accountBalance = accountService.getCurrentBalance();

  // Real-time calculations with options multiplier
  const actualPrice = (price || 0) * multiplier;
  const totalCost = (shares || 0) * actualPrice;
  const newTotalShares = (position.current_shares || 0) + (shares || 0);
  const newTotalCost = (position.total_cost || 0) + totalCost;
  const newAvgPrice = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({
        shares: 0,
        price: parseFloat((position.avg_entry_price || 0).toFixed(2)), // Format to 2 decimal places
        event_date: getCurrentLocalDateTime(),
        stop_loss: position.current_stop_loss || undefined,
        take_profit: position.current_take_profit || undefined,
        notes: ''
      });
      setError(null);
    }
  }, [open, position, reset]);

  // Handle form submission
  const onSubmit = async (data: AddToPositionFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Basic validation
      if (!data.shares || data.shares <= 0) {
        setError('Shares must be greater than 0');
        return;
      }
      if (!data.price || data.price <= 0) {
        setError('Price must be greater than 0');
        return;
      }



      // Determine which stop loss and take profit to use
      const finalStopLoss = perEventRisk.useEventLevels 
        ? perEventRisk.stopLoss 
        : data.stop_loss;
      const finalTakeProfit = perEventRisk.useEventLevels 
        ? perEventRisk.takeProfit 
        : data.take_profit;

      // Call the API with properly converted price for options
      await addToPosition(position.id, {
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
        current_shares: newTotalShares,
        total_cost: newTotalCost,
        avg_entry_price: newAvgPrice,
        current_stop_loss: finalStopLoss || position.current_stop_loss,
        current_take_profit: finalTakeProfit || position.current_take_profit,
        events_count: position.events_count + 1
      };

      // Success callback
      if (onSuccess) {
        onSuccess(optimisticPosition);
      }

      // Close modal
      onClose();

    } catch (err: any) {
      console.error('Failed to add to position:', err);
      setError(err.message || 'Failed to add to position. Please try again.');
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

  // Smart price suggestion based on current position
  const suggestCurrentPrice = () => {
    if (position.avg_entry_price) {
      const formattedPrice = parseFloat(position.avg_entry_price.toFixed(2));
      setValue('price', formattedPrice);
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={handleCancel}
      title={`Add to ${position.ticker} Position`}
      loading={loading}
      error={error}
      maxWidth="md"
      onSubmit={handleSubmit(onSubmit)}
      submitDisabled={loading || !shares || shares <= 0 || !price || price <= 0}
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
            disabled={loading || !shares || shares <= 0 || !price || price <= 0}
            startIcon={<AddIcon />}
          >
            Add to Position (Ctrl+Enter)
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
                  <Typography variant="body2" color="text.secondary">Stop Loss</Typography>
                  <Typography variant="h6">
                    {position.current_stop_loss ? formatCurrency(position.current_stop_loss) : 'None'}
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

          {/* Shares Input */}
          <Grid item xs={12} sm={6}>
            <Controller
              name="shares"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={isOptions ? "Contracts to Add" : "Shares to Add"}
                  type="number"
                  fullWidth
                  required
                  error={!!errors.shares}
                  helperText={errors.shares?.message || HELPER_TEXT.shares}
                  inputProps={{ 
                    min: 1, 
                    max: 100000,
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
                  label={isOptions ? "Price per Contract" : "Entry Price"}
                  type="number"
                  fullWidth
                  required
                  error={!!errors.price}
                  helperText={
                    isOptions 
                      ? "Price per contract (will be multiplied by 100)"
                      : errors.price?.message || HELPER_TEXT.price
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
                          <Tooltip title="Options contracts are multiplied by 100. For example, $1.50 per contract = $150 actual cost">
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
                  label="Entry Date & Time"
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

          {/* Real-time Calculations */}
          <Grid item xs={12} sm={6}>
            <Paper sx={{ p: 2, backgroundColor: 'success.light', color: 'success.contrastText' }}>
              <Typography variant="subtitle2" gutterBottom>
                📊 New Position Metrics
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Addition Cost:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(totalCost)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">New Total Shares:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {newTotalShares.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">New Avg Price:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(newAvgPrice)}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
          </Grid>

          {/* Advanced Per-Event Risk Management */}
          <Grid item xs={12}>
            <PerEventStopLossManager
              position={position}
              eventShares={shares || 0}
              eventPrice={price || 0}
              eventType="buy"
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
                  helperText={errors.notes?.message || "Additional context for this position addition"}
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

export default AddToPositionModal;