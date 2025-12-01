import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  Paper,
  Stack,
  Chip
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  TrendingUp as PositionsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import UniversalImportModal from '../components/UniversalImportModal';

const ImportData: React.FC = () => {
  const navigate = useNavigate();
  const [importModalOpen, setImportModalOpen] = useState(false);

  const handleImportSuccess = () => {
    setImportModalOpen(false);
    // Navigate to positions page after successful import
    navigate('/positions');
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Import Trades from Broker
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Import your trading history from multiple broker platforms
      </Typography>

      {/* Info Alert */}
      <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 4 }}>
        <Typography variant="subtitle2" gutterBottom>
          Universal Import System
        </Typography>
        <Typography variant="body2">
          Our new universal import system supports multiple broker formats including Webull, 
          Robinhood, TD Ameritrade, Interactive Brokers, E*TRADE, Fidelity, and Charles Schwab.
        </Typography>
      </Alert>

      {/* Options Trading Disclaimer */}
      <Alert severity="warning" sx={{ mb: 4 }}>
        <Typography variant="body2">
          <strong>Note:</strong> Importing options trades is not currently supported. Options trades will need to be input manually until I get access to more broker data for options formatting.
          <strong>Note:</strong> If your data doesn't import correctly, please reach out to @theburlywizard on Discord with a sample CSV file from your broker so I can implement a fix, I only have access to so much broker data for testing. Thank you for your patience!
        </Typography>
      </Alert>

      {/* Main Import Card */}
      <Card elevation={3}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3} alignItems="center">
            <UploadIcon sx={{ fontSize: 80, color: 'primary.main' }} />
            
            <Typography variant="h5" align="center">
              Import Your Trading History
            </Typography>
            
            <Typography variant="body1" align="center" color="text.secondary" sx={{ maxWidth: 600 }}>
              Upload CSV files from your broker to automatically import your positions and trading history. 
              The system will auto-detect your broker format.
            </Typography>

            {/* Supported Brokers */}
            <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 700 }}>
              <Typography variant="subtitle2" gutterBottom align="center" sx={{ mb: 2 }}>
                Supported Brokers
              </Typography>
              <Stack 
                direction="row" 
                spacing={1} 
                flexWrap="wrap" 
                justifyContent="center"
                sx={{ gap: 1 }}
              >
                <Chip label="Webull (USA)" color="primary" variant="outlined" />
                <Chip label="Webull (Australia)" color="primary" variant="outlined" />
                <Chip label="Robinhood" color="primary" variant="outlined" />
                <Chip label="TD Ameritrade" color="primary" variant="outlined" />
                <Chip label="Interactive Brokers" color="primary" variant="outlined" />
                <Chip label="E*TRADE" color="primary" variant="outlined" />
                <Chip label="Fidelity" color="primary" variant="outlined" />
                <Chip label="Charles Schwab" color="primary" variant="outlined" />
              </Stack>
            </Paper>

            {/* Action Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<UploadIcon />}
                onClick={() => setImportModalOpen(true)}
                sx={{ px: 4, py: 1.5 }}
              >
                Import CSV File
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<PositionsIcon />}
                onClick={() => navigate('/positions')}
                sx={{ px: 4, py: 1.5 }}
              >
                View Positions
              </Button>
            </Stack>

            {/* Features */}
            <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 700, mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Features:
              </Typography>
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  ✓ Automatic broker format detection
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ✓ CSV validation before import
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ✓ Preview sample data before importing
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ✓ Download CSV templates for each broker
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ✓ Manual column mapping for custom formats
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ✓ Support for multiple currencies
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </CardContent>
      </Card>

      {/* Universal Import Modal */}
      <UniversalImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
      />
    </Box>
  );
};

export default ImportData;
