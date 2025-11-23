import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Alert,
  LinearProgress,
  Paper,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip
} from '@mui/material';
import {
  Upload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  CloudDownload as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import BaseModal from './BaseModal';
import api from '../services/apiConfig';

// =====================================================
// Types
// =====================================================

interface BrokerInfo {
  name: string;
  display_name: string;
  default_currency: string;
}

interface ValidationResult {
  valid: boolean;
  broker_detected?: string;
  broker_display_name?: string;
  total_rows?: number;
  available_columns?: string[];
  column_map?: Record<string, string | null>;
  missing_fields?: string[];
  sample_data?: Record<string, unknown>[];
  error?: string;
}

interface ImportResult {
  success: boolean;
  broker_detected?: string;
  broker_display_name?: string;
  imported_events?: number;
  total_positions?: number;
  open_positions?: number;
  warnings?: string[];
  error?: string;
  errors?: Array<{ row: number; error: string }>;
  available_columns?: string[];
  column_map?: Record<string, string | null>;
}

interface UniversalImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

// =====================================================
// Main Component
// =====================================================

const UniversalImportModal: React.FC<UniversalImportModalProps> = ({
  open,
  onClose,
  onImportSuccess
}) => {
  // State
  const [brokers, setBrokers] = useState<BrokerInfo[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<string>('auto');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSampleData, setShowSampleData] = useState(false);
  const [step, setStep] = useState<'select' | 'validate' | 'import' | 'complete'>('select');

  // Load brokers on mount
  React.useEffect(() => {
    if (open) {
      loadBrokers();
      // Reset state on open
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setSelectedBroker('auto');
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setError(null);
    setShowSampleData(false);
    setStep('select');
  };

  const loadBrokers = async () => {
    try {
      const response = await api.get<{ brokers: BrokerInfo[] }>('/api/v2/positions/brokers');
      setBrokers(response.data.brokers);
    } catch (err) {
      console.error('Failed to load brokers:', err);
      setError('Failed to load broker list. Please refresh and try again.');
    }
  };

  // =====================================================
  // File Upload Handlers
  // =====================================================

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setValidationResult(null);
      setImportResult(null);
      setStep('select');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.csv')) {
        setError('Please drop a CSV file');
        return;
      }
      setFile(droppedFile);
      setError(null);
      setValidationResult(null);
      setImportResult(null);
      setStep('select');
    }
  }, []);

  // =====================================================
  // Validation
  // =====================================================

  const handleValidate = async () => {
    if (!file) return;

    setValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedBroker !== 'auto') {
        formData.append('broker', selectedBroker);
      }

      const response = await api.post<ValidationResult>(
        '/api/v2/positions/import/universal/validate',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );

      setValidationResult(response.data);
      
      if (response.data.valid) {
        setStep('validate');
      } else {
        setError(response.data.error || 'Validation failed. Please check the file format.');
      }
    } catch (err: unknown) {
      console.error('Validation error:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        setError(axiosError.response?.data?.detail || 'Validation failed');
      } else {
        setError('Validation failed. Please check the file format.');
      }
    } finally {
      setValidating(false);
    }
  };

  // =====================================================
  // Import
  // =====================================================

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedBroker !== 'auto') {
        formData.append('broker', selectedBroker);
      }

      const response = await api.post<ImportResult>(
        '/api/v2/positions/import/universal',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );

      setImportResult(response.data);

      if (response.data.success) {
        setStep('complete');
        setTimeout(() => {
          onImportSuccess();
          onClose();
        }, 2000);
      } else {
        setError(response.data.error || 'Import failed. Please check the errors below.');
      }
    } catch (err: unknown) {
      console.error('Import error:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        setError(axiosError.response?.data?.detail || 'Import failed');
      } else {
        setError('Import failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // Download Template
  // =====================================================

  const handleDownloadTemplate = async () => {
    if (selectedBroker === 'auto') {
      setError('Please select a specific broker to download a template');
      return;
    }

    try {
      const response = await api.get(
        `/api/v2/positions/brokers/${selectedBroker}/template`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedBroker}_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Template download error:', err);
      setError('Failed to download template');
    }
  };

  // =====================================================
  // Render Helpers
  // =====================================================

  const renderFileUpload = () => (
    <Box>
      {/* Broker Selection */}
      <TextField
        select
        fullWidth
        label="Broker Format"
        value={selectedBroker}
        onChange={(e) => setSelectedBroker(e.target.value)}
        helperText={
          selectedBroker === 'auto'
            ? 'Auto-detect will identify your broker from the CSV columns'
            : 'Select your broker for accurate parsing'
        }
        sx={{ mb: 3 }}
      >
        <MenuItem value="auto">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon fontSize="small" color="primary" />
            <Typography>Auto-Detect Broker</Typography>
          </Box>
        </MenuItem>
        {brokers.map((broker) => (
          <MenuItem key={broker.name} value={broker.name}>
            {broker.display_name} ({broker.default_currency})
          </MenuItem>
        ))}
      </TextField>

      {/* Template Download */}
      {selectedBroker !== 'auto' && (
        <Box sx={{ mb: 3 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
            fullWidth
          >
            Download {brokers.find(b => b.name === selectedBroker)?.display_name} Template
          </Button>
        </Box>
      )}

      {/* File Drop Zone */}
      <Paper
        elevation={0}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        sx={{
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          backgroundColor: dragActive ? 'action.hover' : 'background.paper',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover'
          }
        }}
        onClick={() => document.getElementById('csv-file-input')?.click()}
      >
        <input
          id="csv-file-input"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        
        <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        
        <Typography variant="h6" gutterBottom>
          {file ? file.name : 'Drop CSV file here or click to browse'}
        </Typography>
        
        <Typography variant="body2" color="text.secondary">
          Supports Webull, Robinhood, TD Ameritrade, Interactive Brokers, and more
        </Typography>
      </Paper>
    </Box>
  );

  const renderValidationResult = () => {
    if (!validationResult) return null;

    return (
      <Box>
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            <strong>Validation Successful</strong>
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <Chip
              label={`Broker: ${validationResult.broker_display_name}`}
              color="primary"
              size="small"
            />
            <Chip
              label={`${validationResult.total_rows || 0} rows detected`}
              size="small"
            />
          </Stack>
        </Alert>

        {/* Column Mapping */}
        {validationResult.column_map && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Column Mapping
              <Tooltip title="How CSV columns map to position fields">
                <InfoIcon fontSize="small" color="action" />
              </Tooltip>
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <List dense>
                {Object.entries(validationResult.column_map).map(([field, column]) => (
                  <ListItem key={field} sx={{ py: 0.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          <strong>{field}:</strong> {column || <em>not mapped</em>}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Box>
        )}

        {/* Sample Data Preview */}
        {validationResult.sample_data && validationResult.sample_data.length > 0 && (
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1
              }}
            >
              <Typography variant="subtitle2">
                Sample Data Preview (first 3 rows)
              </Typography>
              <IconButton
                size="small"
                onClick={() => setShowSampleData(!showSampleData)}
              >
                {showSampleData ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={showSampleData}>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {Object.keys(validationResult.sample_data[0]).map((key) => (
                        <TableCell key={key} sx={{ fontWeight: 600 }}>
                          {key}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {validationResult.sample_data.slice(0, 3).map((row, idx) => (
                      <TableRow key={idx}>
                        {Object.values(row).map((value, cellIdx) => (
                          <TableCell key={cellIdx}>
                            {value !== null && value !== undefined ? String(value) : '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}
      </Box>
    );
  };

  const renderImportResult = () => {
    if (!importResult) return null;

    if (importResult.success) {
      return (
        <Alert severity="success" icon={<CheckCircleIcon />}>
          <Typography variant="subtitle2" gutterBottom>
            <strong>Import Successful!</strong>
          </Typography>
          <Typography variant="body2">
            Imported {importResult.imported_events} events across {importResult.total_positions} positions
            ({importResult.open_positions} currently open)
          </Typography>
          {importResult.warnings && importResult.warnings.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Warnings:
              </Typography>
              {importResult.warnings.map((warning, idx) => (
                <Typography key={idx} variant="caption" display="block">
                  • {warning}
                </Typography>
              ))}
            </Box>
          )}
        </Alert>
      );
    }

    return (
      <Alert severity="error" icon={<ErrorIcon />}>
        <Typography variant="subtitle2" gutterBottom>
          <strong>Import Failed</strong>
        </Typography>
        <Typography variant="body2">{importResult.error}</Typography>
        {importResult.errors && importResult.errors.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption">Row errors:</Typography>
            {importResult.errors.slice(0, 5).map((err, idx) => (
              <Typography key={idx} variant="caption" display="block">
                • Row {err.row}: {err.error}
              </Typography>
            ))}
            {importResult.errors.length > 5 && (
              <Typography variant="caption" display="block">
                ... and {importResult.errors.length - 5} more errors
              </Typography>
            )}
          </Box>
        )}
      </Alert>
    );
  };

  // =====================================================
  // Render Actions
  // =====================================================

  const renderActions = () => {
    if (step === 'complete') {
      return (
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      );
    }

    if (step === 'validate') {
      return (
        <>
          <Button onClick={() => setStep('select')} disabled={loading}>
            Back
          </Button>
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <LinearProgress /> : <UploadIcon />}
          >
            {loading ? 'Importing...' : 'Import Positions'}
          </Button>
        </>
      );
    }

    return (
      <>
        <Button onClick={onClose} disabled={loading || validating}>
          Cancel
        </Button>
        <Button
          onClick={handleValidate}
          variant="contained"
          disabled={!file || loading || validating}
          startIcon={validating ? <LinearProgress /> : <CheckCircleIcon />}
        >
          {validating ? 'Validating...' : 'Validate CSV'}
        </Button>
      </>
    );
  };

  // =====================================================
  // Main Render
  // =====================================================

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Import Positions from Broker"
      maxWidth="md"
      loading={loading || validating}
      error={error}
      actions={renderActions()}
    >
      <Box>
        {step === 'select' && renderFileUpload()}
        {step === 'validate' && renderValidationResult()}
        {step === 'complete' && renderImportResult()}
        {(step === 'validate' || step === 'complete') && importResult && renderImportResult()}
      </Box>
    </BaseModal>
  );
};

export default UniversalImportModal;
