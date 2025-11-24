import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Chip,
  Stack,
  Divider,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

// =====================================================
// Types
// =====================================================

interface ColumnMapping {
  [fieldName: string]: string | null;
}

interface ColumnMapperProps {
  availableColumns: string[];
  currentMapping?: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  onSubmit?: () => void;
  requiredFields?: string[];
  optionalFields?: string[];
}

// =====================================================
// Field Definitions
// =====================================================

const REQUIRED_FIELDS = [
  { name: 'symbol', label: 'Symbol/Ticker', description: 'Stock ticker symbol (e.g., AAPL, TSLA)' },
  { name: 'action', label: 'Action', description: 'Buy or Sell action' },
  { name: 'quantity', label: 'Quantity', description: 'Number of shares' },
  { name: 'price', label: 'Price', description: 'Price per share' },
  { name: 'date', label: 'Date', description: 'Trade execution date' }
];

const OPTIONAL_FIELDS = [
  { name: 'time', label: 'Time', description: 'Trade execution time' },
  { name: 'commission', label: 'Commission/Fee', description: 'Trading fees' },
  { name: 'currency', label: 'Currency', description: 'Currency code (USD, AUD, etc.)' },
  { name: 'notes', label: 'Notes', description: 'Additional trade notes' }
];

// =====================================================
// Main Component
// =====================================================

const ColumnMapper: React.FC<ColumnMapperProps> = ({
  availableColumns,
  currentMapping = {},
  onMappingChange,
  onSubmit,
  requiredFields = REQUIRED_FIELDS.map(f => f.name),
  optionalFields = OPTIONAL_FIELDS.map(f => f.name)
}) => {
  const [mapping, setMapping] = useState<ColumnMapping>(currentMapping);

  // Check which required fields are mapped
  const mappedRequiredFields = requiredFields.filter(field => mapping[field]);
  const unmappedRequiredFields = requiredFields.filter(field => !mapping[field]);
  const isValid = unmappedRequiredFields.length === 0;

  // Handle field mapping change
  const handleFieldChange = (fieldName: string, columnName: string | null) => {
    const newMapping = {
      ...mapping,
      [fieldName]: columnName || null
    };
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  // Get columns that are already mapped (to prevent duplicates)
  const getMappedColumns = (excludeField?: string) => {
    return Object.entries(mapping)
      .filter(([field, col]) => col && field !== excludeField)
      .map(([, col]) => col);
  };

  // Check if a column is available for a field
  const isColumnAvailable = (columnName: string, currentField: string) => {
    const mappedColumns = getMappedColumns(currentField);
    return !mappedColumns.includes(columnName);
  };

  // Get field info
  const getFieldInfo = (fieldName: string) => {
    return [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].find(f => f.name === fieldName);
  };

  // Render field mapping row
  const renderFieldMapping = (fieldName: string, isRequired: boolean) => {
    const fieldInfo = getFieldInfo(fieldName);
    const selectedColumn = mapping[fieldName];
    const availableForField = availableColumns.filter(col => 
      isColumnAvailable(col, fieldName) || col === selectedColumn
    );

    return (
      <Box
        key={fieldName}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          borderRadius: 1,
          backgroundColor: selectedColumn 
            ? 'rgba(46, 125, 50, 0.08)' 
            : isRequired 
            ? 'rgba(211, 47, 47, 0.08)' 
            : 'transparent',
          border: '1px solid',
          borderColor: selectedColumn 
            ? 'success.main' 
            : isRequired 
            ? 'error.main' 
            : 'divider'
        }}
      >
        {/* Field Label */}
        <Box sx={{ flex: '0 0 180px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {fieldInfo?.label || fieldName}
            </Typography>
            {isRequired && (
              <Chip label="Required" size="small" color="error" sx={{ height: 20 }} />
            )}
            {fieldInfo?.description && (
              <Tooltip title={fieldInfo.description}>
                <IconButton size="small" sx={{ p: 0 }}>
                  <InfoIcon sx={{ fontSize: 16 }} color="action" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Arrow */}
        <Typography variant="body2" color="text.secondary" sx={{ flex: '0 0 30px', textAlign: 'center' }}>
          →
        </Typography>

        {/* Column Selector */}
        <FormControl fullWidth size="small">
          <InputLabel>CSV Column</InputLabel>
          <Select
            value={selectedColumn || ''}
            label="CSV Column"
            onChange={(e) => handleFieldChange(fieldName, e.target.value || null)}
          >
            <MenuItem value="">
              <em>Not Mapped</em>
            </MenuItem>
            {availableForField.map((column) => (
              <MenuItem key={column} value={column}>
                {column}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Status Icon */}
        <Box sx={{ flex: '0 0 30px' }}>
          {selectedColumn ? (
            <CheckCircleIcon color="success" fontSize="small" />
          ) : isRequired ? (
            <ErrorIcon color="error" fontSize="small" />
          ) : null}
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Map CSV Columns to Position Fields
        </Typography>
        <Typography variant="body2">
          Auto-detection couldn't determine the broker format. Please manually map your CSV columns 
          to the required fields below.
        </Typography>
      </Alert>

      {/* Validation Status */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="subtitle2">Mapping Status:</Typography>
          <Chip
            icon={isValid ? <CheckCircleIcon /> : <ErrorIcon />}
            label={isValid ? 'All Required Fields Mapped' : `${unmappedRequiredFields.length} Required Fields Missing`}
            color={isValid ? 'success' : 'error'}
            size="small"
          />
          <Chip
            label={`${mappedRequiredFields.length}/${requiredFields.length} Required`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Paper>

      {/* Required Fields */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Required Fields
          <Chip label={requiredFields.length} size="small" color="error" />
        </Typography>
        <Stack spacing={1.5}>
          {requiredFields.map((fieldName) => renderFieldMapping(fieldName, true))}
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Optional Fields */}
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Optional Fields
          <Chip label={optionalFields.length} size="small" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          These fields enhance your position data but aren't required for import.
        </Typography>
        <Stack spacing={1.5}>
          {optionalFields.map((fieldName) => renderFieldMapping(fieldName, false))}
        </Stack>
      </Box>

      {/* Submit Button */}
      {onSubmit && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={onSubmit}
            disabled={!isValid}
            startIcon={<CheckCircleIcon />}
          >
            Apply Mapping & Import
          </Button>
        </Box>
      )}

      {/* Available Columns Reference */}
      <Paper variant="outlined" sx={{ p: 2, mt: 3, backgroundColor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Available CSV Columns ({availableColumns.length}):
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {availableColumns.map((col) => {
            const isMapped = Object.values(mapping).includes(col);
            return (
              <Chip
                key={col}
                label={col}
                size="small"
                variant={isMapped ? 'filled' : 'outlined'}
                color={isMapped ? 'success' : 'default'}
              />
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
};

export default ColumnMapper;
