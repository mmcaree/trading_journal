import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  Alert,
  IconButton,
  ImageList,
  ImageListItem
} from '@mui/material';
import {
  Save as SaveIcon,
  Warning as WarningIcon,
  PhotoCamera as PhotoIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { positionImageService } from '../services/positionImageService';

interface TemporaryNotesProps {
  positionId: number;
  initialNotes?: string;
  initialLessons?: string;
  initialMistakes?: string;
}

export const TemporaryNotes: React.FC<TemporaryNotesProps> = ({ 
  positionId, 
  initialNotes = '', 
  initialLessons = '', 
  initialMistakes = '' 
}) => {
  const [notes, setNotes] = useState(initialNotes);
  const [lessons, setLessons] = useState(initialLessons);
  const [mistakes, setMistakes] = useState(initialMistakes);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await positionImageService.updatePositionNotes(positionId, notes, lessons, mistakes);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Alert severity="success" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box>
            <Typography variant="body2" fontWeight={600}>
              📝 Trading Notes System
            </Typography>
            <Typography variant="caption">
              Full notes functionality available. The diary-style journal upgrade is ready for backend deployment.
            </Typography>
          </Box>
        </Box>
      </Alert>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          📝 Trading Notes
        </Typography>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          size="small"
        >
          {saving ? 'Saving...' : 'Save Notes'}
        </Button>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Notes saved successfully!
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            General Notes
          </Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your trading notes here..."
            variant="outlined"
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            📚 Lessons Learned
          </Typography>
          <TextField
            multiline
            minRows={3}
            fullWidth
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            placeholder="What did you learn from this trade?"
            variant="outlined"
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            ❌ Mistakes Made
          </Typography>
          <TextField
            multiline
            minRows={3}
            fullWidth
            value={mistakes}
            onChange={(e) => setMistakes(e.target.value)}
            placeholder="What mistakes were made?"
            variant="outlined"
          />
        </Grid>
      </Grid>
    </>
  );
};