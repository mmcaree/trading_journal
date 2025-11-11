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
  MenuItem,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { Position, updatePosition } from '../services/positionsService';

export interface EditPositionFormData {
  strategy?: string;
  setup_type?: string;
  timeframe?: string;
  notes?: string;
  lessons?: string;
  mistakes?: string;
}

export interface EditPositionModalProps {
  open: boolean;
  onClose: () => void;
  position: Position;
  onSuccess?: (updatedPosition: Position) => void;
}

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

const EditPositionModal: React.FC<EditPositionModalProps> = ({
  open,
  onClose,
  position,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<EditPositionFormData>({
    defaultValues: {
      strategy: position.strategy || '',
      setup_type: position.setup_type || '',
      timeframe: position.timeframe || '',
      notes: position.notes || '',
      lessons: position.lessons || '',
      mistakes: position.mistakes || ''
    }
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({
        strategy: position.strategy || '',
        setup_type: position.setup_type || '',
        timeframe: position.timeframe || '',
        notes: position.notes || '',
        lessons: position.lessons || '',
        mistakes: position.mistakes || ''
      });
      setError(null);
    }
  }, [open, position, reset]);

  const onSubmit = async (data: EditPositionFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Filter out empty strings to avoid overwriting with blanks
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== '')
      );

      const updatedPosition = await updatePosition(position.id, updates);
      onSuccess?.(updatedPosition);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update position');
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
        <Typography variant="h6">
          Edit Position: {position.ticker}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Current Shares: {position.current_shares} | Status: {position.status}
          </Typography>
        </Box>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            
            {/* Strategy */}
            <Grid item xs={12} md={6}>
              <Controller
                name="strategy"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Strategy</InputLabel>
                    <Select
                      {...field}
                      label="Strategy"
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {STRATEGIES.map((strategy) => (
                        <MenuItem key={strategy} value={strategy}>
                          {strategy}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            {/* Setup Type */}
            <Grid item xs={12} md={6}>
              <Controller
                name="setup_type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Setup Type</InputLabel>
                    <Select
                      {...field}
                      label="Setup Type"
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {SETUP_TYPES.map((setup) => (
                        <MenuItem key={setup} value={setup}>
                          {setup}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            {/* Timeframe */}
            <Grid item xs={12} md={6}>
              <Controller
                name="timeframe"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Timeframe</InputLabel>
                    <Select
                      {...field}
                      label="Timeframe"
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {TIMEFRAMES.map((timeframe) => (
                        <MenuItem key={timeframe} value={timeframe}>
                          {timeframe}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            {/* Spacer */}
            <Grid item xs={12} md={6}></Grid>

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
                    placeholder="General notes about this position..."
                  />
                )}
              />
            </Grid>

            {/* Lessons */}
            <Grid item xs={12}>
              <Controller
                name="lessons"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Lessons Learned"
                    multiline
                    rows={2}
                    fullWidth
                    placeholder="What did you learn from this position?"
                  />
                )}
              />
            </Grid>

            {/* Mistakes */}
            <Grid item xs={12}>
              <Controller
                name="mistakes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Mistakes Made"
                    multiline
                    rows={2}
                    fullWidth
                    placeholder="What mistakes were made? How can you avoid them next time?"
                  />
                )}
              />
            </Grid>

          </Grid>
        </form>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit(onSubmit)}
          variant="contained" 
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Position'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditPositionModal;