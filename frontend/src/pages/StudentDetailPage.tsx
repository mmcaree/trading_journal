import React, { useState, useEffect } from 'react';
import AddCommentIcon from '@mui/icons-material/AddComment';
import { AlertTitle, Stack } from '@mui/material';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tab,
  Tabs,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  TrendingUp as ProfitIcon,
  TrendingDown as LossIcon,
  Flag as FlagIcon,
  EventNote as JournalIcon,
  Image as ImageIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  ShowChart as ChartIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';

interface StudentDetail {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  created_at: string;
  current_account_balance?: number;
  initial_account_balance?: number;
}

interface Position {
  id: number;
  ticker: string;
  instrument_type: string;
  status: string;
  current_shares: number;
  avg_entry_price?: number;
  total_cost: number;
  total_realized_pnl: number;
  opened_at: string;
  closed_at?: string;
  strike_price?: number;
  expiration_date?: string;
  option_type?: string;
}

interface TradingEvent {
  id: number;
  event_type: string;
  event_date: string;
  shares: number;
  price: number;
  notes?: string;
}

interface InstructorNote {
  id: number;
  instructor_id: number;
  student_id: number;
  note_text: string;
  is_flagged: boolean;
  created_at: string;
  updated_at: string;
  instructor_username: string;
}

interface JournalEntry {
  id: number;
  position_id: number;
  ticker: string;
  entry_date: string;
  entry_type: string;
  content: string;
  attached_images?: string;
  attached_charts?: string;
  created_at: string;
  updated_at: string;
}

