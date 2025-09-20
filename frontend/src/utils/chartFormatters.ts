import { formatCurrency, formatPercentage } from './formatters';

// Helper function to format date for tooltips
const formatDateForTooltip = (dateStr: string): string => {
  try {
    // Parse the date string more carefully to avoid timezone issues
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // For YYYY-MM-DD format, parse as local date to avoid timezone shifts
      const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
      const date = new Date(year, month - 1, day); // month is 0-indexed
      
      if (isNaN(date.getTime())) {
        return dateStr; // Return original if invalid
      }
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } else {
      // For other formats, use normal Date parsing
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr; // Return original if invalid
      }
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch {
    return dateStr;
  }
};

// Custom tooltip formatter for charts that display currency values
export const currencyTooltipFormatter = (value: any, name: string) => {
  if (typeof value === 'number') {
    return [formatCurrency(value), name];
  }
  return [value, name];
};

// Enhanced tooltip formatter with date - for time series charts
export const currencyTooltipFormatterWithDate = (value: any, name: string, props: any) => {
  const formattedValue = typeof value === 'number' ? formatCurrency(value) : value;
  
  // Extract date from the data point
  if (props && props.payload) {
    const dateKey = props.payload.date || props.payload.week || props.payload.month || props.payload.period;
    if (dateKey) {
      const formattedDate = formatDateForTooltip(dateKey);
      return [formattedValue, `${name} (${formattedDate})`];
    }
  }
  
  return [formattedValue, name];
};

// Custom tooltip formatter for charts that display percentage values
export const percentageTooltipFormatter = (value: any, name: string) => {
  if (typeof value === 'number') {
    return [formatPercentage(value), name];
  }
  return [value, name];
};

// Enhanced percentage tooltip formatter with date
export const percentageTooltipFormatterWithDate = (value: any, name: string, props: any) => {
  const formattedValue = typeof value === 'number' ? formatPercentage(value) : value;
  
  // Extract date from the data point
  if (props && props.payload) {
    const dateKey = props.payload.date || props.payload.week || props.payload.month || props.payload.period;
    if (dateKey) {
      const formattedDate = formatDateForTooltip(dateKey);
      return [formattedValue, `${name} (${formattedDate})`];
    }
  }
  
  return [formattedValue, name];
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