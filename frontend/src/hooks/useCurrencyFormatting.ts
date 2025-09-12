import { useCurrency } from '../context/CurrencyContext';
import { formatPercentage, formatNumber, safeNumber } from '../utils/formatters';

// Hook that provides currency-aware formatting functions
export const useCurrencyFormatting = () => {
  const { 
    displayCurrency, 
    formatCurrency: formatCurrencyContext,
    convertToDisplayCurrency,
    isConverting 
  } = useCurrency();

  const formatCurrency = (value: number | null | undefined, decimalPlaces: number = 2): string => {
    return formatCurrencyContext(safeNumber(value), decimalPlaces);
  };

  const formatProfitLoss = (value: number | null | undefined): {
    formatted: string;
    isProfit: boolean;
    isZero: boolean;
  } => {
    if (value === null || value === undefined || isNaN(value)) {
      return {
        formatted: formatCurrency(0),
        isProfit: false,
        isZero: true
      };
    }
    
    const rounded = Math.round(value * 100) / 100; // Round to 2 decimal places
    const isProfit = rounded > 0;
    const isZero = rounded === 0;
    
    const sign = isProfit ? '+' : '';
    const formatted = `${sign}${formatCurrency(rounded)}`;
    
    return {
      formatted,
      isProfit,
      isZero
    };
  };

  // Format currency with conversion from USD
  const formatCurrencyFromUSD = async (
    usdValue: number | null | undefined, 
    decimalPlaces: number = 2
  ): Promise<string> => {
    if (usdValue === null || usdValue === undefined || isNaN(usdValue)) {
      return formatCurrency(0, decimalPlaces);
    }

    try {
      const converted = await convertToDisplayCurrency(usdValue, 'USD');
      return formatCurrency(converted, decimalPlaces);
    } catch (error) {
      console.error('Currency conversion failed:', error);
      return formatCurrency(usdValue, decimalPlaces); // Fallback to original value
    }
  };

  // Format P&L with conversion from USD
  const formatProfitLossFromUSD = async (usdValue: number | null | undefined): Promise<{
    formatted: string;
    isProfit: boolean;
    isZero: boolean;
  }> => {
    if (usdValue === null || usdValue === undefined || isNaN(usdValue)) {
      return {
        formatted: formatCurrency(0),
        isProfit: false,
        isZero: true
      };
    }

    try {
      const converted = await convertToDisplayCurrency(usdValue, 'USD');
      return formatProfitLoss(converted);
    } catch (error) {
      console.error('Currency conversion failed:', error);
      return formatProfitLoss(usdValue); // Fallback to original value
    }
  };

  return {
    formatCurrency,
    formatProfitLoss,
    formatCurrencyFromUSD,
    formatProfitLossFromUSD,
    formatPercentage,
    formatNumber,
    displayCurrency,
    isConverting,
    safeNumber
  };
};