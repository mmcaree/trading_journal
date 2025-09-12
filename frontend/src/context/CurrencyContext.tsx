import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  Currency, 
  SUPPORTED_CURRENCIES, 
  getCurrencyByCode, 
  getCurrencyByCountry, 
  convertCurrency,
  detectUserCurrency 
} from '../utils/currency';

interface CurrencyContextType {
  // Current display currency
  displayCurrency: string;
  
  // User's native currency (from their country)
  nativeCurrency: string;
  
  // Available currencies
  availableCurrencies: Currency[];
  
  // Current currency object
  currentCurrency: Currency | undefined;
  
  // Actions
  setDisplayCurrency: (currencyCode: string) => void;
  setNativeCurrency: (currencyCode: string) => void;
  toggleCurrency: () => void; // Toggle between native and USD
  
  // Conversion functions
  convertToDisplayCurrency: (amount: number, fromCurrency?: string) => Promise<number>;
  convertFromDisplayCurrency: (amount: number, toCurrency?: string) => Promise<number>;
  
  // Currency formatting
  formatCurrency: (amount: number, decimalPlaces?: number) => string;
  
  // Loading state for conversions
  isConverting: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

interface CurrencyProviderProps {
  children: ReactNode;
}

export const CurrencyProvider: React.FC<CurrencyProviderProps> = ({ children }) => {
  const [displayCurrency, setDisplayCurrencyState] = useState<string>('USD');
  const [nativeCurrency, setNativeCurrencyState] = useState<string>('USD');
  const [isConverting, setIsConverting] = useState<boolean>(false);

  // Initialize currencies from localStorage or detect from browser
  useEffect(() => {
    const savedDisplayCurrency = localStorage.getItem('tradejournal_display_currency');
    const savedNativeCurrency = localStorage.getItem('tradejournal_native_currency');
    
    if (savedDisplayCurrency) {
      setDisplayCurrencyState(savedDisplayCurrency);
    }
    
    if (savedNativeCurrency) {
      setNativeCurrencyState(savedNativeCurrency);
    } else {
      // Try to detect user's currency
      const detectedCurrency = detectUserCurrency();
      setNativeCurrencyState(detectedCurrency);
      localStorage.setItem('tradejournal_native_currency', detectedCurrency);
    }
  }, []);

  const setDisplayCurrency = (currencyCode: string) => {
    setDisplayCurrencyState(currencyCode);
    localStorage.setItem('tradejournal_display_currency', currencyCode);
  };

  const setNativeCurrency = (currencyCode: string) => {
    setNativeCurrencyState(currencyCode);
    localStorage.setItem('tradejournal_native_currency', currencyCode);
  };

  const toggleCurrency = () => {
    if (displayCurrency === 'USD') {
      setDisplayCurrency(nativeCurrency);
    } else {
      setDisplayCurrency('USD');
    }
  };

  const convertToDisplayCurrency = async (amount: number, fromCurrency: string = 'USD'): Promise<number> => {
    if (fromCurrency === displayCurrency) {
      return amount;
    }
    
    setIsConverting(true);
    try {
      const converted = await convertCurrency(amount, fromCurrency, displayCurrency);
      return converted;
    } finally {
      setIsConverting(false);
    }
  };

  const convertFromDisplayCurrency = async (amount: number, toCurrency: string = 'USD'): Promise<number> => {
    if (displayCurrency === toCurrency) {
      return amount;
    }
    
    setIsConverting(true);
    try {
      const converted = await convertCurrency(amount, displayCurrency, toCurrency);
      return converted;
    } finally {
      setIsConverting(false);
    }
  };

  const formatCurrency = (amount: number, decimalPlaces: number = 2): string => {
    const currency = getCurrencyByCode(displayCurrency);
    
    if (!currency) {
      return `${amount.toFixed(decimalPlaces)} ${displayCurrency}`;
    }
    
    // Round to specified decimal places
    const rounded = Math.round(amount * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
    
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: displayCurrency,
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }).format(rounded);
    } catch (error) {
      // Fallback formatting
      const formattedAmount = rounded.toLocaleString('en-US', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      });
      
      return `${currency.symbol}${formattedAmount}`;
    }
  };

  const currentCurrency = getCurrencyByCode(displayCurrency);

  const value: CurrencyContextType = {
    displayCurrency,
    nativeCurrency,
    availableCurrencies: SUPPORTED_CURRENCIES,
    currentCurrency,
    setDisplayCurrency,
    setNativeCurrency,
    toggleCurrency,
    convertToDisplayCurrency,
    convertFromDisplayCurrency,
    formatCurrency,
    isConverting,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};