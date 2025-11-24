import React, { useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import { PriceDataPoint } from '../services/positionsService';
import { parseISO } from 'date-fns';

interface PositionPriceChartProps {
  ticker: string;
  priceData: PriceDataPoint[];
  entryDate?: string;
  exitDate?: string | null;
  loading?: boolean;
  error?: string;
}

// Calculate Simple Moving Average
const calculateSMA = (data: PriceDataPoint[], period: number) => {
  const smaData = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      continue; // Not enough data for SMA yet
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const sma = sum / period;
    smaData.push({
      time: Math.floor(parseISO(data[i].date).getTime() / 1000),
      value: sma,
    });
  }
  return smaData;
};

const PositionPriceChart: React.FC<PositionPriceChartProps> = ({
  ticker,
  priceData,
  entryDate,
  exitDate,
  loading = false,
  error,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !priceData || priceData.length === 0) {
      return;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6B7280',
      },
      grid: {
        vertLines: { color: '#e5e7eb69' },
        horzLines: { color: '#e5e7eb69' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#E5E7EB',
      },
      timeScale: {
        borderColor: '#E5E7EB',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Convert data to Lightweight Charts format
    const chartData = priceData.map((point) => ({
      time: Math.floor(parseISO(point.date).getTime() / 1000) as any,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    }));

    candlestickSeries.setData(chartData);

    // Calculate and add 10-day SMA (purple)
    const sma10Data = calculateSMA(priceData, 10);
    const sma10Series = chart.addLineSeries({
      color: '#9c27b0', // Purple
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    sma10Series.setData(sma10Data as any);

    // Calculate and add 20-day SMA (yellow)
    const sma20Data = calculateSMA(priceData, 20);
    const sma20Series = chart.addLineSeries({
      color: '#ffc107', // Yellow
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    sma20Series.setData(sma20Data as any);

    // Add entry marker with arrow
    if (entryDate) {
      const entryTime = Math.floor(parseISO(entryDate).getTime() / 1000);
      const entryDataPoint = chartData.find(d => d.time === entryTime);
      if (entryDataPoint) {
        // Add horizontal price line
        candlestickSeries.createPriceLine({
          price: entryDataPoint.open,
          color: '#4caf4f80',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Entry',
        });
        
        // Add marker with arrow
        candlestickSeries.setMarkers([
          ...candlestickSeries.markers?.() || [],
          {
            time: entryTime as any,
            position: 'belowBar',
            color: '#4caf4f',
            shape: 'arrowUp',
            text: 'Entry',
            size: 1,
          },
        ]);
      }
    }

    // Add exit marker with arrow
    if (exitDate) {
      const exitTime = Math.floor(parseISO(exitDate).getTime() / 1000);
      const exitDataPoint = chartData.find(d => d.time === exitTime);
      if (exitDataPoint) {
        // Add horizontal price line
        candlestickSeries.createPriceLine({
          price: exitDataPoint.close,
          color: '#f4433680',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Exit',
        });
        
        // Add marker with arrow
        const existingMarkers = candlestickSeries.markers?.() || [];
        candlestickSeries.setMarkers([
          ...existingMarkers,
          {
            time: exitTime as any,
            position: 'aboveBar',
            color: '#f44336',
            shape: 'arrowDown',
            text: 'Exit',
            size: 1,
          },
        ]);
      }
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [priceData, entryDate, exitDate]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={4}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              Loading chart data for {ticker}...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="warning">
            <Typography variant="body2">
              Unable to load chart data: {error}
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!priceData || priceData.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            <Typography variant="body2">
              No chart data available for {ticker}
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {ticker} - Price Chart
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          30 days before entry → Position held → 14 days after exit
        </Typography>

        <Box ref={chartContainerRef} sx={{ width: '100%', height: 500, mt: 2 }} />

        {/* Legend explanation */}
        <Box mt={2} display="flex" gap={3} justifyContent="center" flexWrap="wrap">
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 12,
                height: 12,
                backgroundColor: '#26a69a',
                border: '1px solid #26a69a',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Bullish (Close ≥ Open)
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 12,
                height: 12,
                backgroundColor: '#ef5350',
                border: '1px solid #ef5350',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Bearish (Close &lt; Open)
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 20,
                height: 3,
                backgroundColor: '#9c27b0',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              SMA 10
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 20,
                height: 3,
                backgroundColor: '#ffc107',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              SMA 20
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 20,
                height: 3,
                backgroundColor: '#4caf50',
                borderStyle: 'dashed',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Entry Date
            </Typography>
          </Box>
          {exitDate && (
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 20,
                  height: 3,
                  backgroundColor: '#f44336',
                  borderStyle: 'dashed',
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Exit Date
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default PositionPriceChart;
