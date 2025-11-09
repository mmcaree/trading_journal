// src/services/importService.ts
import api from './apiConfig';

export interface ValidationError {
  type: string;
  message: string;
  details?: any;
}

export interface ValidationResult {
  valid: boolean;
  total_events: number;
  filled_events?: number;
  pending_events?: number;
  unique_symbols: number;
  date_range: {
    earliest: string | null;
    latest: string | null;
  };
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats?: {
    positionsProcessed: number;
    eventsCreated: number;
    duration: number;
  };
  errors?: string[];
}

/**
 * Validate a CSV file before importing
 */
export const validateImportFile = async (file: File): Promise<ValidationResult> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/v2/positions/import/validate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

/**
 * Import a validated CSV file
 */
export const importWebullFile = async (file: File): Promise<ImportResult> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/v2/positions/import/webull', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};