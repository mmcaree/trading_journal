import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  TextField,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';

import BaseModal from './BaseModal';
import { Position, PositionDetails, PositionEvent, updatePositionEvent, EventUpdateData, getPositionDetails } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';

export interface UpdateStopLossModalProps {
  open: boolean;
  onClose: () => void;
  position: Position;
  positionDetails?: PositionDetails;
  onSuccess?: (updatedPosition: Position) => void;
}

const UpdateStopLossModal: React.FC<UpdateStopLossModalProps> = ({
  open,
  onClose,
  position,
  positionDetails,
  onSuccess
}) => {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEvents, setEditingEvents] = useState<{[eventId: number]: {stopLoss: string, takeProfit: string}}>({});
  const [internalPositionDetails, setInternalPositionDetails] = useState<PositionDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Use provided positionDetails or internal state
  const effectivePositionDetails = positionDetails || internalPositionDetails;

  useEffect(() => {
    if (open) {
      setError(null);
      setEditingEvents({});
      // Auto-load position details if not provided
      if (!positionDetails && !internalPositionDetails) {
        loadPositionDetails();
      }
    }
  }, [open, positionDetails, internalPositionDetails]);

  const loadPositionDetails = async () => {
    console.log('Loading position details for position ID:', position.id);
    setLoadingDetails(true);
    setError(null);
    try {
      const details = await getPositionDetails(position.id);
      console.log('Position details loaded:', details);
      setInternalPositionDetails(details);
    } catch (err) {
      console.error('Error loading position details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load position details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    setEditingEvents({});
    onClose();
  };

  const handleEditEvent = (event: PositionEvent) => {
    setEditingEvents(prev => ({
      ...prev,
      [event.id]: {
        stopLoss: event.stop_loss?.toString() || '',
        takeProfit: event.take_profit?.toString() || ''
      }
    }));
  };

  const handleCancelEventEdit = (eventId: number) => {
    setEditingEvents(prev => {
      const updated = { ...prev };
      delete updated[eventId];
      return updated;
    });
  };

  const handleSaveEventChanges = async (eventId: number) => {
    const editData = editingEvents[eventId];
    if (!editData) return;

    setLoading(true);
    setError(null);

    try {
      const updateData: EventUpdateData = {};
      
      if (editData.stopLoss.trim()) {
        const stopLossValue = parseFloat(editData.stopLoss);
        if (!isNaN(stopLossValue) && stopLossValue > 0) {
          updateData.stop_loss = stopLossValue;
        }
      }
      
      if (editData.takeProfit.trim()) {
        const takeProfitValue = parseFloat(editData.takeProfit);
        if (!isNaN(takeProfitValue) && takeProfitValue > 0) {
          updateData.take_profit = takeProfitValue;
        }
      }

      // Update the individual event
      await updatePositionEvent(eventId, updateData);

      // Remove from editing state
      setEditingEvents(prev => {
        const updated = { ...prev };
        delete updated[eventId];
        return updated;
      });

      // Refresh position details to show updated values
      const updatedDetails = await getPositionDetails(position.id);
      setInternalPositionDetails(updatedDetails);

      // Optionally call onSuccess if provided
      if (onSuccess) {
        // You might want to fetch the updated position here
        onSuccess(position);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={handleCancel}
      title={`Manage ${position.ticker} Stop Losses & Risk`}
      loading={loading}
      error={error}
      maxWidth="lg"
      actions={
        <>
          <Button onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={loadPositionDetails} 
            variant="outlined"
            disabled={loading || loadingDetails}
          >
            {loadingDetails ? 'Loading...' : 'Refresh Events'}
          </Button>
        </>
      }
    >
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Professional Event-Level Management:</strong> Manage individual stop losses for each buy/sell event. 
          This allows for sophisticated risk management where each addition to your position can have its own stop loss level.
        </Typography>
      </Alert>

      {loadingDetails ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography>Loading position events...</Typography>
        </Box>
      ) : effectivePositionDetails && effectivePositionDetails.events && effectivePositionDetails.events.length > 0 ? (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Shares</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Value</TableCell>
                <TableCell align="center">Stop Loss</TableCell>
                <TableCell align="center">Take Profit</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {effectivePositionDetails.events.map((event: PositionEvent) => {
                const isEditing = editingEvents[event.id];
                
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(event.event_date).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={event.event_type}
                        color={event.event_type.toLowerCase() === 'buy' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {event.shares.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {formatCurrency(event.price)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(event.shares * event.price)}
                      </Typography>
                    </TableCell>
                    
                    {/* Stop Loss Column */}
                    <TableCell align="center">
                      {isEditing ? (
                        <TextField
                          size="small"
                          type="number"
                          placeholder="Stop Loss"
                          value={isEditing.stopLoss}
                          onChange={(e) => setEditingEvents(prev => ({
                            ...prev,
                            [event.id]: { ...prev[event.id], stopLoss: e.target.value }
                          }))}
                          inputProps={{ step: 0.01, min: 0 }}
                          sx={{ width: 100 }}
                        />
                      ) : (
                        <Typography variant="body2">
                          {event.stop_loss ? formatCurrency(event.stop_loss) : '-'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Take Profit Column */}
                    <TableCell align="center">
                      {isEditing ? (
                        <TextField
                          size="small"
                          type="number"
                          placeholder="Take Profit"
                          value={isEditing.takeProfit}
                          onChange={(e) => setEditingEvents(prev => ({
                            ...prev,
                            [event.id]: { ...prev[event.id], takeProfit: e.target.value }
                          }))}
                          inputProps={{ step: 0.01, min: 0 }}
                          sx={{ width: 100 }}
                        />
                      ) : (
                        <Typography variant="body2">
                          {event.take_profit ? formatCurrency(event.take_profit) : '-'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Actions Column */}
                    <TableCell align="center">
                      {isEditing ? (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Save Changes">
                            <IconButton 
                              size="small" 
                              onClick={() => handleSaveEventChanges(event.id)}
                              color="primary"
                            >
                              <SaveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel">
                            <IconButton 
                              size="small" 
                              onClick={() => handleCancelEventEdit(event.id)}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Tooltip title="Edit Stop Loss & Take Profit">
                          <IconButton 
                            size="small" 
                            onClick={() => handleEditEvent(event)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : !effectivePositionDetails ? (
        <Alert severity="warning">
          No position events loaded. Click to load position details.
          <Button size="small" onClick={loadPositionDetails} sx={{ ml: 1 }}>
            Load Details
          </Button>
        </Alert>
      ) : (
        <Alert severity="info">
          No events found for this position.
        </Alert>
      )}

    </BaseModal>
  );
};

export default UpdateStopLossModal;