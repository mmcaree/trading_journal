import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Fade,
  IconButton,
  Chip,
  ImageList,
  ImageListItem
} from '@mui/material';
import {
  Add as AddIcon,
  MenuBook as JournalIcon,
  PhotoCamera as PhotoIcon,
  Delete as DeleteIcon,
  ShowChart as ChartIcon
} from '@mui/icons-material';
import { JournalEntryComponent } from './JournalEntry';
import { journalService, JournalEntry, JournalEntryCreate } from '../services/journalService';
import { positionImageService } from '../services/positionImageService';
import { getCurrentLocalDateTime } from '../utils/dateUtils';

interface JournalEntryListProps {
  positionId: number;
  onViewImage?: (imageUrl: string, imageDescription?: string) => void;
}

export const JournalEntryList: React.FC<JournalEntryListProps> = ({ positionId, onViewImage }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState<JournalEntryCreate>({
    entry_type: 'note',
    content: '',
    entry_date: getCurrentLocalDateTime(),
    attached_images: [],
    attached_charts: []
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadEntries = async () => {
    try {
      setLoading(true);
      console.log('Loading journal entries for position:', positionId);
      const data = await journalService.getJournalEntries(positionId);
      console.log('Loaded journal entries:', data);
      
      // Validate that data is an array
      if (Array.isArray(data)) {
        setEntries(data);
        setError(null);
      } else {
        console.error('Invalid data format received:', data);
        throw new Error('Invalid data format: expected array of journal entries');
      }
    } catch (err: any) {
      console.error('Failed to load journal entries:', err);
      setError(err.message || 'Failed to load journal entries');
      // Force fallback by re-throwing the error
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [positionId]);

  const handleAddEntry = async () => {
    if (!newEntry.content.trim()) return;

    setSaving(true);
    try {
      const createdEntry = await journalService.createJournalEntry(positionId, {
        ...newEntry,
        entry_date: new Date(newEntry.entry_date!).toISOString()
      });
      
      setEntries(prev => [createdEntry, ...prev]); // Add to beginning for reverse chronological order
      setAddDialogOpen(false);
      setNewEntry({
        entry_type: 'note',
        content: '',
        entry_date: getCurrentLocalDateTime(),
        attached_images: [],
        attached_charts: []
      });
      setError(null);
    } catch (err: any) {
      console.error('Failed to create journal entry:', err);
      setError(err.message || 'Failed to create journal entry');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const uploadResult = await positionImageService.uploadImage(file);
      const newImage = {
        url: uploadResult.image_url,
        description: file.name || 'Screenshot'
      };
      
      setNewEntry(prev => ({
        ...prev,
        attached_images: [...(prev.attached_images || []), newImage]
      }));
    } catch (err: any) {
      console.error('Failed to upload image:', err);
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setNewEntry(prev => ({
      ...prev,
      attached_images: prev.attached_images?.filter((_, i) => i !== index) || []
    }));
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    event.preventDefault();
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setUploadingImage(true);
          try {
            const uploadResult = await positionImageService.uploadImage(file);
            const newImage = {
              url: uploadResult.image_url,
              description: `Pasted screenshot ${new Date().toLocaleTimeString()}`
            };
            
            setNewEntry(prev => ({
              ...prev,
              attached_images: [...(prev.attached_images || []), newImage]
            }));
          } catch (err: any) {
            console.error('Failed to upload pasted image:', err);
            setError(err.message || 'Failed to upload pasted image');
          } finally {
            setUploadingImage(false);
          }
        }
        break; // Only handle the first image
      }
    }
  };

  const handleEditEntry = async (id: number, updates: { entry_type?: 'note' | 'lesson' | 'mistake' | 'analysis'; content?: string; entry_date?: string }) => {
    try {
      const updatedEntry = await journalService.updateJournalEntry(id, updates);
      setEntries(prev => prev.map(entry => entry.id === id ? updatedEntry : entry));
      setError(null);
    } catch (err: any) {
      console.error('Failed to update journal entry:', err);
      setError(err.message || 'Failed to update journal entry');
      throw err; // Re-throw so the component can handle loading states
    }
  };

  const handleDeleteEntry = async (id: number) => {
    try {
      await journalService.deleteJournalEntry(id);
      setEntries(prev => prev.filter(entry => entry.id !== id));
      setError(null);
    } catch (err: any) {
      console.error('Failed to delete journal entry:', err);
      setError(err.message || 'Failed to delete journal entry');
      throw err; // Re-throw so the component can handle loading states
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>Loading journal entries...</Typography>
      </Box>
    );
  }

  // Debug: Log render state
  console.log('JournalEntryList render:', { loading, error, entriesCount: entries.length, positionId });

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          📖 Trading Journal
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialogOpen(true)}
          size="small"
        >
          New Entry
        </Button>
      </Box>

      {error && (
        <Fade in>
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        </Fade>
      )}

      {entries.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <JournalIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No journal entries yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Start writing your trading story like in a physical notebook
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
          >
            Write First Entry
          </Button>
        </Box>
      ) : (
        <Box>
          {entries.map((entry) => (
            <JournalEntryComponent
              key={entry.id}
              entry={entry}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
              onViewImage={onViewImage}
            />
          ))}
        </Box>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <JournalIcon />
          New Journal Entry
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Entry Type</InputLabel>
              <Select
                value={newEntry.entry_type}
                label="Entry Type"
                onChange={(e) => setNewEntry({ ...newEntry, entry_type: e.target.value as any })}
              >
                <MenuItem value="note">📝 Note</MenuItem>
                <MenuItem value="lesson">📚 Lesson Learned</MenuItem>
                <MenuItem value="mistake">❌ Mistake Made</MenuItem>
                <MenuItem value="analysis">📊 Analysis</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Entry Date & Time"
              type="datetime-local"
              value={newEntry.entry_date}
              onChange={(e) => setNewEntry({ ...newEntry, entry_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="When did this thought or event occur?"
            />
            
            <TextField
              label="What happened? What are you thinking?"
              multiline
              minRows={4}
              value={newEntry.content}
              onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
              fullWidth
              placeholder="Write like you're taking notes in a physical trading journal..."
              helperText={`${newEntry.content.length} characters`}
            />
            
            {/* Image Upload Section */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2">
                  📸 Screenshots & Images
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<PhotoIcon />}
                  disabled={uploadingImage}
                  size="small"
                >
                  {uploadingImage ? 'Uploading...' : 'Add Image'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </Button>
              </Box>
              
              {/* Paste Area */}
              <Box
                onPaste={handlePaste}
                tabIndex={0}
                sx={{
                  border: '2px dashed',
                  borderColor: newEntry.attached_images && newEntry.attached_images.length > 0 ? 'primary.main' : 'grey.100',
                  borderRadius: 2,
                  p: 2,
                  backgroundColor: 'grey.800',
                  cursor: 'pointer',
                  textAlign: 'center',
                  '&:hover': {
                    backgroundColor: 'grey.600',
                    borderColor: 'primary.main'
                  },
                  '&:focus': {
                    outline: 'none',
                    borderColor: 'primary.main',
                    backgroundColor: 'grey.600'
                  }
                }}
              >
                <Typography variant="caption" color="text.main">
                  📋 Click here and paste (Ctrl+V) to add screenshots
                </Typography>
                {uploadingImage && (
                  <Box sx={{ mt: 1 }}>
                    <CircularProgress size={20} />
                  </Box>
                )}
              </Box>
              
              {/* Image Preview */}
              {newEntry.attached_images && newEntry.attached_images.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    {newEntry.attached_images.length} image(s) attached
                  </Typography>
                  <ImageList cols={3} rowHeight={80} sx={{ maxHeight: 180 }}>
                    {newEntry.attached_images.map((image, index) => (
                      <ImageListItem key={index} sx={{ position: 'relative' }}>
                        <img
                          src={image.url}
                          alt={image.description}
                          style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveImage(index)}
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            '&:hover': { backgroundColor: 'rgba(255,255,255,0.9)' }
                          }}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </ImageListItem>
                    ))}
                  </ImageList>
                </Box>
              )}
            </Box>


          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleAddEntry} 
            variant="contained" 
            disabled={saving || !newEntry.content.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : null}
          >
            {saving ? 'Saving...' : 'Add Entry'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};