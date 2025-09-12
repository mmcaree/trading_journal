// src/components/ApiDebugger.tsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Alert, Divider } from '@mui/material';
import api from '../services/apiConfig';
import { testApiConnection } from '../services/debugService';
import { useAuth } from '../context/AuthContext';

const ApiDebugger: React.FC = () => {
  const { token, isAuthenticated, user } = useAuth();
  const [apiStatus, setApiStatus] = useState<{status: string, message: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [rootEndpoint, setRootEndpoint] = useState<any>(null);
  const [debugEndpoint, setDebugEndpoint] = useState<any>(null);
  const [tradesEndpoint, setTradesEndpoint] = useState<any>(null);
  const [analyticsEndpoint, setAnalyticsEndpoint] = useState<any>(null);
  const [authStatus, setAuthStatus] = useState<any>(null);

  useEffect(() => {
    // Check authentication status on component mount
    setAuthStatus({
      isAuthenticated,
      tokenExists: !!token,
      user: user ? { ...user } : null
    });
  }, [isAuthenticated, token, user]);

  const testApi = async () => {
    setLoading(true);
    try {
      const result = await testApiConnection();
      setApiStatus(result);
      
      // Test root endpoint
      try {
        const rootResponse = await api.get('/');
        setRootEndpoint({
          status: 'success',
          data: rootResponse.data
        });
      } catch (error: any) {
        setRootEndpoint({
          status: 'error',
          message: error.message,
          details: error.response?.data || 'No details available'
        });
      }
      
      // Test debug endpoint
      try {
        const debugResponse = await api.get('/api/debug');
        setDebugEndpoint({
          status: 'success',
          data: debugResponse.data
        });
      } catch (error: any) {
        setDebugEndpoint({
          status: 'error',
          message: error.message,
          details: error.response?.data || 'No details available'
        });
      }
      
      // Test trades endpoint
      try {
        const tradesResponse = await api.get('/api/trades/');
        setTradesEndpoint({
          status: 'success',
          data: tradesResponse.data
        });
      } catch (error: any) {
        setTradesEndpoint({
          status: 'error',
          message: error.message,
          details: error.response?.data || 'No details available'
        });
      }
      
      // Test analytics endpoint
      try {
        const analyticsResponse = await api.get('/api/analytics/performance');
        setAnalyticsEndpoint({
          status: 'success',
          data: analyticsResponse.data
        });
      } catch (error: any) {
        setAnalyticsEndpoint({
          status: 'error',
          message: error.message,
          details: error.response?.data || 'No details available'
        });
      }
    } catch (error: any) {
      setApiStatus({
        status: 'error',
        message: `Test failed: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, m: 2, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>API Connection Debugger</Typography>
      
      <Button 
        variant="contained" 
        color="primary" 
        onClick={testApi} 
        disabled={loading}
        sx={{ mb: 2 }}
      >
        {loading ? 'Testing...' : 'Test API Connection'}
      </Button>
      
      {apiStatus && (
        <Alert severity={apiStatus.status === 'success' ? 'success' : 'error'} sx={{ mb: 2 }}>
          {apiStatus.message}
        </Alert>
      )}
      
      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Authentication Status</Typography>
      {authStatus ? (
        <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(authStatus, null, 2)}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="textSecondary">Not available</Typography>
      )}
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Endpoint Tests</Typography>
      
      <Typography variant="subtitle1" gutterBottom>Root Endpoint (/)</Typography>
      {rootEndpoint ? (
        <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(rootEndpoint, null, 2)}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="textSecondary">Not tested yet</Typography>
      )}
      
      <Typography variant="subtitle1" gutterBottom>Debug Endpoint (/api/debug)</Typography>
      {debugEndpoint ? (
        <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(debugEndpoint, null, 2)}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="textSecondary">Not tested yet</Typography>
      )}
      
      <Typography variant="subtitle1" gutterBottom>Trades Endpoint (/api/trades)</Typography>
      {tradesEndpoint ? (
        <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            Status: {tradesEndpoint.status}
            {tradesEndpoint.status === 'success' 
              ? `\nReceived ${Array.isArray(tradesEndpoint.data) ? tradesEndpoint.data.length : 0} trades` 
              : `\nError: ${tradesEndpoint.message}`}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="textSecondary">Not tested yet</Typography>
      )}
      
      <Typography variant="subtitle1" gutterBottom>Analytics Endpoint (/api/analytics/performance)</Typography>
      {analyticsEndpoint ? (
        <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            Status: {analyticsEndpoint.status}
            {analyticsEndpoint.status === 'success' 
              ? `\nData: ${JSON.stringify(analyticsEndpoint.data, null, 2)}` 
              : `\nError: ${analyticsEndpoint.message}`}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="textSecondary">Not tested yet</Typography>
      )}
    </Paper>
  );
};

export default ApiDebugger;
