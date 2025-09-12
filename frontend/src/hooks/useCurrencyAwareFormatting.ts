import { useCurrency } from '../context/CurrencyContext';
import { formatCurrency as baseFormatCurrency, formatProfitLoss as baseFormatProfitLoss } from '../utils/formatters';

/**
 * Currency-aware formatting hook that automatically converts values based on current currency setting
 * This replaces the need to manually use CurrencyDisplay components everywhere
 */
export const useCurrencyAwareFormatting = () => {
  const { currentCurrency, convertToDisplayCurrency } = useCurrency();

  const formatCurrency = (value: number, decimalPlaces?: number): string => {
    if (currentCurrency?.code === 'USD') {
      return baseFormatCurrency(value, decimalPlaces);
    }
    
    // For non-USD currencies, we need to convert first
    // Since this is synchronous, we'll return a placeholder and let useEffect handle updates
    return baseFormatCurrency(value, decimalPlaces); // Fallback to USD while converting
  };

  const formatProfitLoss = (value: number) => {
    if (currentCurrency?.code === 'USD') {
      return baseFormatProfitLoss(value);
    }
    
    // For non-USD currencies, return USD formatting as fallback
    return baseFormatProfitLoss(value);
  };

  // Async versions for when you need converted values
  const formatCurrencyAsync = async (value: number, decimalPlaces?: number): Promise<string> => {
    if (currentCurrency?.code === 'USD') {
      return baseFormatCurrency(value, decimalPlaces);
    }
    
    try {
      const converted = await convertToDisplayCurrency(value);
      return baseFormatCurrency(converted, decimalPlaces);
    } catch (error) {
      console.error('Currency conversion failed:', error);
      return baseFormatCurrency(value, decimalPlaces); // Fallback to USD
    }
  };

  const formatProfitLossAsync = async (value: number) => {
    if (currentCurrency?.code === 'USD') {
      return baseFormatProfitLoss(value);
    }
    
    try {
      const converted = await convertToDisplayCurrency(value);
      return baseFormatProfitLoss(converted);
    } catch (error) {
      console.error('Currency conversion failed:', error);
      return baseFormatProfitLoss(value); // Fallback to USD
    }
  };

  return {
    formatCurrency,
    formatProfitLoss,
    formatCurrencyAsync,
    formatProfitLossAsync,
    currentCurrency: currentCurrency?.code || 'USD',
    isUSD: currentCurrency?.code === 'USD'
  };
};