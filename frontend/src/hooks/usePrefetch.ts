import { useQueryClient } from '@tanstack/react-query';
import { getPositionDetails, getAllPositions, Position } from '../services/positionsService';

const POSITIONS_KEY = 'positions';
const POSITION_DETAILS_KEY = 'position-details';

export const usePrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchPositionDetails = (positionId: number) => {
    queryClient.prefetchQuery({
      queryKey: [POSITION_DETAILS_KEY, positionId],
      queryFn: () => getPositionDetails(positionId),
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    });
  };

  const prefetchNextPage = (currentPage: number, rowsPerPage: number, searchQuery: string = '') => {
    const nextPage = currentPage + 1;
    const skip = nextPage * rowsPerPage;

    queryClient.prefetchQuery({
      queryKey: [POSITIONS_KEY, { status: 'open', skip, limit: rowsPerPage, search: searchQuery }],
      queryFn: () => getAllPositions({
        status: 'open',
        skip,
        limit: rowsPerPage,
      }),
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 2,
    });
  };

  const prefetchRelatedPositions = async (position: Position) => {
    const ticker = position.ticker;
    const strategy = position.strategy;

    if (ticker) {
      queryClient.prefetchQuery({
        queryKey: [POSITIONS_KEY, { ticker, limit: 20 }],
        queryFn: () => getAllPositions({ ticker, limit: 20 }),
      });
    }

    if (strategy) {
      queryClient.prefetchQuery({
        queryKey: [POSITIONS_KEY, { strategy, limit: 20 }],
        queryFn: () => getAllPositions({ strategy, limit: 20 }),
      });
    }
  };

  return {
    prefetchPositionDetails,
    prefetchNextPage,
    prefetchRelatedPositions,
  };
};