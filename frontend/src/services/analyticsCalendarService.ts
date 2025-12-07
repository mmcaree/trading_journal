import api from './apiConfig';

export interface DayEventDetail {
  event_id: number;
  position_id: number;
  ticker: string;
  event_type: string;
  event_date: string;
  shares: number;
  price: number;
  realized_pnl: number;
  notes?: string;
  strategy?: string;
  setup_type?: string;
}

export interface DailyPnLEntry {
  date: string;
  net_pnl: number;
  trades_count: number;
  event_ids: number[];
  position_ids: number[];
  tickers: string[];
}

export interface CalendarSummary {
  total_pnl: number;
  trading_days: number;
  winning_days: number;
  losing_days: number;
  win_rate: number;
  best_day?: { date: string; pnl: number };
  worst_day?: { date: string; pnl: number };
  avg_winning_day: number;
  avg_losing_day: number;
}

export interface PnLCalendarResponse {
  daily_pnl: DailyPnLEntry[];
  summary: CalendarSummary;
}

export interface PnLCalendarParams {
  year?: number;
  month?: number;
  start_date?: string;
  end_date?: string;
}

class AnalyticsCalendarService {
  async getPnLCalendar(params: PnLCalendarParams): Promise<PnLCalendarResponse> {
    const response = await api.get<PnLCalendarResponse>('/api/analytics/pnl-calendar', {
      params
    });
    return response.data;
  }

  async getDayEventDetails(
    eventDate: string,
    eventIds?: number[]
  ): Promise<DayEventDetail[]> {
    const params: { event_ids?: string } = {};
    if (eventIds && eventIds.length > 0) {
      params.event_ids = eventIds.join(',');
    }

    const response = await api.get<DayEventDetail[]>(
      `/api/analytics/pnl-calendar/day/${eventDate}`,
      { params }
    );
    return response.data;
  }

  async getYearCalendar(year: number): Promise<PnLCalendarResponse> {
    return this.getPnLCalendar({ year });
  }

  async getMonthCalendar(year: number, month: number): Promise<PnLCalendarResponse> {
    return this.getPnLCalendar({ year, month });
  }

  async getDateRangeCalendar(
    startDate: string,
    endDate: string
  ): Promise<PnLCalendarResponse> {
    return this.getPnLCalendar({ start_date: startDate, end_date: endDate });
  }
}

export const analyticsCalendarService = new AnalyticsCalendarService();
export default analyticsCalendarService;