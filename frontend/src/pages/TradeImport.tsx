import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  IconButton,
  Tooltip,
  TextField,
} from '@mui/material';
import {
  CloudUpload,
  Analytics,
  CheckCircle,
  Error,
  Info,
  Delete,
  Visibility,
  Download,
  Refresh,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  importService,
  ImportBatch,
  ImportResponse,
  ProcessResponse,
  ImportOrder,
} from '../services/importService';

const TradeImport: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [accountSize, setAccountSize] = useState<number>(10000);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [importResponse, setImportResponse] = useState<ImportResponse | null>(null);
  const [processResponse, setProcessResponse] = useState<ProcessResponse | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [batchOrders, setBatchOrders] = useState<ImportOrder[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

  const steps = [
    'Upload CSV File',
    'Review Import Results',
    'Process Orders',
    'Complete'
  ];

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      const response = await importService.getBatches();
      setBatches(response.data.batches);
    } catch (error) {
      setAlert({ type: 'error', message: 'Failed to load import history' });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setAlert({ type: 'error', message: 'Please select a CSV file' });
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setAlert({ type: 'error', message: 'File size must be less than 10MB' });
        return;
      }
      setSelectedFile(file);
      setAlert(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const response = await importService.uploadCSV(selectedFile);
      setImportResponse(response);
      setActiveStep(1);
      setAlert({ type: 'success', message: `Successfully imported ${response.total_orders} orders` });
      loadBatches(); // Refresh the batch list
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!importResponse) return;

    setProcessing(true);
    try {
      const response = await importService.processBatch(importResponse.batch_id, accountSize);
      setProcessResponse(response);
      setActiveStep(3);
      setAlert({ type: 'success', message: response.message });
      loadBatches(); // Refresh the batch list
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleViewDetails = async (batch: ImportBatch) => {
    try {
      const [detailsResponse, ordersResponse] = await Promise.all([
        importService.getBatchDetails(batch.batch_id),
        importService.getBatchOrders(batch.batch_id, 0, 20)
      ]);
      
      setSelectedBatch(detailsResponse.data);
      setBatchOrders(ordersResponse.data.orders);
      setDetailsOpen(true);
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    try {
      await importService.deleteBatch(batchId);
      setAlert({ type: 'success', message: 'Import batch deleted successfully' });
      loadBatches();
      setDeleteConfirmOpen(false);
      setBatchToDelete(null);
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'filled': return 'success';
      case 'pending': return 'warning';
      case 'cancelled': return 'default';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getSideColor = (side: string) => {
    switch (side.toLowerCase()) {
      case 'buy': return 'success';
      case 'sell': return 'error';
      case 'short': return 'warning';
      default: return 'default';
    }
  };

  const resetImport = () => {
    setActiveStep(0);
    setSelectedFile(null);
    setImportResponse(null);
    setProcessResponse(null);
    setAlert(null);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {alert && (
        <Alert 
          severity={alert.type} 
          onClose={() => setAlert(null)}
          sx={{ mb: 3 }}
        >
          {alert.message}
        </Alert>
      )}

      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudUpload />
        Trade Data Import
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Import your historical trade data from CSV files. Supported formats: Webull Orders Export.
      </Typography>

      <Grid container spacing={4}>
        {/* Import Wizard */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Import New Data
            </Typography>

            <Stepper activeStep={activeStep} orientation="vertical">
              {/* Step 1: Upload */}
              <Step>
                <StepLabel>Upload CSV File</StepLabel>
                <StepContent>
                  <Box sx={{ my: 2 }}>
                    <input
                      accept=".csv"
                      type="file"
                      id="csv-upload"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                    <label htmlFor="csv-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        startIcon={<CloudUpload />}
                        sx={{ mr: 2 }}
                      >
                        Select CSV File
                      </Button>
                    </label>
                    
                    {selectedFile && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                      </Typography>
                    )}
                  </Box>

                  <Box>
                    <Button
                      variant="contained"
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading}
                      startIcon={uploading ? <CircularProgress size={20} /> : <CloudUpload />}
                    >
                      {uploading ? 'Uploading...' : 'Upload & Parse'}
                    </Button>
                  </Box>
                </StepContent>
              </Step>

              {/* Step 2: Review */}
              <Step>
                <StepLabel>Review Import Results</StepLabel>
                <StepContent>
                  {importResponse && (
                    <Box sx={{ my: 2 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="primary">
                                {importResponse.total_orders}
                              </Typography>
                              <Typography variant="caption">Total Orders</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="success.main">
                                {importResponse.filled_orders}
                              </Typography>
                              <Typography variant="caption">Filled</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="warning.main">
                                {importResponse.pending_orders}
                              </Typography>
                              <Typography variant="caption">Pending</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="text.secondary">
                                {importResponse.cancelled_orders + importResponse.failed_orders}
                              </Typography>
                              <Typography variant="caption">Cancelled/Failed</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>

                      <Alert severity="info" sx={{ mt: 2 }}>
                        Only filled orders will be processed into positions and trades. 
                        Pending, cancelled, and failed orders will be stored for reference.
                      </Alert>
                    </Box>
                  )}

                  <Box>
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep(2)}
                      disabled={!importResponse}
                      sx={{ mr: 1 }}
                    >
                      Continue to Processing
                    </Button>
                    <Button onClick={resetImport}>Start Over</Button>
                  </Box>
                </StepContent>
              </Step>

              {/* Step 3: Process */}
              <Step>
                <StepLabel>Process Orders into Trades</StepLabel>
                <StepContent>
                  <Box sx={{ my: 2 }}>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      This step will analyze your filled orders and create position records and completed trades.
                      The system uses FIFO (First In, First Out) matching to calculate profits and losses.
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <TextField
                        label="Account Size"
                        type="number"
                        value={accountSize}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountSize(Number(e.target.value))}
                        fullWidth
                        variant="outlined"
                        helperText="Used for risk percentage calculations (default: $10,000)"
                        InputProps={{
                          startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                        }}
                        sx={{ maxWidth: 300 }}
                      />
                    </Box>

                    {processing && <LinearProgress sx={{ mb: 2 }} />}
                  </Box>

                  <Box>
                    <Button
                      variant="contained"
                      onClick={handleProcess}
                      disabled={processing}
                      startIcon={processing ? <CircularProgress size={20} /> : <Analytics />}
                      sx={{ mr: 1 }}
                    >
                      {processing ? 'Processing...' : 'Process Orders'}
                    </Button>
                    <Button onClick={() => setActiveStep(1)}>Back</Button>
                  </Box>
                </StepContent>
              </Step>

              {/* Step 4: Complete */}
              <Step>
                <StepLabel>Import Complete</StepLabel>
                <StepContent>
                  {processResponse && (
                    <Box sx={{ my: 2 }}>
                      <Alert severity="success" sx={{ mb: 2 }}>
                        Import completed successfully!
                      </Alert>

                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="primary">
                                {processResponse.results.orders_processed}
                              </Typography>
                              <Typography variant="caption">Orders Processed</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="success.main">
                                {processResponse.results.trades_created}
                              </Typography>
                              <Typography variant="caption">Trades Created</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="info.main">
                                {processResponse.results.positions_created}
                              </Typography>
                              <Typography variant="caption">New Positions</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Card>
                            <CardContent sx={{ textAlign: 'center', py: 1 }}>
                              <Typography variant="h6" color="warning.main">
                                {processResponse.results.positions_updated}
                              </Typography>
                              <Typography variant="caption">Updated Positions</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  <Box>
                    <Button
                      variant="contained"
                      onClick={() => navigate('/')}
                      sx={{ mr: 1 }}
                    >
                      View Dashboard
                    </Button>
                    <Button onClick={resetImport}>Import Another File</Button>
                  </Box>
                </StepContent>
              </Step>
            </Stepper>
          </Paper>
        </Grid>

        {/* Import History */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Import History</Typography>
              <IconButton onClick={loadBatches} size="small">
                <Refresh />
              </IconButton>
            </Box>

            {batches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No imports yet
              </Typography>
            ) : (
              <Box>
                {batches.slice(0, 5).map((batch) => (
                  <Card key={batch.batch_id} sx={{ mb: 1, p: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {batch.filename}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(batch.created_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="caption" display="block">
                          {batch.total_orders} orders
                        </Typography>
                      </Box>
                      <Box>
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => handleViewDetails(batch)}>
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setBatchToDelete(batch.batch_id);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Card>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Batch Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Import Details: {selectedBatch?.filename}
        </DialogTitle>
        <DialogContent>
          {selectedBatch && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Total Orders</Typography>
                  <Typography variant="h6">{selectedBatch.total_orders}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Filled</Typography>
                  <Typography variant="h6" color="success.main">{selectedBatch.filled_orders}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Pending</Typography>
                  <Typography variant="h6" color="warning.main">{selectedBatch.pending_orders}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="body2" color="text.secondary">Cancelled/Failed</Typography>
                  <Typography variant="h6">{selectedBatch.cancelled_orders + selectedBatch.failed_orders}</Typography>
                </Grid>
              </Grid>

              <Typography variant="h6" gutterBottom>Sample Orders</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell>Side</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Processed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batchOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.symbol}</TableCell>
                        <TableCell>
                          <Chip 
                            label={order.side} 
                            size="small" 
                            color={getSideColor(order.side) as any}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={order.status} 
                            size="small" 
                            color={getStatusColor(order.status) as any}
                          />
                        </TableCell>
                        <TableCell align="right">{order.filled_qty}</TableCell>
                        <TableCell align="right">
                          {order.avg_price ? `$${order.avg_price.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell>
                          {order.placed_time ? new Date(order.placed_time).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          {order.processed ? (
                            <CheckCircle color="success" fontSize="small" />
                          ) : (
                            <Error color="disabled" fontSize="small" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this import batch? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => batchToDelete && handleDeleteBatch(batchToDelete)} 
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TradeImport;