interface PositionChart {
  id: number;
  position_id: number;
  image_url: string;
  description?: string;
  timeframe?: string;
  annotations?: string;
  created_at: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const StudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [events, setEvents] = useState<TradingEvent[]>([]);
  const [notes, setNotes] = useState<InstructorNote[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [noteDialog, setNoteDialog] = useState(false);
  const [newNote, setNewNote] = useState({ text: '', flagged: false });
  const [positionDialog, setPositionDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [positionDetails, setPositionDetails] = useState<any>(null);
  const [chartDialog, setChartDialog] = useState(false);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [selectedChartInfo, setSelectedChartInfo] = useState<PositionChart | null>(null);
  const [tradeNotes, setTradeNotes] = useState<any[]>([]);
  const [addingTradeNote, setAddingTradeNote] = useState(false);
  const [newTradeNoteText, setNewTradeNoteText] = useState('');
  const [savingTradeNote, setSavingTradeNote] = useState(false);

  useEffect(() => {
    if (studentId) {
      fetchStudentData(parseInt(studentId));
    }
  }, [studentId]);

  const fetchStudentData = async (id: number) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch all student data in parallel
      const [studentRes, positionsRes, eventsRes, notesRes, journalRes] = await Promise.all([
        fetch(`/api/admin/student/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/admin/student/${id}/positions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/admin/student/${id}/events`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/admin/student/${id}/notes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/admin/student/${id}/journal`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!studentRes.ok) {
        throw new Error('Student not found');
      }

      const studentData = await studentRes.json();
      const positionsData = positionsRes.ok ? await positionsRes.json() : [];
      const eventsData = eventsRes.ok ? await eventsRes.json() : [];
      const notesData = notesRes.ok ? await notesRes.json() : [];
      const journalData = journalRes.ok ? await journalRes.json() : [];

      setStudent(studentData);
      setPositions(positionsData);
      setEvents(eventsData);
      setNotes(notesData);
      setJournalEntries(journalData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.text.trim() || !studentId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/student/${studentId}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          note_text: newNote.text,
          is_flagged: newNote.flagged
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save note');
      }

      setNoteDialog(false);
      setNewNote({ text: '', flagged: false });
      fetchStudentData(parseInt(studentId)); // Refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const handleViewPosition = async (position: Position) => {
    if (!studentId) return;
    
    try {
      setSelectedPosition(position);
      const token = localStorage.getItem('token');

      const [detailsRes, notesRes] = await Promise.all([
        fetch(`/api/admin/student/${studentId}/position/${position.id}/details`, {
        headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/admin/positions/${position.id}/instructor-notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!detailsRes.ok) throw new Error('Failed to load position details');
      if (!notesRes.ok) throw new Error('Failed to load trade notes');

      const details = await detailsRes.json();
      const notes = await notesRes.json();

      setPositionDetails(details);
      setTradeNotes(notes);
      setPositionDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load position details');
    }
  };

  const handleViewChart = (chartUrl: string, chartInfo?: PositionChart) => {
    setSelectedChart(chartUrl);
    setSelectedChartInfo(chartInfo || null);
    setChartDialog(true);
  };

  const parseAttachedImages = (attachedImages: string | null): Array<{url: string, description?: string}> => {
    if (!attachedImages) return [];
    try {
      return JSON.parse(attachedImages);
    } catch {
      return [];
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPnL = (pnl: number) => {
    const formatted = formatCurrency(pnl);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error || !student) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Alert severity="error">{error || 'Student not found'}</Alert>
        <Button 
          startIcon={<BackIcon />} 
          onClick={() => navigate('/admin')}
          sx={{ mt: 2 }}
        >
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  const totalPnL = positions.reduce((sum, pos) => sum + (pos.total_realized_pnl || 0), 0);
  const openPositions = positions.filter(pos => pos.status === 'open');
  const closedPositions = positions.filter(pos => pos.status === 'closed');

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button 
          startIcon={<BackIcon />} 
          onClick={() => navigate('/admin')}
          sx={{ mr: 2 }}
        >
          Back to Dashboard
        </Button>
        <Typography variant="h4">
          {student.display_name || student.username}
        </Typography>
        <Box sx={{ ml: 'auto' }}>
          <Button variant="contained" onClick={() => setNoteDialog(true)}>
            Add Note
          </Button>
        </Box>
      </Box>

      {/* Student Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Student Info
              </Typography>
              <Typography variant="h6">{student.username}</Typography>
              <Typography variant="body2">{student.email}</Typography>
              <Typography variant="caption">
                Joined: {formatDate(student.created_at)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total P&L
              </Typography>
              <Typography variant="h5">
                {formatPnL(totalPnL)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Positions
              </Typography>
              <Typography variant="h5">
                {openPositions.length}/{positions.length}
              </Typography>
              <Typography variant="caption">open/total</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Trades
              </Typography>
              <Typography variant="h5">{events.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Journal Entries
              </Typography>
              <Typography variant="h5">{journalEntries.length}</Typography>
              <Typography variant="caption">
                {journalEntries.filter(j => j.entry_type === 'LESSON').length} lessons • {' '}
                {journalEntries.filter(j => j.entry_type === 'MISTAKE').length} mistakes • {' '}
                {journalEntries.filter(j => j.entry_type === 'ANALYSIS').length} analyses
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Account Balance
              </Typography>
              <Typography variant="h5">
                {student.current_account_balance ? formatCurrency(student.current_account_balance) : 'Not set'}
              </Typography>
              {student.initial_account_balance && (
                <Typography variant="caption">
                  Started with: {formatCurrency(student.initial_account_balance)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
            <Tab label="Open Positions" />
            <Tab label="All Positions" />
            <Tab label="Trading History" />
            <Tab label="Journal Entries" />
            <Tab label="Instructor Notes" />
          </Tabs>
        </Box>

        {/* Open Positions Tab */}
        <TabPanel value={tabValue} index={0}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Shares</TableCell>
                  <TableCell>Avg Price</TableCell>
                  <TableCell>Current Value</TableCell>
                  <TableCell>Opened</TableCell>
                  <TableCell>Journal</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {openPositions.map((position) => {
                  const positionJournalCount = journalEntries.filter(j => j.position_id === position.id).length;
                  return (
                    <TableRow key={position.id} hover sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {position.ticker}
                        </Typography>
                        {position.instrument_type === 'OPTIONS' && (
                          <Typography variant="caption" color="text.secondary">
                            ${position.strike_price} {position.option_type} {position.expiration_date && formatDate(position.expiration_date)}
                          </Typography>
                        )}
                      </TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={position.instrument_type}
                        color={position.instrument_type === 'OPTIONS' ? 'secondary' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>{position.current_shares}</TableCell>
                    <TableCell>
                      {position.avg_entry_price ? formatCurrency(position.avg_entry_price) : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(position.total_cost)}
                    </TableCell>
                    <TableCell>{formatDate(position.opened_at)}</TableCell>
                    <TableCell>
                      {positionJournalCount > 0 ? (
                        <Chip 
                          size="small" 
                          label={`${positionJournalCount} entries`}
                          color="info"
                          icon={<JournalIcon />}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No entries
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        onClick={() => handleViewPosition(position)}
                        color="primary"
                      >
                        <ViewIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* All Positions Tab */}
        <TabPanel value={tabValue} index={1}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Shares</TableCell>
                  <TableCell>Avg Price</TableCell>
                  <TableCell>Realized P&L</TableCell>
                  <TableCell>Opened</TableCell>
                  <TableCell>Closed</TableCell>
                  <TableCell>Journal</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.map((position) => {
                  const positionJournalCount = journalEntries.filter(j => j.position_id === position.id).length;
                  return (
                    <TableRow key={position.id} hover sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {position.ticker}
                      </Typography>
                      {position.instrument_type === 'OPTIONS' && (
                        <Typography variant="caption" color="text.secondary">
                          ${position.strike_price} {position.option_type} {position.expiration_date && formatDate(position.expiration_date)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={position.instrument_type}
                        color={position.instrument_type === 'OPTIONS' ? 'secondary' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={position.status.toUpperCase()}
                        color={position.status === 'open' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{position.current_shares}</TableCell>
                    <TableCell>
                      {position.avg_entry_price ? formatCurrency(position.avg_entry_price) : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {formatPnL(position.total_realized_pnl || 0)}
                    </TableCell>
                    <TableCell>{formatDate(position.opened_at)}</TableCell>
                    <TableCell>{position.closed_at ? formatDate(position.closed_at) : '-'}</TableCell>
                    <TableCell>
                      {positionJournalCount > 0 ? (
                        <Chip 
                          size="small" 
                          label={`${positionJournalCount} entries`}
                          color="info"
                          icon={<JournalIcon />}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No entries
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        onClick={() => handleViewPosition(position)}
                        color="primary"
                      >
                        <ViewIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Trading History Tab */}
        <TabPanel value={tabValue} index={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Shares</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDateTime(event.event_date)}</TableCell>
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={event.event_type}
                        color={event.event_type === 'BUY' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell>{event.shares}</TableCell>
                    <TableCell>{formatCurrency(event.price)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {event.notes || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Journal Entries Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {journalEntries.map((entry) => (
              <Paper key={entry.id} sx={{ p: 3 }} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <JournalIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {entry.ticker}
                      <Chip 
                        size="small" 
                        label={entry.entry_type}
                        color={
                          entry.entry_type === 'LESSON' ? 'success' :
                          entry.entry_type === 'MISTAKE' ? 'error' :
                          entry.entry_type === 'ANALYSIS' ? 'info' : 'default'
                        }
                      />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Written on {formatDateTime(entry.entry_date)}
                    </Typography>
                  </Box>
                </Box>
                
                <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                  {entry.content}
                </Typography>
                
                {/* Show attached images as clickable thumbnails */}
                {entry.attached_images && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                      <ImageIcon sx={{ fontSize: 16, mr: 0.5 }} />
                      Attached Charts
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {parseAttachedImages(entry.attached_images).map((image, index) => (
                        <Paper
                          key={index}
                          sx={{ 
                            p: 1, 
                            cursor: 'pointer', 
                            '&:hover': { bgcolor: 'action.hover' },
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                          }}
                          onClick={() => handleViewChart(image.url)}
                        >
                          <ChartIcon sx={{ fontSize: 20 }} />
                          <Typography variant="caption">
                            {image.description || `Chart ${index + 1}`}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  </Box>
                )}
                
                {/* Show attached charts indicator */}
                {entry.attached_charts && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <ChartIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      Has attached chart analysis
                    </Typography>
                  </Box>
                )}
                
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Created: {formatDateTime(entry.created_at)}
                  {entry.updated_at !== entry.created_at && (
                    <> • Updated: {formatDateTime(entry.updated_at)}</>
                  )}
                </Typography>
              </Paper>
            ))}
            {journalEntries.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <JournalIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  No journal entries yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This student hasn't written any journal entries for their positions.
                </Typography>
              </Box>
            )}
          </Box>
        </TabPanel>

        {/* Instructor Notes Tab */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {notes.map((note) => (
              <Paper key={note.id} sx={{ p: 2 }} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ mr: 1 }}>
                    {note.instructor_username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                    {formatDateTime(note.created_at)}
                  </Typography>
                  {note.is_flagged && (
                    <Chip 
                      size="small" 
                      label="Flagged" 
                      color="warning"
                      icon={<FlagIcon />}
                    />
                  )}
                </Box>
                <Typography variant="body2">{note.note_text}</Typography>
              </Paper>
            ))}
            {notes.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                No instructor notes yet.
              </Typography>
            )}
          </Box>
        </TabPanel>
      </Paper>

      {/* Add Note Dialog */}
      <Dialog 
        open={noteDialog} 
        onClose={() => setNoteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Note for {student.display_name || student.username}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Enter your note about this student..."
            value={newNote.text}
            onChange={(e) => setNewNote(prev => ({...prev, text: e.target.value}))}
            sx={{ mt: 1 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={newNote.flagged}
                onChange={(e) => setNewNote(prev => ({...prev, flagged: e.target.checked}))}
              />
            }
            label="Flag this student for attention"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleAddNote} 
            variant="contained"
            disabled={!newNote.text.trim()}
          >
            Save Note
          </Button>
        </DialogActions>
      </Dialog>

      {/* Position Details Dialog */}
      <Dialog 
        open={positionDialog} 
        onClose={() => setPositionDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              Position Details: {selectedPosition?.ticker}
            </Typography>
            <IconButton onClick={() => setPositionDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {positionDetails && (
            <Box>
              {/* Position Overview */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="text.secondary">Position Status</Typography>
                      <Chip 
                        label={selectedPosition?.status.toUpperCase()}
                        color={selectedPosition?.status === 'open' ? 'success' : 'default'}
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="body2">
                        <strong>Shares:</strong> {selectedPosition?.current_shares}<br/>
                        <strong>Avg Price:</strong> {selectedPosition?.avg_entry_price ? formatCurrency(selectedPosition.avg_entry_price) : 'N/A'}<br/>
                        <strong>Total Cost:</strong> {formatCurrency(selectedPosition?.total_cost || 0)}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="text.secondary">P&L Information</Typography>
                      <Typography variant="h6">
                        {formatPnL(selectedPosition?.total_realized_pnl || 0)}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Opened:</strong> {selectedPosition?.opened_at ? formatDate(selectedPosition.opened_at) : 'N/A'}<br/>
                        {selectedPosition?.closed_at && (
                          <>
                            <strong>Closed:</strong> {formatDate(selectedPosition.closed_at)}
                          </>
                        )}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Trading Events */}
              <Typography variant="h6" sx={{ mb: 2 }}>Trading Events</Typography>
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Shares</TableCell>
                      <TableCell>Price</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {positionDetails.events?.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell>{formatDateTime(event.event_date)}</TableCell>
                        <TableCell>
                          <Chip 
                            size="small" 
                            label={event.event_type}
                            color={event.event_type === 'BUY' ? 'success' : 'error'}
                          />
                        </TableCell>
                        <TableCell>{event.shares}</TableCell>
                        <TableCell>{formatCurrency(event.price)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {event.notes || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Journal Entries for this Position */}
              {positionDetails.journal_entries?.length > 0 && (
                <>
                  <Typography variant="h6" sx={{ mb: 2 }}>Journal Entries</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {positionDetails.journal_entries.map((entry: any) => (
                      <Paper key={entry.id} sx={{ p: 2 }} variant="outlined">
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <JournalIcon sx={{ mr: 1, color: 'text.secondary' }} />
                          <Chip 
                            size="small" 
                            label={entry.entry_type}
                            color={
                              entry.entry_type === 'LESSON' ? 'success' :
                              entry.entry_type === 'MISTAKE' ? 'error' :
                              entry.entry_type === 'ANALYSIS' ? 'info' : 'default'
                            }
                            sx={{ mr: 1 }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(entry.entry_date)}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {entry.content}
                        </Typography>
                        
                        {/* Show attached images as clickable items */}
                        {entry.attached_images && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Charts:</Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {parseAttachedImages(entry.attached_images).map((image: any, index: number) => (
                                <Button
                                  key={index}
                                  size="small"
                                  startIcon={<ChartIcon />}
                                  onClick={() => handleViewChart(image.url)}
                                  variant="outlined"
                                >
                                  {image.description || `Chart ${index + 1}`}
                                </Button>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Paper>
                    ))}
                  </Box>
                </>
              )}

              {/* Position Charts */}
              {positionDetails.charts?.length > 0 && (
                <>
                  <Typography variant="h6" sx={{ mb: 2 }}>Position Charts</Typography>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {positionDetails.charts.map((chart: PositionChart) => (
                      <Grid item xs={12} sm={6} md={4} key={chart.id}>
                        <Paper 
                          sx={{ 
                            p: 2, 
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { 
                              bgcolor: 'action.hover',
                              transform: 'scale(1.02)'
                            }
                          }}
                          onClick={() => handleViewChart(chart.image_url, chart)}
                        >
                          <Box sx={{ textAlign: 'center' }}>
                            <img 
                              src={chart.image_url}
                              alt={chart.description || 'Position Chart'}
                              style={{ 
                                width: '100%', 
                                height: '120px', 
                                objectFit: 'cover',
                                borderRadius: '8px',
                                marginBottom: '8px'
                              }}
                              onError={(e) => {
                                // Show placeholder if image fails to load
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                              <ChartIcon sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {chart.timeframe && `${chart.timeframe} • `}
                                {formatDate(chart.created_at)}
                              </Typography>
                            </Box>
                            <Typography variant="body2" fontWeight="medium" noWrap>
                              {chart.description || 'Chart Analysis'}
                            </Typography>
                          </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </>
              )}
            </Box>
          )}
                        {/* === INSTRUCTOR FEEDBACK ON THIS TRADE === */}
              <Box sx={{ mt: 5, pt: 4, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="h6" gutterBottom>
                  Instructor Feedback on This Trade
                </Typography>

                {tradeNotes.length > 0 ? (
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {tradeNotes.map((note: any) => (
                      <Alert key={note.id} severity="info" icon={<FlagIcon />}>
                        <AlertTitle>
                          {note.instructor_username} — {formatDateTime(note.created_at)}
                        </AlertTitle>
                        {note.note_text}
                      </Alert>
                    ))}
                  </Stack>
                ) : (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    No instructor feedback yet for this specific trade.
                  </Alert>
                )}

                {addingTradeNote ? (
                  <Box sx={{ p: 3, border: '2px dashed', borderColor: 'primary.main', borderRadius: 2 }}>
                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      label="Your feedback on this trade"
                      placeholder="e.g. Solid setup, but you sized too aggressively. Consider 1% risk max."
                      value={newTradeNoteText}
                      onChange={(e) => setNewTradeNoteText(e.target.value)}
                      autoFocus
                    />
                    <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button onClick={() => {
                        setAddingTradeNote(false);
                        setNewTradeNoteText('');
                      }}>
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        disabled={!newTradeNoteText.trim() || savingTradeNote}
                        onClick={async () => {
                          if (!selectedPosition) return;

                          setSavingTradeNote(true);
                          try {
                            const token = localStorage.getItem('token');
                            const res = await fetch(`/api/admin/positions/${selectedPosition.id}/instructor-notes`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                note_text: newTradeNoteText,
                                is_flagged: false
                              }),
                            });

                            if (res.ok) {
                              const saved = await res.json();
                              setTradeNotes([...tradeNotes, saved]);
                              setNewTradeNoteText('');
                              setAddingTradeNote(false);
                            }
                          } catch (err) {
                            alert('Failed to save note');
                          } finally {
                            setSavingTradeNote(false);
                          }
                        }}
                      >
                        {savingTradeNote ? 'Saving...' : 'Save Feedback'}
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<AddCommentIcon />}
                    onClick={() => setAddingTradeNote(true)}
                  >
                    Add Feedback on This Trade
                  </Button>
                )}
              </Box>
        </DialogContent>
      </Dialog>

      {/* Chart Viewing Dialog */}
      <Dialog 
        open={chartDialog} 
        onClose={() => setChartDialog(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6">
                {selectedChartInfo?.description || 'Chart View'}
              </Typography>
              {selectedChartInfo && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
                  <ChartIcon sx={{ fontSize: 14, mr: 0.5 }} />
                  {selectedChartInfo.timeframe && `${selectedChartInfo.timeframe} • `}
                  Uploaded {formatDate(selectedChartInfo.created_at)}
                </Typography>
              )}
            </Box>
            <IconButton onClick={() => setChartDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedChart && (
            <Box>
              {/* Chart Image */}
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <img 
                  src={selectedChart} 
                  alt="Trading Chart" 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '75vh', 
                    objectFit: 'contain',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px'
                  }}
                  onError={(e) => {
                    console.error('Image failed to load:', selectedChart);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </Box>

              {/* Chart Details */}
              {selectedChartInfo && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Chart Details</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2">
                          <strong>Position:</strong> {selectedPosition?.ticker}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Description:</strong> {selectedChartInfo.description || 'No description'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2">
                          <strong>Timeframe:</strong> {selectedChartInfo.timeframe || 'Not specified'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Uploaded:</strong> {formatDateTime(selectedChartInfo.created_at)}
                        </Typography>
                      </Grid>
                    </Grid>
                    
                    {/* Chart Annotations */}
                    {selectedChartInfo.annotations && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>Analysis Notes:</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {selectedChartInfo.annotations}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChartDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StudentDetailPage;