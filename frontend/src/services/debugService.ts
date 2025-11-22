// src/services/debugService.ts
import api from './apiConfig';
import { 
  ApiConnectionStatus, 
  AuthStatusResponse, 
  AnalyticsDebugData,
  AxiosErrorResponse 
} from '../types/api';

export const testApiConnection = async (): Promise<ApiConnectionStatus> => {
  try {
    console.log('Testing API connection...');
    const response = await api.get('/api/debug');
    console.log('API connection test result:', response.data);
    return {
      status: 'success',
      message: `API connection successful: ${response.data.message}`
    };
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('API connection test failed:', axiosError);
    return {
      status: 'error',
      message: `API connection failed: ${axiosError.message}`
    };
  }
};

export const debugAnalyticsData = async (): Promise<AnalyticsDebugData> => {
  try {
    console.log('Fetching analytics debug data...');
    const response = await api.get('/api/debug/analytics-data');
    console.log('Analytics debug data:', response.data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Failed to fetch analytics debug data:', axiosError);
    throw error;
  }
};

export const checkAuthStatus = async (): Promise<AuthStatusResponse> => {
  try {
    console.log('Checking authentication status...');
    
    // Check if token exists in localStorage
    const token = localStorage.getItem('token');
    
    if (!token) {
      return {
        status: 'unauthenticated',
        message: 'No authentication token found'
      };
    }
    
    // Try to access a protected endpoint to verify token
    try {
      const response = await api.get('/api/trades/');
      return {
        status: 'authenticated',
        message: 'Authentication token is valid',
        tokenExists: true,
        tokenValue: token.substring(0, 10) + '...' // Show only part of the token for security
      };
    } catch (error) {
      const axiosError = error as AxiosErrorResponse;
      return {
        status: 'error',
        message: `Authentication token may be invalid: ${axiosError.message}`,
        tokenExists: true,
        error: axiosError.message
      };
    }
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Auth status check failed:', axiosError);
    return {
      status: 'error',
      message: `Failed to check auth status: ${axiosError.message}`
    };
  }
};

export default {
  testApiConnection,
  debugAnalyticsData,
  checkAuthStatus
};
