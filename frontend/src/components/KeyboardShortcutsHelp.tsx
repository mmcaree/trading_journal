import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Chip,
  Grid,
  IconButton,
  Tooltip,
  Paper
} from '@mui/material';
import {
  HelpOutline as HelpIcon,
  Keyboard as KeyboardIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  open: boolean;
  onClose: () => void;
}

interface KeyboardShortcutsButtonProps {
  shortcuts: KeyboardShortcut[];
}

const formatShortcutKey = (shortcut: KeyboardShortcut): string => {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.metaKey) parts.push('Cmd');
  
  parts.push(shortcut.key === ' ' ? 'Space' : shortcut.key.toUpperCase());
  
  return parts.join(' + ');
};

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  shortcuts,
  open,
  onClose
}) => {
  // Group shortcuts by context
  const groupedShortcuts = shortcuts.reduce((groups, shortcut) => {
    const context = shortcut.context || 'global';
    if (!groups[context]) {
      groups[context] = [];
    }
    groups[context].push(shortcut);
    return groups;
  }, {} as Record<string, KeyboardShortcut[]>);

  const contextLabels: Record<string, string> = {
    global: 'Global Shortcuts',
    positions: 'Positions Page',
    'trades-list': 'Trades History',
    modal: 'Modal Navigation'
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02))'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        pb: 1 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyboardIcon color="primary" />
          <Typography variant="h6">
            Keyboard Shortcuts
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: 'text.secondary' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Speed up your trading workflow with these keyboard shortcuts
        </Typography>

        <Box sx={{ mt: 3 }}>
          {Object.entries(groupedShortcuts).map(([context, contextShortcuts], index) => (
            <Box key={context} sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ 
                color: 'primary.main',
                fontWeight: 600,
                fontSize: '1rem'
              }}>
                {contextLabels[context] || context}
              </Typography>
              
              <Paper sx={{ 
                p: 2, 
                bgcolor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Grid container spacing={2}>
                  {contextShortcuts.map((shortcut, shortcutIndex) => (
                    <Grid item xs={12} sm={6} key={shortcutIndex}>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        py: 0.5
                      }}>
                        <Typography variant="body2">
                          {shortcut.description}
                        </Typography>
                        <Chip
                          label={formatShortcutKey(shortcut)}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: 'primary.main',
                            color: 'primary.light',
                            fontWeight: 600
                          }}
                        />
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
              
              {index < Object.entries(groupedShortcuts).length - 1 && (
                <Divider sx={{ mt: 2, opacity: 0.3 }} />
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ 
          mt: 4, 
          p: 2, 
          bgcolor: 'info.dark', 
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'info.main'
        }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            💡 Pro Tips:
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
            • Shortcuts work globally except when typing in input fields
            <br />
            • Use <Chip label="Esc" size="small" sx={{ mx: 0.5, fontSize: '0.7rem' }} /> to close any modal quickly
            <br />
            • Shortcuts are context-aware - different pages have different shortcuts available
            <br />
            • Hold <Chip label="?" size="small" sx={{ mx: 0.5, fontSize: '0.7rem' }} /> to see this help anytime
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button onClick={onClose} variant="contained">
          Got it!
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Floating keyboard shortcuts help button
 */
export const KeyboardShortcutsButton: React.FC<KeyboardShortcutsButtonProps> = ({
  shortcuts
}) => {
  const [helpOpen, setHelpOpen] = useState(false);

  // Add keyboard shortcut to open help with '?' key
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        const isInputElement = target.tagName === 'INPUT' || 
                              target.tagName === 'TEXTAREA' || 
                              target.contentEditable === 'true';
        
        if (!isInputElement) {
          event.preventDefault();
          setHelpOpen(true);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <Tooltip title="View keyboard shortcuts (?)">
        <IconButton
          onClick={() => setHelpOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.dark',
              transform: 'scale(1.05)'
            },
            transition: 'all 0.2s ease-in-out',
            boxShadow: 3,
            zIndex: 1000
          }}
        >
          <KeyboardIcon />
        </IconButton>
      </Tooltip>

      <KeyboardShortcutsHelp
        shortcuts={shortcuts}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </>
  );
};

export default KeyboardShortcutsHelp;