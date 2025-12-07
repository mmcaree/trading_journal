import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  analyticsCalendarService,
  PnLCalendarResponse,
  DayEventDetail,
  PnLCalendarParams
} from '../services/analyticsCalendarService';

export function usePnLCalendar(
  params: PnLCalendarParams,
  enabled: boolean = true
): UseQueryResult<PnLCalendarResponse, Error> {
  return useQuery({
    queryKey: ['pnl-calendar', params],
    queryFn: () => analyticsCalendarService.getPnLCalendar(params),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useYearCalendar(
  year: number,
  enabled: boolean = true
): UseQueryResult<PnLCalendarResponse, Error> {
  return usePnLCalendar({ year }, enabled);
}

export function useMonthCalendar(
  year: number,
  month: number,
  enabled: boolean = true
): UseQueryResult<PnLCalendarResponse, Error> {
  return usePnLCalendar({ year, month }, enabled);
}


export function useDayEventDetails(
  eventDate: string | null,
  eventIds?: number[]
): UseQueryResult<DayEventDetail[], Error> {
  return useQuery({
    queryKey: ['day-events', eventDate, eventIds],
    queryFn: () => {
      if (!eventDate) throw new Error('Event date is required');
      return analyticsCalendarService.getDayEventDetails(eventDate, eventIds);
    },
    enabled: !!eventDate,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}