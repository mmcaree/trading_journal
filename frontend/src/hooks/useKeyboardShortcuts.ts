import { useEffect, useCallback, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  handler: (event: KeyboardEvent) => void;
  description: string;
  context?: string; // 'global' | 'modal' | 'positions' | 'trades-list'
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  context?: string;
}

/**
 * Professional keyboard shortcuts hook for trading platform functionality
 * Supports global shortcuts, modal navigation, and context-aware bindings
 */
export const useKeyboardShortcuts = ({
  shortcuts,
  enabled = true,
  context = 'global'
}: UseKeyboardShortcutsProps) => {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when user is typing in input fields
    const target = event.target as HTMLElement;
    const isInputElement = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.contentEditable === 'true' ||
                          target.closest('[role="textbox"]') !== null;

    // Allow Escape key even in input fields (for modal closing)
    if (isInputElement && event.key !== 'Escape') {
      return;
    }

    const activeShortcuts = shortcutsRef.current.filter(shortcut => 
      !shortcut.context || shortcut.context === context || shortcut.context === 'global'
    );

    for (const shortcut of activeShortcuts) {
      const keyMatches = shortcut.key.toLowerCase() === event.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
      const altMatches = !!shortcut.altKey === event.altKey;
      const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
      const metaMatches = !!shortcut.metaKey === event.metaKey;

      if (keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.handler(event);
        break; // Only execute the first matching shortcut
      }
    }
  }, [enabled, context]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  // Helper function to format shortcut display text
  const formatShortcut = useCallback((shortcut: KeyboardShortcut): string => {
    const parts: string[] = [];
    
    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.altKey) parts.push('Alt');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.metaKey) parts.push('Cmd');
    
    parts.push(shortcut.key.toUpperCase());
    
    return parts.join(' + ');
  }, []);

  return {
    formatShortcut,
    shortcuts: shortcutsRef.current
  };
};

/**
 * Common keyboard shortcuts for trading platform
 */
export const createTradingShortcuts = (handlers: {
  onAddPosition?: () => void;
  onSellPosition?: () => void;
  onPositionDetails?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
}): KeyboardShortcut[] => [
  {
    key: 'a',
    ctrlKey: true,
    handler: () => handlers.onAddPosition?.(),
    description: 'Add new position',
    context: 'positions'
  },
  {
    key: 's',
    ctrlKey: true,
    handler: () => handlers.onSellPosition?.(),
    description: 'Sell from position',
    context: 'positions'
  },
  {
    key: 'd',
    ctrlKey: true,
    handler: () => handlers.onPositionDetails?.(),
    description: 'View position details',
    context: 'positions'
  },
  {
    key: 'r',
    ctrlKey: true,
    handler: () => handlers.onRefresh?.(),
    description: 'Refresh data',
    context: 'global'
  },
  {
    key: 'f',
    ctrlKey: true,
    handler: () => handlers.onSearch?.(),
    description: 'Focus search',
    context: 'global'
  },
  {
    key: 'k',
    ctrlKey: true,
    handler: () => handlers.onFilter?.(),
    description: 'Open filters',
    context: 'global'
  }
];

/**
 * Modal-specific keyboard shortcuts
 */
export const createModalShortcuts = (handlers: {
  onClose?: () => void;
  onSubmit?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}): KeyboardShortcut[] => [
  {
    key: 'Escape',
    handler: () => handlers.onClose?.(),
    description: 'Close modal',
    context: 'modal',
    preventDefault: false
  },
  {
    key: 'Enter',
    ctrlKey: true,
    handler: () => handlers.onSubmit?.(),
    description: 'Submit form',
    context: 'modal'
  },
  {
    key: 'ArrowRight',
    ctrlKey: true,
    handler: () => handlers.onNext?.(),
    description: 'Next tab/step',
    context: 'modal'
  },
  {
    key: 'ArrowLeft',
    ctrlKey: true,
    handler: () => handlers.onPrevious?.(),
    description: 'Previous tab/step',
    context: 'modal'
  }
];

export default useKeyboardShortcuts;