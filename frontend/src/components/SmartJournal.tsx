import React, { useState, useEffect } from 'react';
import { JournalEntryList } from './JournalEntryList';
import { TemporaryNotes } from './TemporaryNotes';
import { journalService } from '../services/journalService';

class JournalErrorBoundary extends React.Component<
  React.PropsWithChildren<{ onError: () => void }>,
  { hasError: boolean }
> {
  constructor(props: React.PropsWithChildren<{ onError: () => void }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Journal system error caught by boundary:', error, errorInfo);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null; // Let parent handle fallback
    }

    return this.props.children;
  }
}

interface SmartJournalProps {
  positionId: number;
  positionNotes?: string;
  positionLessons?: string;
  positionMistakes?: string;
  onViewImage?: (imageUrl: string, imageDescription?: string) => void;
}

export const SmartJournal: React.FC<SmartJournalProps> = ({ 
  positionId, 
  positionNotes, 
  positionLessons, 
  positionMistakes,
  onViewImage 
}) => {
  const [useNewSystem, setUseNewSystem] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkJournalSystem = async () => {
      try {
        // Try to fetch journal entries to see if the new system is working
        const result = await journalService.getJournalEntries(positionId);
        console.log('Journal API response:', result);
        
        // Verify the result is a valid array
        if (Array.isArray(result)) {
          console.log('Journal system is working, using new diary-style interface');
          setUseNewSystem(true);
        } else {
          console.log('API returned non-array format:', typeof result, result);
          throw new Error('API returned invalid format');
        }
      } catch (error) {
        console.log('Journal system not ready, falling back to temporary notes:', error);
        // For now, let's always use fallback until backend is ready
        setUseNewSystem(false);
      } finally {
        setIsChecking(false);
      }
    };

    // Test the new journal system
    console.log('Testing journal system...');
    checkJournalSystem();
  }, [positionId]);

  if (isChecking) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <p>Loading journal system...</p>
      </div>
    );
  }

  if (useNewSystem) {
    return (
      <JournalErrorBoundary onError={() => setUseNewSystem(false)}>
        <JournalEntryList positionId={positionId} onViewImage={onViewImage} />
      </JournalErrorBoundary>
    );
  } else {
    return (
      <TemporaryNotes 
        positionId={positionId}
        initialNotes={positionNotes}
        initialLessons={positionLessons}
        initialMistakes={positionMistakes}
      />
    );
  }
};