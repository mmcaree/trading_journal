import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  InputAdornment
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { PartialExit } from '../services/tradeService';

interface PartialExitsProps {
  partialExits: PartialExit[];
  onPartialExitsChange: (partialExits: PartialExit[]) => void;
  entryPrice: number;
  totalShares: number;
  tradeType: 'long' | 'short';
  disabled?: boolean;
}

const PartialExits: React.FC<PartialExitsProps> = ({
  partialExits,
  onPartialExitsChange,
  entryPrice,
  totalShares,
  tradeType,
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [exitPrice, setExitPrice] = useState<string>('');
  const [exitDate, setExitDate] = useState<Date | null>(new Date());
  const [sharesSold, setSharesSold] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Calculate the remaining shares after all partial exits
  const remainingShares = totalShares - partialExits.reduce((sum, exit) => sum + exit.shares_sold, 0);

  const handleOpen = () => {
    // Reset form
    setExitPrice('');
    setExitDate(new Date());
    setSharesSold('');
    setNotes('');
    setEditingIndex(null);
    setOpen(true);
  };

  const handleEdit = (index: number) => {
    const exit = partialExits[index];
    setExitPrice(exit.exit_price.toString());
    setExitDate(new Date(exit.exit_date));
    setSharesSold(exit.shares_sold.toString());
    setNotes(exit.notes || '');
    setEditingIndex(index);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = () => {
    // Validate inputs
    if (!exitPrice || !exitDate || !sharesSold) {
      alert('Please fill in all required fields.');
      return;
    }

    const parsedExitPrice = parseFloat(exitPrice);
    const parsedSharesSold = parseInt(sharesSold, 10);

    // Check that the shares sold doesn't exceed remaining shares
    if (editingIndex === null && parsedSharesSold > remainingShares) {
      alert(`You can only sell up to ${remainingShares} remaining shares.`);
      return;
    }

    // Check if editing an existing exit
    if (editingIndex !== null && 
        parsedSharesSold > (remainingShares + partialExits[editingIndex].shares_sold)) {
      alert(`You can only sell up to ${remainingShares + partialExits[editingIndex].shares_sold} shares.`);
      return;
    }

    // Calculate profit/loss
    let profitLoss: number;
    if (tradeType === 'long') {
      profitLoss = (parsedExitPrice - entryPrice) * parsedSharesSold;
    } else {
      profitLoss = (entryPrice - parsedExitPrice) * parsedSharesSold;
    }

    const newExit: PartialExit = {
      exit_price: parsedExitPrice,
      exit_date: exitDate.toISOString(),
      shares_sold: parsedSharesSold,
      profit_loss: profitLoss,
      notes: notes || undefined
    };

    let updatedExits: PartialExit[];
    if (editingIndex !== null) {
      // Update existing exit
      updatedExits = [...partialExits];
      updatedExits[editingIndex] = newExit;
    } else {
      // Add new exit
      updatedExits = [...partialExits, newExit];
    }

    // Sort by date (newest first)
    updatedExits.sort((a, b) => new Date(b.exit_date).getTime() - new Date(a.exit_date).getTime());

    onPartialExitsChange(updatedExits);
    handleClose();
  };

  const handleDelete = (index: number) => {
    if (window.confirm('Are you sure you want to delete this exit?')) {
      const updatedExits = partialExits.filter((_, i) => i !== index);
      onPartialExitsChange(updatedExits);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Partial Exits</Typography>
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleOpen}
          disabled={disabled || remainingShares <= 0}
        >
          Add Exit
        </Button>
      </Box>

      {partialExits.length > 0 ? (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Shares</TableCell>
                <TableCell>P/L</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {partialExits.map((exit, index) => (
                <TableRow key={index}>
                  <TableCell>{new Date(exit.exit_date).toLocaleDateString()}</TableCell>
                  <TableCell>${exit.exit_price.toFixed(2)}</TableCell>
                  <TableCell>{exit.shares_sold}</TableCell>
                  <TableCell style={{ color: exit.profit_loss >= 0 ? 'green' : 'red' }}>
                    ${exit.profit_loss.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      onClick={() => handleEdit(index)}
                      disabled={disabled}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => handleDelete(index)}
                      disabled={disabled}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No partial exits recorded.
        </Typography>
      )}

      <Box mt={2}>
        <Typography variant="body2">
          Remaining Shares: <strong>{remainingShares}</strong> of {totalShares}
        </Typography>
      </Box>

      {/* Add/Edit Partial Exit Dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingIndex !== null ? 'Edit Partial Exit' : 'Add Partial Exit'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Exit Date"
                value={exitDate}
                onChange={(date) => setExitDate(date)}
                sx={{ width: '100%', mb: 2 }}
              />
            </LocalizationProvider>

            <TextField
              fullWidth
              label="Exit Price"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              type="number"
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              margin="normal"
            />

            <TextField
              fullWidth
              label="Shares Sold"
              value={sharesSold}
              onChange={(e) => setSharesSold(e.target.value)}
              type="number"
              margin="normal"
              helperText={`Maximum available: ${
                editingIndex !== null 
                  ? remainingShares + partialExits[editingIndex].shares_sold 
                  : remainingShares
              }`}
            />

            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={3}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PartialExits;
