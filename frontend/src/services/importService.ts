// src/services/importService.ts
import api from './apiConfig';
import { ValidationError, ValidationResult, ImportResult } from '../types/api';

// Re-export types for backward compatibility
export type { ValidationError, ValidationResult, ImportResult };

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
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};