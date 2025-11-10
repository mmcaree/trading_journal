import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  Flag as FlagIcon,
  Note as NoteIcon,
  TrendingUp as ProfitIcon,
  TrendingDown as LossIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface StudentSummary {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  created_at: string;
  total_positions: number;
  open_positions: number;
  total_pnl: number;
  total_trades: number;
  last_trade_date?: string;
  has_instructor_notes: boolean;
  is_flagged: boolean;
}

interface ClassAnalytics {
  total_students: number;
  active_students: number;
  total_positions: number;
  open_positions: number;
  total_class_pnl: number;
  flagged_students: number;
  average_pnl_per_student: number;
}

interface NoteDialogData {
  student_id: number;
  student_name: string;
  note_text: string;
  is_flagged: boolean;
}

const AdminDashboard: React.FC = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [classAnalytics, setClassAnalytics] = useState<ClassAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<NoteDialogData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    debugCurrentUser(); // Check current user first
    fetchData();
    debugUsers(); // Add debug call
  }, []);

  const debugCurrentUser = async () => {
    console.log('👤 Checking current user...');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/admin-debug/current-user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('👤 Current user response status:', response.status);
      
      if (response.ok) {
        const userData = await response.json();
        console.log('👤 Current user data:', userData);
      } else {
        const errorText = await response.text();
        console.log('👤 Current user failed:', response.status, errorText);
      }
    } catch (err) {
      console.log('👤 Current user error:', err);
    }
  };

  const debugUsers = async () => {
    console.log('🔍 Starting debug users call...');
    try {
      const token = localStorage.getItem('token');
      console.log('🔍 Token exists:', !!token);
      
      const response = await fetch('/api/admin/admin-debug/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('🔍 Debug users response status:', response.status);
      
      if (response.ok) {
        const debugData = await response.json();
        console.log('🔍 Debug users data:', debugData);
      } else {
        const errorText = await response.text();
        console.log('🔍 Debug users failed:', response.status, errorText);
      }
    } catch (err) {
      console.log('🔍 Debug users error:', err);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch students and analytics in parallel
      const [studentsRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/students', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/analytics/class-overview', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      console.log('Students response status:', studentsRes.status);
      console.log('Analytics response status:', analyticsRes.status);
      
      // Check response headers for debugging
      console.log('Students response headers:', studentsRes.headers);
      console.log('Analytics response headers:', analyticsRes.headers);

      if (!studentsRes.ok) {
        const errorText = await studentsRes.text();
        console.error('Students API error:', errorText);
        throw new Error(`Failed to fetch students: ${studentsRes.status} - ${errorText}`);
      }

      if (!analyticsRes.ok) {
        const errorText = await analyticsRes.text();
        console.error('Analytics API error:', errorText);
        throw new Error(`Failed to fetch analytics: ${analyticsRes.status} - ${errorText}`);
      }

      const studentsData = await studentsRes.json();
      const analyticsData = await analyticsRes.json();

      console.log('Students data:', studentsData);
      console.log('Analytics data:', analyticsData);

      // Ensure studentsData is an array
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setClassAnalytics(analyticsData);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentsWithSearch = async (search: string) => {
    try {
      const token = localStorage.getItem('token');
      const url = search 
        ? `/api/admin/students?search=${encodeURIComponent(search)}`
        : '/api/admin/students';
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch students');
      }

      const studentsData = await response.json();
      setStudents(Array.isArray(studentsData) ? studentsData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchTerm(value);
    
    // Debounced search
    setTimeout(() => {
      if (value === searchTerm) {
        fetchStudentsWithSearch(value);
      }
    }, 300);
  };

  const handleViewStudent = (studentId: number) => {
    navigate(`/admin/student/${studentId}`);
  };

  const handleAddNote = (student: StudentSummary) => {
    setNoteDialog({
      student_id: student.id,
      student_name: student.display_name || student.username,
      note_text: '',
      is_flagged: false
    });
  };

  const handleSaveNote = async () => {
    if (!noteDialog) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/student/${noteDialog.student_id}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          note_text: noteDialog.note_text,
          is_flagged: noteDialog.is_flagged
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save note');
      }

      setNoteDialog(null);
      fetchData(); // Refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const formatPnL = (pnl: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(pnl);
    
    return pnl >= 0 ? (
      <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}>
        <ProfitIcon sx={{ fontSize: 16, mr: 0.5 }} />
        {formatted}
      </Box>
    ) : (
      <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
        <LossIcon sx={{ fontSize: 16, mr: 0.5 }} />
        {formatted}
      </Box>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Trading Class Dashboard
      </Typography>

      {/* Class Analytics */}
      {classAnalytics && (
        <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, minWidth: 150, textAlign: 'center' }}>
            <Typography variant="h6" color="primary">
              {classAnalytics.total_students}
            </Typography>
            <Typography variant="body2">Total Students</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 150, textAlign: 'center' }}>
            <Typography variant="h6" color="success.main">
              {classAnalytics.active_students}
            </Typography>
            <Typography variant="body2">Active (30 days)</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 150, textAlign: 'center' }}>
            <Typography variant="h6">
              {classAnalytics.total_positions}
            </Typography>
            <Typography variant="body2">Total Positions</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 200, textAlign: 'center' }}>
            <Typography variant="h6" color={classAnalytics.total_class_pnl >= 0 ? 'success.main' : 'error.main'}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(classAnalytics.total_class_pnl)}
            </Typography>
            <Typography variant="body2">Class Total P&L</Typography>
          </Paper>
          {classAnalytics.flagged_students > 0 && (
            <Paper sx={{ p: 2, minWidth: 150, textAlign: 'center' }}>
              <Typography variant="h6" color="warning.main">
                {classAnalytics.flagged_students}
              </Typography>
              <Typography variant="body2">Flagged Students</Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Student Search */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search students by name, username, or email..."
          value={searchTerm}
          onChange={handleSearch}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {/* Students Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Total P&L</TableCell>
                <TableCell>Positions</TableCell>
                <TableCell>Trades</TableCell>
                <TableCell>Last Trade</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                      No students found. {searchTerm ? 'Try adjusting your search terms.' : 'There are currently no student accounts in the system.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                students.map((student) => (
                <TableRow key={student.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {student.display_name || student.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @{student.username}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{student.email}</Typography>
                  </TableCell>
                  <TableCell>
                    {formatPnL(student.total_pnl)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {student.open_positions}/{student.total_positions}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      open/total
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{student.total_trades}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(student.last_trade_date)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {student.is_flagged && (
                        <Chip 
                          size="small" 
                          label="Flagged" 
                          color="warning"
                          icon={<FlagIcon />}
                        />
                      )}
                      {student.has_instructor_notes && (
                        <Chip 
                          size="small" 
                          label="Notes" 
                          color="info"
                          icon={<NoteIcon />}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleViewStudent(student.id)}
                        title="View Details"
                      >
                        <ViewIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleAddNote(student)}
                        title="Add Note"
                      >
                        <NoteIcon />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add Note Dialog */}
      <Dialog 
        open={!!noteDialog} 
        onClose={() => setNoteDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Note for {noteDialog?.student_name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Enter your note about this student..."
            value={noteDialog?.note_text || ''}
            onChange={(e) => setNoteDialog(prev => prev ? {...prev, note_text: e.target.value} : null)}
            sx={{ mt: 1 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={noteDialog?.is_flagged || false}
                onChange={(e) => setNoteDialog(prev => prev ? {...prev, is_flagged: e.target.checked} : null)}
              />
            }
            label="Flag this student for attention"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialog(null)}>Cancel</Button>
          <Button 
            onClick={handleSaveNote} 
            variant="contained"
            disabled={!noteDialog?.note_text.trim()}
          >
            Save Note
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminDashboard;