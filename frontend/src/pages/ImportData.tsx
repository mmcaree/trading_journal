import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  ValidationResult,
  ImportResult,
  validateImportFile,
  importWebullFile,
  formatFileSize,
} from '../services/importService';

const ImportData: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickValidateFile = (file: File): { isValid: boolean; error?: string } => {
    // Check file type
    if (!file.type.includes('csv') && !file.name.toLowerCase().endsWith('.csv')) {
      return {
        isValid: false,
        error: 'File must be a CSV file'
      };
    }

    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: 'File size exceeds 50MB limit'
      };
    }

    // Check if file is empty
    if (file.size === 0) {
      return {
        isValid: false,
        error: 'File is empty'
      };
    }

    return { isValid: true };
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const validation = quickValidateFile(selectedFile);
      if (!validation.isValid) {
        setValidationResult({
          valid: false,
          errors: [{ type: 'file', message: validation.error || 'Invalid file' }],
          warnings: [],
          total_events: 0,
          unique_symbols: 0,
          date_range: { earliest: null, latest: null }
        });
        return;
      }
      
      setFile(selectedFile);
      setValidationResult(null);
      setImportResult(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      const validation = quickValidateFile(droppedFile);
      if (!validation.isValid) {
        setValidationResult({
          valid: false,
          errors: [{ type: 'file', message: validation.error || 'Invalid file' }],
          warnings: [],
          total_events: 0,
          unique_symbols: 0,
          date_range: { earliest: null, latest: null }
        });
        return;
      }
      
      setFile(droppedFile);
      setValidationResult(null);
      setImportResult(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const validateFile = async () => {
    if (!file) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateImportFile(file);
      console.log('Validation result:', result); // Debug log
      setValidationResult(result);
    } catch (error: any) {
      console.error('Validation error:', error);
      
      // Handle axios errors
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to validate file. Please try again.';
      
      console.log('Error details:', error.response?.data); // Debug log
      
      setValidationResult({
        valid: false,
        errors: [{ type: 'network', message: errorMessage }],
        warnings: [],
        total_events: 0,
        unique_symbols: 0,
        date_range: { earliest: null, latest: null }
      });
    } finally {
      setIsValidating(false);
    }
  };

  const importFile = async () => {
    if (!file || !validationResult?.valid) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await importWebullFile(file);
      setImportResult(result);
    } catch (error: any) {
      console.error('Import error:', error);
      
      // Handle axios errors
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to import file. Please try again.';
      
      setImportResult({
        success: false,
        message: errorMessage,
        errors: [errorMessage]
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setShowDetails(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Import Trading Data
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Import your Webull trading history from a CSV file. The system will validate and process your trades into individual position lifecycles.
      </Typography>

      {/* File Upload Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Select CSV File
          </Typography>
          
          <Box
            sx={{
              border: 2,
              borderStyle: 'dashed',
              borderColor: file ? 'primary.main' : 'grey.500',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              bgcolor: file ? 'primary.light' : 'background.paper',
              opacity: file ? 0.9 : 1,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'primary.light',
                opacity: 0.8,
              },
            }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            
            {file ? (
              <Box>
                <Typography variant="h6" color="primary">
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Drag & drop your CSV file here
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  or click to browse
                </Typography>
                <Button variant="contained" sx={{ mt: 2 }}>
                  Choose File
                </Button>
              </Box>
            )}
          </Box>

          {file && (
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={validateFile}
                disabled={isValidating}
                startIcon={isValidating ? <RefreshIcon /> : <CheckIcon />}
              >
                {isValidating ? 'Validating...' : 'Validate File'}
              </Button>
              
              <Button
                variant="text"
                onClick={resetForm}
                disabled={isValidating || isImporting}
              >
                Clear
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Validation Progress */}
      {isValidating && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Validating File...
            </Typography>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Checking file format, parsing events, and validating data integrity
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validationResult && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">
                Validation Results
              </Typography>
              <IconButton onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            {validationResult.valid ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                File validation passed! Ready to import.
              </Alert>
            ) : (
              <Alert severity="error" sx={{ mb: 2 }}>
                File validation failed. Please fix the errors before importing.
              </Alert>
            )}

            {/* Statistics */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`${validationResult.total_events || 0} Events`} variant="outlined" />
              <Chip label={`${validationResult.unique_symbols || 0} Symbols`} variant="outlined" />
              <Chip label={
                validationResult.date_range?.earliest && validationResult.date_range?.latest
                  ? `${new Date(validationResult.date_range.earliest).toLocaleDateString()} - ${new Date(validationResult.date_range.latest).toLocaleDateString()}`
                  : 'Unknown'
              } variant="outlined" />
              {validationResult.filled_events !== undefined && (
                <Chip label={`${validationResult.filled_events} Filled`} variant="outlined" />
              )}
              {validationResult.pending_events !== undefined && (
                <Chip label={`${validationResult.pending_events} Pending`} variant="outlined" />
              )}
            </Box>

            {/* Warnings */}
            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {validationResult.warnings.length} warning(s) found
                </Alert>
                <List dense>
                  {validationResult.warnings.map((warning, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <WarningIcon color="warning" />
                      </ListItemIcon>
                      <ListItemText
                        primary={warning.type}
                        secondary={warning.message}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {/* Errors */}
            {validationResult.errors && validationResult.errors.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Alert severity="error" sx={{ mb: 1 }}>
                  {validationResult.errors.length} error(s) found
                </Alert>
                <List dense>
                  {validationResult.errors.map((error, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <ErrorIcon color="error" />
                      </ListItemIcon>
                      <ListItemText
                        primary={error.type}
                        secondary={error.message}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {/* Detailed breakdown */}
            <Collapse in={showDetails}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>
                Detailed Breakdown:
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Property</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Total Events</TableCell>
                      <TableCell>{validationResult.total_events || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Unique Symbols</TableCell>
                      <TableCell>{validationResult.unique_symbols || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Date Range</TableCell>
                      <TableCell>
                        {validationResult.date_range?.earliest && validationResult.date_range?.latest
                          ? `${new Date(validationResult.date_range.earliest).toLocaleDateString()} - ${new Date(validationResult.date_range.latest).toLocaleDateString()}`
                          : 'Unknown'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Validation Status</TableCell>
                      <TableCell>
                        <Chip
                          label={validationResult.valid ? 'Valid' : 'Invalid'}
                          color={validationResult.valid ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>

            {/* Import Button */}
            {validationResult.valid && (
              <Box sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={importFile}
                  disabled={isImporting}
                  startIcon={isImporting ? <RefreshIcon /> : <UploadIcon />}
                >
                  {isImporting ? 'Importing...' : 'Import Data'}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Progress */}
      {isImporting && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Importing Data...
            </Typography>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Processing individual position lifecycles and creating trading events
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Import Results
            </Typography>

            {importResult.success ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                Import completed successfully!
              </Alert>
            ) : (
              <Alert severity="error" sx={{ mb: 2 }}>
                Import failed. Please check the errors below.
              </Alert>
            )}

            <Typography variant="body1" gutterBottom>
              {importResult.message}
            </Typography>

            {importResult.stats && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Import Statistics:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText
                      primary="Positions Processed"
                      secondary={importResult.stats.positionsProcessed}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Events Created"
                      secondary={importResult.stats.eventsCreated}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Processing Time"
                      secondary={`${importResult.stats.duration.toFixed(2)} seconds`}
                    />
                  </ListItem>
                </List>
              </Box>
            )}

            {importResult.errors && importResult.errors.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Errors:
                </Typography>
                <List dense>
                  {importResult.errors.map((error, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <ErrorIcon color="error" />
                      </ListItemIcon>
                      <ListItemText primary={error} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {importResult.success && (
              <Box sx={{ mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={resetForm}
                >
                  Import Another File
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default ImportData;