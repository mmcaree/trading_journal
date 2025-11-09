import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  ImageList,
  ImageListItem,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Note as NoteIcon,
  School as LessonIcon,
  Warning as MistakeIcon,
  Analytics as AnalysisIcon,
  Image as ImageIcon,
  ShowChart as ChartIcon,
  OpenInNew as OpenIcon
} from '@mui/icons-material';
import { formatDateTimeLocal } from '../utils/dateUtils';
import { JournalEntry as JournalEntryType } from '../services/journalService';

interface JournalEntryProps {
  entry: JournalEntryType;
  onEdit: (id: number, updates: { entry_type?: 'note' | 'lesson' | 'mistake' | 'analysis'; content?: string; entry_date?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onViewImage?: (imageUrl: string, imageDescription?: string) => void;
}

const entryTypeIcons = {
  note: <NoteIcon fontSize="small" />,
  lesson: <LessonIcon fontSize="small" />,
  mistake: <MistakeIcon fontSize="small" />,
  analysis: <AnalysisIcon fontSize="small" />
};

const entryTypeColors = {
  note: 'primary',
  lesson: 'success',
  mistake: 'error',
  analysis: 'info'
} as const;

const entryTypeLabels = {
  note: 'Note',
  lesson: 'Lesson',
  mistake: 'Mistake',
  analysis: 'Analysis'
};

export const JournalEntryComponent: React.FC<JournalEntryProps> = ({ entry, onEdit, onDelete, onViewImage }) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    entry_type: entry.entry_type,
    content: entry.content,
    entry_date: formatDateTimeLocal(new Date(entry.entry_date))
  });
  const [loading, setLoading] = useState(false);

  const handleEdit = async () => {
    setLoading(true);
    try {
      await onEdit(entry.id, {
        entry_type: editForm.entry_type,
        content: editForm.content,
        entry_date: new Date(editForm.entry_date).toISOString()
      });
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Failed to edit entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete(entry.id);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card sx={{ mb: 2, backgroundColor: 'grey.900' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                icon={entryTypeIcons[entry.entry_type]}
                label={entryTypeLabels[entry.entry_type]}
                color={entryTypeColors[entry.entry_type]}
                size="small"
              />
              <Typography variant="caption" color="text.secondary">
                {new Date(entry.entry_date).toLocaleDateString()} at {new Date(entry.entry_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
            <Box>
              <IconButton size="small" onClick={() => setEditDialogOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setDeleteDialogOpen(true)} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {entry.content}
          </Typography>

          {/* Attached Images */}
          {entry.attached_images && entry.attached_images.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ImageIcon fontSize="small" color="primary" />
                <Typography variant="caption" color="text.secondary">
                  Attached Screenshots ({entry.attached_images.length})
                </Typography>
              </Box>
              <ImageList cols={2} rowHeight={120} sx={{ maxHeight: 250 }}>
                {entry.attached_images.map((image, index) => (
                  <ImageListItem key={index}>
                    <img
                      src={image.url}
                      alt={image.description || 'Attached screenshot'}
                      loading="lazy"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (onViewImage) {
                          onViewImage(image.url, image.description);
                        } else {
                          window.open(image.url, '_blank');
                        }
                      }}
                    />
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        bgcolor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        p: 0.5
                      }}
                    >
                      <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                        {image.description || 'Screenshot'}
                      </Typography>
                    </Box>
                  </ImageListItem>
                ))}
              </ImageList>
            </Box>
          )}

          {/* Attached Charts */}
          {entry.attached_charts && entry.attached_charts.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ChartIcon fontSize="small" color="secondary" />
                <Typography variant="caption" color="text.secondary">
                  Referenced Charts ({entry.attached_charts.length})
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {entry.attached_charts.map((chartId) => (
                  <Chip
                    key={chartId}
                    label={`Chart #${chartId}`}
                    size="small"
                    color="secondary"
                    variant="outlined"
                    icon={<ChartIcon />}
                  />
                ))}
              </Box>
            </Box>
          )}
          
          {entry.created_at !== entry.updated_at && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
              Last edited: {new Date(entry.updated_at).toLocaleDateString()} at {new Date(entry.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Journal Entry</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Entry Type</InputLabel>
              <Select
                value={editForm.entry_type}
                label="Entry Type"
                onChange={(e) => setEditForm({ ...editForm, entry_type: e.target.value as any })}
              >
                <MenuItem value="note">📝 Note</MenuItem>
                <MenuItem value="lesson">📚 Lesson</MenuItem>
                <MenuItem value="mistake">❌ Mistake</MenuItem>
                <MenuItem value="analysis">📊 Analysis</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Entry Date & Time"
              type="datetime-local"
              value={editForm.entry_date}
              onChange={(e) => setEditForm({ ...editForm, entry_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            
            <TextField
              label="Content"
              multiline
              minRows={4}
              value={editForm.content}
              onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEdit} variant="contained" disabled={loading || !editForm.content.trim()}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Journal Entry</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this journal entry? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};