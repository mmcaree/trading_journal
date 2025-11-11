import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  Alert,
  InputAdornment,
  Chip,
  Tooltip
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { useCurrency } from '../context/CurrencyContext';
import { PositionEvent, updateEventComprehensive, deleteEvent } from '../services/positionsService';
import { getCurrentLocalDateTime, parseLocalDateTimeToISO } from '../utils/dateUtils';

export interface EditEventFormData {
  shares: number;
  price: number;
  event_date: string;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

export interface EditEventModalProps {
  open: boolean;
  onClose: () => void;
  event: PositionEvent;
  isOptions?: boolean;
  onSuccess?: (updatedEvent: PositionEvent) => void;
}

const EditEventModal: React.FC<EditEventModalProps> = ({
  open,
  onClose,
  event,
  isOptions = false,
  onSuccess
}) => {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<EditEventFormData>({
    defaultValues: {
      shares: event.shares,
      price: isOptions ? event.price / 100 : event.price, // Convert from actual price to contract price for options
      event_date: event.event_date.includes('T') 
        ? event.event_date.slice(0, 16) // Remove seconds if present
        : event.event_date,
      stop_loss: event.stop_loss ? (isOptions ? event.stop_loss / 100 : event.stop_loss) : undefined,
      take_profit: event.take_profit ? (isOptions ? event.take_profit / 100 : event.take_profit) : undefined,
      notes: event.notes || ''
    }
  });

  // Watch form values for real-time calculations
  const shares = watch('shares');
  const price = watch('price');
  const stopLoss = watch('stop_loss');
  const takeProfit = watch('take_profit');

  // Calculate price multiplier for options
  const multiplier = isOptions ? 100 : 1;
  const actualPrice = (price || 0) * multiplier;
  const totalValue = (shares || 0) * actualPrice;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({
        shares: event.shares,
        price: isOptions ? event.price / 100 : event.price,
        event_date: event.event_date.includes('T') 
          ? event.event_date.slice(0, 16) 
          : event.event_date,
        stop_loss: event.stop_loss ? (isOptions ? event.stop_loss / 100 : event.stop_loss) : undefined,
        take_profit: event.take_profit ? (isOptions ? event.take_profit / 100 : event.take_profit) : undefined,
        notes: event.notes || ''
      });
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [open, event, isOptions, reset]);

  const onSubmit = async (data: EditEventFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Convert options prices back to actual dollar amounts
      const updatedEvent = await updateEventComprehensive(event.id, {
        shares: data.shares,
        price: isOptions ? data.price * 100 : data.price,
        event_date: parseLocalDateTimeToISO(data.event_date),
        stop_loss: data.stop_loss ? (isOptions ? data.stop_loss * 100 : data.stop_loss) : undefined,
        take_profit: data.take_profit ? (isOptions ? data.take_profit * 100 : data.take_profit) : undefined,
        notes: data.notes || undefined
      });

      onSuccess?.(updatedEvent);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update event');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      await deleteEvent(event.id);
      onSuccess?.(event); // Trigger refresh
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { bgcolor: 'background.paper' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            Edit {event.event_type.toUpperCase()} Event
          </Typography>
          <Chip 
            label={event.event_type.toUpperCase()} 
            color={event.event_type === 'buy' ? 'success' : 'error'}
            size="small"
          />
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {showDeleteConfirm && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Are you sure you want to delete this event? This action cannot be undone.
            </Typography>
            <Box mt={1}>
              <Button 
                size="small" 
                color="error" 
                variant="contained" 
                onClick={handleDelete}
                disabled={loading}
                sx={{ mr: 1 }}
              >
                Yes, Delete
              </Button>
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </Box>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            
            {/* Shares and Price Row */}
            <Grid item xs={12} md={6}>
              <Controller
                name="shares"
                control={control}
                rules={{ 
                  required: 'Shares is required',
                  min: { value: 1, message: 'Must be at least 1 share' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={isOptions ? "Contracts" : "Shares"}
                    type="number"
                    fullWidth
                    required
                    error={!!errors.shares}
                    helperText={errors.shares?.message}
                    inputProps={{ min: 1, step: 1 }}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="price"
                control={control}
                rules={{ 
                  required: 'Price is required',
                  min: { value: 0.01, message: 'Must be greater than 0' }
                }}
                render={({ field }) => (
                  <Tooltip title={isOptions ? "Price per contract (will be multiplied by 100)" : "Price per share"}>
                    <TextField
                      {...field}
                      label={isOptions ? "Price per Contract" : "Price per Share"}
                      type="number"
                      fullWidth
                      required
                      error={!!errors.price}
                      helperText={
                        isOptions 
                          ? `Contract price (× 100 = ${formatCurrency(actualPrice)} actual)`
                          : errors.price?.message
                      }
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                        endAdornment: isOptions && (
                          <InputAdornment position="end">
                            <Chip label="per contract" size="small" />
                          </InputAdornment>
                        )
                      }}
                      inputProps={{ min: 0.01, step: 0.01 }}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </Tooltip>
                )}
              />
            </Grid>

            {/* Event Date */}
            <Grid item xs={12} md={6}>
              <Controller
                name="event_date"
                control={control}
                rules={{ required: 'Event date is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Event Date & Time"
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

            {/* Total value display */}
            <Grid item xs={12} md={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Value
                </Typography>
                <Typography variant="h6" color="primary">
                  {formatCurrency(totalValue)}
                </Typography>
              </Box>
            </Grid>

            {/* Risk Management */}
            <Grid item xs={12} md={6}>
              <Controller
                name="stop_loss"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Stop Loss"
                    type="number"
                    fullWidth
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0.01, step: 0.01 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="take_profit"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Take Profit"
                    type="number"
                    fullWidth
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0.01, step: 0.01 }}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                  />
                )}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Notes"
                    multiline
                    rows={3}
                    fullWidth
                    placeholder="Event notes, reasoning, market conditions..."
                  />
                )}
              />
            </Grid>

          </Grid>
        </form>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          color="error" 
          onClick={() => setShowDeleteConfirm(true)}
          disabled={loading}
        >
          Delete Event
        </Button>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit(onSubmit)}
          variant="contained" 
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Event'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditEventModal;