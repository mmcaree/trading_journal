// src/services/debugService.ts
import api from './apiConfig';

export const testApiConnection = async (): Promise<{status: string, message: string}> => {
  try {
    console.log('Testing API connection...');
    const response = await api.get('/api/debug');
    console.log('API connection test result:', response.data);
    return {
      status: 'success',
      message: `API connection successful: ${response.data.message}`
    };
  } catch (error: any) {
    console.error('API connection test failed:', error);
    return {
      status: 'error',
      message: `API connection failed: ${error.message}`
    };
  }
};

export const debugAnalyticsData = async (): Promise<any> => {
  try {
    console.log('Fetching analytics debug data...');
    const response = await api.get('/api/debug/analytics-data');
    console.log('Analytics debug data:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch analytics debug data:', error);
    throw error;
  }
};

export const checkAuthStatus = async (): Promise<any> => {
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
    } catch (error: any) {
      return {
        status: 'error',
        message: `Authentication token may be invalid: ${error.message}`,
        tokenExists: true,
        error: error.message
      };
    }
  } catch (error: any) {
    console.error('Auth status check failed:', error);
    return {
      status: 'error',
      message: `Failed to check auth status: ${error.message}`
    };
  }
};

export default {
  testApiConnection,
  debugAnalyticsData,
  checkAuthStatus
};
