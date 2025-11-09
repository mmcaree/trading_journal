import React, { useState } from 'react';
import { Box, Button, Typography, Paper, TextField, Divider } from '@mui/material';
import { testApiConnection, debugAnalyticsData } from '../services/debugService';
import { getAllPositions } from '../services/positionsService';

const DebugConsole: React.FC = () => {
  const [output, setOutput] = useState<string>('Debug output will appear here');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const testConnection = async () => {
    setIsLoading(true);
    try {
      const result = await testApiConnection();
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(`Error: ${JSON.stringify(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const result = await debugAnalyticsData();
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(`Error: ${JSON.stringify(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testPositionsService = async () => {
    setIsLoading(true);
    try {
      const result = await getAllPositions({ limit: 10 });
      setOutput(`Positions (v2 API):\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      setOutput(`Error: ${JSON.stringify(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Debug Console</Typography>
      
      <Box sx={{ mb: 2 }}>
        <Button 
          variant="contained" 
          onClick={testConnection}
          disabled={isLoading}
          sx={{ mr: 1 }}
        >
          Test API Connection
        </Button>
        
        <Button 
          variant="contained" 
          onClick={testAnalyticsData}
          disabled={isLoading}
          sx={{ mr: 1 }}
        >
          Debug Analytics Data
        </Button>
        
        <Button 
          variant="contained" 
          onClick={testPositionsService}
          disabled={isLoading}
        >
          Test Positions API (v2)
        </Button>
      </Box>
      
      <Paper 
        sx={{ 
          p: 2, 
          maxHeight: '600px', 
          overflow: 'auto',
          backgroundColor: '#f5f5f5',
          fontFamily: 'monospace'
        }}
      >
        <pre>{output}</pre>
      </Paper>
    </Box>
  );
};

export default DebugConsole;
