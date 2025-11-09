import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ mt: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom>
              <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Journal System Error
            </Typography>
            <Typography variant="body2" gutterBottom>
              There was an error loading the journal entries. The new diary-style system may need additional setup.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Error: {this.state.error?.message}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button 
                size="small" 
                onClick={() => this.setState({ hasError: false })}
                variant="outlined"
              >
                Try Again
              </Button>
            </Box>
          </Box>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;