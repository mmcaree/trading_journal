// Utility functions for formatting currency and numbers consistently
import { formatCurrencyWithLocale } from './currency';

export const formatCurrency = (
  value: number | null | undefined, 
  decimalPlaces: number = 2, 
  currencyCode: string = 'USD'
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return formatCurrencyWithLocale(0, currencyCode, decimalPlaces);
  }
  
  return formatCurrencyWithLocale(value, currencyCode, decimalPlaces);
};

export const formatPercentage = (value: number | null | undefined, decimalPlaces: number = 1): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.0%';
  }
  
  // Round to specified decimal places
  const rounded = Math.round(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  
  return `${rounded.toFixed(decimalPlaces)}%`;
};

export const formatNumber = (value: number | null | undefined, decimalPlaces: number = 0): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  
  // Round to specified decimal places
  const rounded = Math.round(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
};

// Clean up invalid numbers (infinity, NaN, etc.)
export const safeNumber = (value: any, defaultValue: number = 0): number => {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }
  return num;
};

// Format P&L with proper sign and color indication
export const formatProfitLoss = (
  value: number | null | undefined, 
  currencyCode: string = 'USD'
): {
  formatted: string;
  isProfit: boolean;
  isZero: boolean;
} => {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      formatted: formatCurrency(0, 2, currencyCode),
      isProfit: false,
      isZero: true
    };
  }
  
  const rounded = Math.round(value * 100) / 100; // Round to 2 decimal places
  const isProfit = rounded > 0;
  const isZero = rounded === 0;
  
  const sign = isProfit ? '+' : '';
  const formatted = `${sign}${formatCurrency(rounded, 2, currencyCode)}`;
  
  return {
    formatted,
    isProfit,
    isZero
  };
};