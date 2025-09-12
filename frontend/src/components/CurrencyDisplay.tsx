import React, { useState, useEffect } from 'react';
import { Typography, TypographyProps } from '@mui/material';
import { useCurrency } from '../context/CurrencyContext';
import { formatCurrency, formatProfitLoss } from '../utils/formatters';

interface CurrencyDisplayProps extends Omit<TypographyProps, 'children'> {
  value: number;
  type?: 'currency' | 'profit-loss';
  prefix?: string;
}

const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ 
  value, 
  type = 'currency', 
  prefix = '',
  ...typographyProps 
}) => {
  const [displayValue, setDisplayValue] = useState<string>('');
  const { currentCurrency, convertToDisplayCurrency } = useCurrency();

  useEffect(() => {
    const formatValue = async () => {
      try {
        const currencySymbol = currentCurrency?.symbol || '$';
        
        if (currentCurrency?.code === 'USD') {
          // No conversion needed, but use correct symbol
          if (type === 'profit-loss') {
            const absValue = Math.abs(value);
            const formattedNumber = absValue.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
            const sign = value >= 0 ? '+' : '-';
            setDisplayValue(`${prefix}${sign}${currencySymbol}${formattedNumber}`);
          } else {
            const formattedNumber = value.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
            setDisplayValue(`${prefix}${currencySymbol}${formattedNumber}`);
          }
        } else {
          // Convert to display currency and use correct symbol
          const converted = await convertToDisplayCurrency(value);
          if (type === 'profit-loss') {
            const absValue = Math.abs(converted);
            const formattedNumber = absValue.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
            const sign = converted >= 0 ? '+' : '-';
            setDisplayValue(`${prefix}${sign}${currencySymbol}${formattedNumber}`);
          } else {
            const formattedNumber = converted.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
            setDisplayValue(`${prefix}${currencySymbol}${formattedNumber}`);
          }
        }
      } catch (error) {
        console.error('Error formatting currency:', error);
        // Fallback to USD formatting
        if (type === 'profit-loss') {
          const formatted = formatProfitLoss(value);
          setDisplayValue(`${prefix}${formatted.formatted}`);
        } else {
          setDisplayValue(`${prefix}${formatCurrency(value)}`);
        }
      }
    };

    formatValue();
  }, [value, currentCurrency, type, prefix, convertToDisplayCurrency]);

  return (
    <Typography {...typographyProps}>
      {displayValue || (type === 'profit-loss' ? formatProfitLoss(value).formatted : formatCurrency(value))}
    </Typography>
  );
};

export default CurrencyDisplay;