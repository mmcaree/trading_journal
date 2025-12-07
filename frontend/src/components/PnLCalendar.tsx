import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  CircularProgress,
  Alert,
  Card,
  CardContent
} from '@mui/material';
import { useYearCalendar, useMonthCalendar } from '../hooks/useCalendarData';
import { CalendarDay } from './CalendarDay';
import DayDetailsModal from './dayDetailsModal';

export type TimeScale = '1M' | '3M' | '6M' | 'YTD' | '1YR' | 'ALL';

interface PnLCalendarProps {
  timeScale: TimeScale;
  formatCurrency: (value: number, decimalPlaces?: number) => string;
}

export const PnLCalendar: React.FC<PnLCalendarProps> = ({
  timeScale,
  formatCurrency
}) => {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1); // 1-12
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<number[] | undefined>();
  const [selectedDayPnl, setSelectedDayPnl] = useState<number>(0);

  const isMonthView = timeScale !== 'ALL';

  const {
    data: calendarData,
    isLoading,
    error
  } = isMonthView
    ? useMonthCalendar(selectedYear, selectedMonth)
    : useYearCalendar(selectedYear);

  const dailyPnLMap = useMemo(() => {
    const map = new Map<string, any>();
    if (calendarData?.daily_pnl) {
      calendarData.daily_pnl.forEach(day => {
        map.set(day.date, day);
      });
    }
    return map;
  }, [calendarData]);

  const handleDayClick = (date: Date, dayData: any) => {
    const dateKey = date.toISOString().split('T')[0];
    setSelectedDate(dateKey);
    setSelectedEventIds(dayData.event_ids);
    setSelectedDayPnl(dayData.net_pnl);
    setModalOpen(true);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Failed to load calendar data: {error.message}
      </Alert>
    );
  }

  if (isMonthView) {
    const currentMonth = new Date(selectedYear, selectedMonth - 1, 1);
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
    const endOfMonth = new Date(selectedYear, selectedMonth, 0);
    const startDayOfWeek = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = Array(startDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(new Date(selectedYear, selectedMonth - 1, day));
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Button onClick={handlePrevMonth} variant="outlined">
            ← Prev Month
          </Button>
          <Box textAlign="center">
            <Typography variant="h6">{monthName}</Typography>
            {calendarData?.summary && (
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 'bold',
                  color: calendarData.summary.total_pnl >= 0 ? 'success.main' : 'error.main'
                }}
              >
                {formatCurrency(calendarData.summary.total_pnl)}
              </Typography>
            )}
          </Box>
          <Button onClick={handleNextMonth} variant="outlined">
            Next Month →
          </Button>
        </Box>

        {calendarData?.summary && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Trading Days</Typography>
                  <Typography variant="h6">{calendarData.summary.trading_days}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={3}>
              <Card sx={{ bgcolor: 'success.light' }}>
                <CardContent>
                  <Typography variant="body2" color="success.contrastText">Win Rate</Typography>
                  <Typography variant="h6" color="success.contrastText">
                    {calendarData.summary.win_rate.toFixed(1)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Best Day</Typography>
                  <Typography variant="h6" color="success.main">
                    {calendarData.summary.best_day
                      ? formatCurrency(calendarData.summary.best_day.pnl)
                      : '—'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Worst Day</Typography>
                  <Typography variant="h6" color="error.main">
                    {calendarData.summary.worst_day
                      ? formatCurrency(calendarData.summary.worst_day.pnl)
                      : '—'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <TableCell key={day} align="center" sx={{ fontWeight: 'bold' }}>
                    {day}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {weeks.map((week, weekIdx) => (
                <TableRow key={weekIdx}>
                  {week.map((date, dayIdx) => {
                    const dateKey = date?.toISOString().split('T')[0];
                    const dayData = dateKey ? dailyPnLMap.get(dateKey) : undefined;
                    const isToday = date?.toDateString() === today.toDateString();

                    return (
                      <CalendarDay
                        key={dayIdx}
                        date={date}
                        dayData={dayData}
                        isToday={isToday}
                        formatCurrency={formatCurrency}
                        onClick={
                          dayData
                            ? () => date && handleDayClick(date, dayData)
                            : undefined
                        }
                      />
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <DayDetailsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          date={selectedDate}
          eventIds={selectedEventIds}
          initialPnl={selectedDayPnl}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button onClick={() => setSelectedYear(y => y - 1)} variant="outlined">
          ← {selectedYear - 1}
        </Button>
        <Typography variant="h5">{selectedYear} Overview</Typography>
        <Button onClick={() => setSelectedYear(y => y + 1)} variant="outlined">
          {selectedYear + 1} →
        </Button>
      </Box>

      {calendarData?.summary && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
          <Grid container spacing={3}>
            <Grid item xs={3}>
              <Typography variant="body2" color="text.secondary">Total P&L</Typography>
              <Typography
                variant="h5"
                color={calendarData.summary.total_pnl >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(calendarData.summary.total_pnl)}
              </Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2" color="text.secondary">Trading Days</Typography>
              <Typography variant="h5">{calendarData.summary.trading_days}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2" color="text.secondary">Win Rate</Typography>
              <Typography variant="h5" color="success.main">
                {calendarData.summary.win_rate.toFixed(1)}%
              </Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="body2" color="text.secondary">Avg Day</Typography>
              <Typography variant="h5">
                {calendarData.summary.trading_days > 0
                  ? formatCurrency(calendarData.summary.total_pnl / calendarData.summary.trading_days)
                  : '$0.00'}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      <Grid container spacing={3}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthIdx => {
          const monthDate = new Date(selectedYear, monthIdx, 1);
          const monthName = monthDate.toLocaleDateString('en-US', { month: 'long' });
          const daysInMonth = new Date(selectedYear, monthIdx + 1, 0).getDate();
          const startDay = monthDate.getDay();

          const monthPnL = calendarData?.daily_pnl
            .filter(d => new Date(d.date).getMonth() === monthIdx)
            .reduce((sum, d) => sum + d.net_pnl, 0) || 0;

          return (
            <Grid item xs={12} sm={6} md={4} key={monthIdx}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" align="center" gutterBottom>
                  {monthName} {selectedYear}
                  <Typography
                    component="span"
                    sx={{
                      ml: 1,
                      fontWeight: 'bold',
                      color: monthPnL >= 0 ? 'success.main' : 'error.main'
                    }}
                  >
                    {formatCurrency(monthPnL)}
                  </Typography>
                </Typography>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <TableCell key={i} align="center" sx={{ p: 0.5, fontSize: '0.7rem' }}>
                          {d}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Array(Math.ceil((daysInMonth + startDay) / 7))
                      .fill(null)
                      .map((_, weekIdx) => {
                        const weekStart = weekIdx * 7;
                        return (
                          <TableRow key={weekIdx}>
                            {Array(7)
                              .fill(null)
                              .map((_, dayIdx) => {
                                const dayNum = weekStart + dayIdx - startDay + 1;
                                if (dayNum < 1 || dayNum > daysInMonth) {
                                  return <TableCell key={dayIdx} sx={{ p: 0.5 }} />;
                                }

                                const date = new Date(selectedYear, monthIdx, dayNum);
                                const dateKey = date.toISOString().split('T')[0];
                                const dayData = dailyPnLMap.get(dateKey);
                                const pnl = dayData?.net_pnl || 0;
                                const intensity = pnl === 0 ? 0 : Math.min(Math.abs(pnl) / 800, 1);

                                return (
                                  <TableCell
                                    key={dayIdx}
                                    align="center"
                                    sx={{
                                      p: 0.5,
                                      bgcolor: pnl > 0
                                        ? `rgba(46, 125, 50, ${0.2 + intensity * 0.6})`
                                        : pnl < 0
                                        ? `rgba(211, 47, 47, ${0.2 + intensity * 0.6})`
                                        : undefined,
                                      fontSize: '0.8rem',
                                      cursor: dayData ? 'pointer' : 'default',
                                      '&:hover': dayData
                                        ? { bgcolor: pnl > 0 ? 'success.light' : 'error.light' }
                                        : {}
                                    }}
                                    onClick={
                                      dayData
                                        ? () => handleDayClick(date, dayData)
                                        : undefined
                                    }
                                  >
                                    {dayNum}
                                    {pnl !== 0 && (
                                      <Box
                                        sx={{
                                          fontSize: '0.65rem',
                                          fontWeight: 'bold',
                                          color: pnl >= 0 ? 'success.main' : 'error.main'
                                        }}
                                      >
                                        {pnl > 0 ? '+' : ''}
                                        {formatCurrency(pnl)}
                                      </Box>
                                    )}
                                  </TableCell>
                                );
                              })}
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <DayDetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        date={selectedDate}
        eventIds={selectedEventIds}
        initialPnl={selectedDayPnl}
      />
    </Box>
  );
};

export default PnLCalendar;