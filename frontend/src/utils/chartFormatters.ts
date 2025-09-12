import { formatCurrency, formatPercentage } from './formatters';

// Custom tooltip formatter for charts that display currency values
export const currencyTooltipFormatter = (value: any, name: string) => {
  if (typeof value === 'number') {
    return [formatCurrency(value), name];
  }
  return [value, name];
};

// Custom tooltip formatter for charts that display percentage values
export const percentageTooltipFormatter = (value: any, name: string) => {
  if (typeof value === 'number') {
    return [formatPercentage(value), name];
  }
  return [value, name];
};

// Custom Y-axis tick formatter for currency
export const currencyTickFormatter = (value: any) => {
  if (typeof value === 'number') {
    // For larger values, use abbreviated format (e.g., $1.2k, $1.2M)
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return formatCurrency(value);
  }
  return value;
};

// Custom Y-axis tick formatter for percentage
export const percentageTickFormatter = (value: any) => {
  if (typeof value === 'number') {
    return `${value.toFixed(0)}%`;
  }
  return value;
};