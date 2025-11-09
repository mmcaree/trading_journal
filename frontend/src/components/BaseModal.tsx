import React, { ReactNode, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Fade
} from '@mui/material';
import {
  Close as CloseIcon
} from '@mui/icons-material';
import { useKeyboardShortcuts, createModalShortcuts } from '../hooks/useKeyboardShortcuts';

export interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  error?: string | null;
  disableEscapeKeyDown?: boolean;
  disableBackdropClick?: boolean;
  onSubmit?: () => void; // For Ctrl+Enter submit
  submitDisabled?: boolean;
}

const BaseModal: React.FC<BaseModalProps> = ({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'sm',
  loading = false,
  error = null,
  disableEscapeKeyDown = false,
  disableBackdropClick = false,
  onSubmit,
  submitDisabled = false
}) => {
  
  // Enhanced keyboard shortcuts for modals
  const modalShortcuts = createModalShortcuts({
    onClose: () => {
      if (!disableEscapeKeyDown) {
        onClose();
      }
    },
    onSubmit: () => {
      if (onSubmit && !submitDisabled && !loading) {
        onSubmit();
      }
    }
  });

  useKeyboardShortcuts({
    shortcuts: modalShortcuts,
    enabled: open,
    context: 'modal'
  });

  // Focus management for accessibility
  useEffect(() => {
    if (open) {
      // Focus the modal when it opens
      const timer = setTimeout(() => {
        const modal = document.querySelector('[role="dialog"]') as HTMLElement;
        if (modal) {
          modal.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle backdrop clicks properly - only close on backdrop, not content clicks
  const handleClose = (event: {}, reason: "backdropClick" | "escapeKeyDown") => {
    if (reason === "backdropClick" && disableBackdropClick) {
      return;
    }
    if (reason === "escapeKeyDown" && disableEscapeKeyDown) {
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth
      aria-labelledby="modal-title"
      aria-describedby="modal-content"
      TransitionComponent={Fade}
      transitionDuration={200}
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 2,
          boxShadow: (theme) => theme.shadows[20],
        }
      }}
    >
      {/* Header */}
      <DialogTitle
        id="modal-title"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 2,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`
        }}
      >
        <Typography variant="h6" component="span" fontWeight={600}>
          {title}
        </Typography>
        
        <IconButton
          aria-label="close modal"
          onClick={onClose}
          size="small"
          sx={{
            color: (theme) => theme.palette.grey[500],
            '&:hover': {
              backgroundColor: (theme) => theme.palette.action.hover,
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Content */}
      <DialogContent
        id="modal-content"
        sx={{
          pt: 3,
          position: 'relative',
          minHeight: 200
        }}
      >
        {/* Loading Overlay */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              zIndex: 1000,
              borderRadius: 1
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary">
                Processing...
              </Typography>
            </Box>
          </Box>
        )}

        {/* Error Alert */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            onClose={() => {/* Error can be cleared by parent */}}
          >
            {error}
          </Alert>
        )}

        {/* Main Content */}
        <Box sx={{ opacity: loading ? 0.5 : 1 }}>
          {children}
        </Box>
      </DialogContent>

      {/* Actions */}
      {actions && (
        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            pt: 2,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
            gap: 1
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default BaseModal;