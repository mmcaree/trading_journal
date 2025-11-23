import React, { useState, useEffect } from 'react';
import {
  Paper, Box, Typography, TextField, Button, Stack, Avatar, Alert, CircularProgress
} from '@mui/material';
import api from '../services/apiConfig';
import { useAuth } from '../context/AuthContext';

interface InstructorNote {
  id: number;
  note_text: string;
  instructor_username: string;
  created_at: string;
  is_flagged: boolean;
}

interface Props {
  positionId: number;
}

const InstructorNotesSection: React.FC<Props> = ({ positionId }) => {
  const { user } = useAuth();
  const isInstructor = user?.role === 'INSTRUCTOR';

  const [notes, setNotes] = useState<InstructorNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = async () => {
    try {
      const res = await api.get(`/api/admin/positions/${positionId}/instructor-notes`);
      setNotes(res.data);
    } catch (err) {
      console.error("Failed to load instructor notes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [positionId]);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/api/admin/positions/${positionId}/instructor-notes`, {
        note_text: newNote,
        is_flagged: false
      });
      setNewNote('');
      fetchNotes();
    } catch (err) {
      alert("Failed to save note");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Paper sx={{ p: 3, mt: 4, border: '2px solid', borderColor: 'primary.main', bgcolor: 'primary.50' }}>
      <Typography variant="h6" gutterBottom color="primary" fontWeight="bold">
        Instructor Feedback
      </Typography>

      {isInstructor && (
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="Add feedback for this position..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            disabled={submitting}
          />
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!newNote.trim() || submitting}
            sx={{ mt: 1 }}
          >
            {submitting ? 'Saving...' : 'Add Note'}
          </Button>
        </Box>
      )}

      {notes.length === 0 ? (
        <Alert severity="info">
          {isInstructor 
            ? "No feedback added yet." 
            : "Your instructor hasn't left feedback on this position yet."
          }
        </Alert>
      ) : (
        <Stack spacing={2}>
          {notes.map((note) => (
            <Paper key={note.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                  {note.instructor_username[0].toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold">
                    {note.instructor_username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(note.created_at).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ whiteSpace: 'pre-wrap', ml: 5 }}>
                {note.note_text}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}
    </Paper>
  );
};

export default InstructorNotesSection;