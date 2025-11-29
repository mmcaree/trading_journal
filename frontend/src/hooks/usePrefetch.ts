import { useQueryClient } from '@tanstack/react-query';
import { getPositionDetails, getAllPositions, getPositionsPaginated, Position } from '../services/positionsService';

// Export query keys for use in components
export const POSITIONS_KEY = 'positions';
export const POSITIONS_PAGINATED_KEY = 'positions-paginated';
export const POSITION_DETAILS_KEY = 'position-details';
export const LIFETIME_ANALYTICS_KEY = 'lifetime-analytics';

/**
 * Cache Time-To-Live (TTL) Strategy
 * 
 * staleTime: How long data is considered "fresh" (no refetch on mount/focus)
 * gcTime: How long unused data stays in cache before garbage collection
 * 
 * Guidelines:
 * - Position details change frequently (trades, updates) → shorter TTL
 * - Paginated lists change frequently (new positions, edits) → shortest TTL
 * - Lifetime analytics are historical/aggregated → longer TTL
 * - Related positions are for exploration → medium TTL
 */
export const CACHE_TTL = {
  // Position details: Updates when trades happen or position is edited
  POSITION_DETAILS_STALE: 1000 * 60 * 2,  // 2 minutes
  POSITION_DETAILS_GC: 1000 * 60 * 5,     // 5 minutes
  
  // Paginated positions list: Updates frequently with new trades/positions
  POSITIONS_LIST_STALE: 1000 * 30,        // 30 seconds
  POSITIONS_LIST_GC: 1000 * 60 * 2,       // 2 minutes
  
  // Lifetime analytics: Historical data, changes slowly
  LIFETIME_ANALYTICS_STALE: 1000 * 60 * 10, // 10 minutes
  LIFETIME_ANALYTICS_GC: 1000 * 60 * 30,    // 30 minutes
  
  // Related positions: Exploratory queries, medium priority
  RELATED_POSITIONS_STALE: 1000 * 60,     // 1 minute
  RELATED_POSITIONS_GC: 1000 * 60 * 5,    // 5 minutes
} as const;

export const usePrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchPositionDetails = async (positionId: number) => {
    try {
      console.log('🔄 Prefetching position details for ID:', positionId);
      await queryClient.prefetchQuery({
        queryKey: [POSITION_DETAILS_KEY, positionId],
        queryFn: () => getPositionDetails(positionId),
        staleTime: CACHE_TTL.POSITION_DETAILS_STALE,
        gcTime: CACHE_TTL.POSITION_DETAILS_GC,
      });
    } catch (error) {
      // Silent failure is OK for prefetch, but log for monitoring
      console.debug('Prefetch failed for position details', positionId, error);
    }
  };

  const prefetchNextPage = async (currentPage: number, rowsPerPage: number, searchQuery: string = ''): Promise<void> => {
    try {
      const nextPage = currentPage + 1;
      console.log('📄 Prefetching next page:', nextPage, 'Search:', searchQuery || 'none');

      await queryClient.prefetchQuery({
        queryKey: [POSITIONS_PAGINATED_KEY, nextPage, searchQuery],
        queryFn: () => getPositionsPaginated(nextPage, rowsPerPage, {
          status: 'open',
          search: searchQuery || undefined,
        }),
        staleTime: CACHE_TTL.POSITIONS_LIST_STALE,
        gcTime: CACHE_TTL.POSITIONS_LIST_GC,
      });
    } catch (error) {
      // Silent failure is OK for prefetch, but log for monitoring
      console.debug('Prefetch failed for next page', currentPage + 1, error);
    }
  };

  const prefetchRelatedPositions = async (position: Position): Promise<void> => {
    const ticker = position.ticker;
    const strategy = position.strategy;

    if (ticker) {
      try {
        await queryClient.prefetchQuery({
          queryKey: [POSITIONS_KEY, { ticker, limit: 20 }],
          queryFn: () => getAllPositions({ ticker, limit: 20 }),
          staleTime: CACHE_TTL.RELATED_POSITIONS_STALE,
          gcTime: CACHE_TTL.RELATED_POSITIONS_GC,
        });
      } catch (error) {
        // Silent failure is OK for prefetch, but log for monitoring
        console.debug('Prefetch failed for ticker positions', ticker, error);
      }
    }

    if (strategy) {
      try {
        await queryClient.prefetchQuery({
          queryKey: [POSITIONS_KEY, { strategy, limit: 20 }],
          queryFn: () => getAllPositions({ strategy, limit: 20 }),
          staleTime: CACHE_TTL.RELATED_POSITIONS_STALE,
          gcTime: CACHE_TTL.RELATED_POSITIONS_GC,
        });
      } catch (error) {
        // Silent failure is OK for prefetch, but log for monitoring
        console.debug('Prefetch failed for strategy positions', strategy, error);
      }
    }
  };

  return {
    prefetchPositionDetails,
    prefetchNextPage,
    prefetchRelatedPositions,
  };
};