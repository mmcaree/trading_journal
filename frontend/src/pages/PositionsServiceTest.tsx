import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { getAllPositions, getPositionDetails, Position, PositionDetails } from '../services/positionsService';

const PositionsServiceTest: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<PositionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const testGetAllPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      addTestResult('Testing getAllPositions...');
      
      const allPositions = await getAllPositions();
      setPositions(allPositions);
      addTestResult(`✅ Success: Got ${allPositions.length} positions`);
      
      if (allPositions.length > 0) {
        const sample = allPositions[0];
        addTestResult(`📊 Sample: ${sample.ticker} - ${sample.status} - ${sample.current_shares} shares`);
      }
    } catch (err: any) {
      const errorMsg = `❌ Error: ${err.message}`;
      setError(errorMsg);
      addTestResult(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const testGetOpenPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      addTestResult('Testing getAllPositions with status=open...');
      
      const openPositions = await getAllPositions({ status: 'open' });
      addTestResult(`✅ Success: Got ${openPositions.length} open positions`);
    } catch (err: any) {
      const errorMsg = `❌ Error: ${err.message}`;
      setError(errorMsg);
      addTestResult(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const testGetClosedPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      addTestResult('Testing getAllPositions with status=closed...');
      
      const closedPositions = await getAllPositions({ status: 'closed' });
      addTestResult(`✅ Success: Got ${closedPositions.length} closed positions`);
    } catch (err: any) {
      const errorMsg = `❌ Error: ${err.message}`;
      setError(errorMsg);
      addTestResult(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const testGetPositionDetails = async (positionId: number) => {
    try {
      setLoading(true);
      setError(null);
      addTestResult(`Testing getPositionDetails for position ${positionId}...`);
      
      const details = await getPositionDetails(positionId);
      setSelectedDetails(details);
      addTestResult(`✅ Success: Got details for ${details.position.ticker}`);
      addTestResult(`📊 Events: ${details.events.length}, Metrics: ${Object.keys(details.metrics).length}`);
    } catch (err: any) {
      const errorMsg = `❌ Error: ${err.message}`;
      setError(errorMsg);
      addTestResult(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Positions Service Test Page
      </Typography>
      
      <Typography variant="body1" sx={{ mb: 3 }}>
        Testing the new /api/v2/positions service layer before migrating the main Positions page.
      </Typography>

      {/* Test Buttons */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>API Tests</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button 
            variant="contained" 
            onClick={testGetAllPositions}
            disabled={loading}
          >
            Test All Positions
          </Button>
          <Button 
            variant="contained" 
            onClick={testGetOpenPositions}
            disabled={loading}
          >
            Test Open Positions
          </Button>
          <Button 
            variant="contained" 
            onClick={testGetClosedPositions}
            disabled={loading}
          >
            Test Closed Positions
          </Button>
        </Box>
        {loading && <CircularProgress sx={{ mt: 2 }} />}
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Test Results Log */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Test Results Log</Typography>
        <Box sx={{ maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.85em' }}>
          {testResults.map((result, index) => (
            <div key={index}>{result}</div>
          ))}
        </Box>
      </Paper>

      {/* Positions Table */}
      {positions.length > 0 && (
        <Paper sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ p: 2 }}>
            Loaded Positions ({positions.length})
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Ticker</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Shares</TableCell>
                  <TableCell>Avg Price</TableCell>
                  <TableCell>Total Cost</TableCell>
                  <TableCell>Realized P&L</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.slice(0, 10).map((position) => (
                  <TableRow key={position.id}>
                    <TableCell>{position.id}</TableCell>
                    <TableCell>{position.ticker}</TableCell>
                    <TableCell>
                      <Chip 
                        label={position.status} 
                        color={position.status === 'open' ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{position.current_shares}</TableCell>
                    <TableCell>{formatCurrency(position.avg_entry_price)}</TableCell>
                    <TableCell>{formatCurrency(position.total_cost)}</TableCell>
                    <TableCell>{formatCurrency(position.total_realized_pnl)}</TableCell>
                    <TableCell>
                      <Button 
                        size="small" 
                        onClick={() => testGetPositionDetails(position.id)}
                        disabled={loading}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {positions.length > 10 && (
            <Typography sx={{ p: 2, color: 'text.secondary' }}>
              ... and {positions.length - 10} more positions
            </Typography>
          )}
        </Paper>
      )}

      {/* Position Details */}
      {selectedDetails && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Position Details: {selectedDetails.position.ticker}
          </Typography>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Position Info:</Typography>
            <Typography>Status: {selectedDetails.position.status}</Typography>
            <Typography>Shares: {selectedDetails.position.current_shares}</Typography>
            <Typography>Avg Price: {formatCurrency(selectedDetails.position.avg_entry_price)}</Typography>
            <Typography>Opened: {formatDate(selectedDetails.position.opened_at)}</Typography>
            {selectedDetails.position.closed_at && (
              <Typography>Closed: {formatDate(selectedDetails.position.closed_at)}</Typography>
            )}
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Events ({selectedDetails.events.length}):</Typography>
            {selectedDetails.events.map((event) => (
              <Typography key={event.id} sx={{ ml: 2, fontSize: '0.9em' }}>
                {formatDate(event.event_date)}: {event.event_type.toUpperCase()} {Math.abs(event.shares)} @ {formatCurrency(event.price)}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2">Metrics:</Typography>
            <Typography>Total Bought: {selectedDetails.metrics.total_bought}</Typography>
            <Typography>Total Sold: {selectedDetails.metrics.total_sold}</Typography>
            <Typography>Avg Buy Price: {formatCurrency(selectedDetails.metrics.avg_buy_price)}</Typography>
            <Typography>Avg Sell Price: {formatCurrency(selectedDetails.metrics.avg_sell_price)}</Typography>
            <Typography>Realized P&L: {formatCurrency(selectedDetails.metrics.realized_pnl)}</Typography>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default PositionsServiceTest;