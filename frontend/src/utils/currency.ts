// Currency conversion utilities and exchange rate management

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  country: string;
}

export interface ExchangeRates {
  [currencyCode: string]: number;
}

// Major currencies supported
export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'United States' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'European Union' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', country: 'Canada' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', country: 'Australia' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', country: 'Japan' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', country: 'Switzerland' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', country: 'China' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', country: 'India' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', country: 'Brazil' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso', country: 'Mexico' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', country: 'South Korea' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', country: 'Singapore' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', country: 'Norway' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', country: 'Sweden' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', country: 'Denmark' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', country: 'Poland' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', country: 'Czech Republic' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', country: 'Hungary' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', country: 'New Zealand' },
];

// Country to currency mapping
export const COUNTRY_CURRENCY_MAP: { [country: string]: string } = {
  'United States': 'USD',
  'Canada': 'CAD',
  'United Kingdom': 'GBP',
  'European Union': 'EUR',
  'Germany': 'EUR',
  'France': 'EUR',
  'Italy': 'EUR',
  'Spain': 'EUR',
  'Netherlands': 'EUR',
  'Belgium': 'EUR',
  'Austria': 'EUR',
  'Australia': 'AUD',
  'Japan': 'JPY',
  'Switzerland': 'CHF',
  'China': 'CNY',
  'India': 'INR',
  'Brazil': 'BRL',
  'Mexico': 'MXN',
  'South Korea': 'KRW',
  'Singapore': 'SGD',
  'Norway': 'NOK',
  'Sweden': 'SEK',
  'Denmark': 'DKK',
  'Poland': 'PLN',
  'Czech Republic': 'CZK',
  'Hungary': 'HUF',
  'New Zealand': 'NZD',
};

// Cache for exchange rates
let exchangeRateCache: ExchangeRates | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Get currency by code
export const getCurrencyByCode = (code: string): Currency | undefined => {
  return SUPPORTED_CURRENCIES.find(currency => currency.code === code);
};

// Get currency by country
export const getCurrencyByCountry = (country: string): Currency | undefined => {
  const currencyCode = COUNTRY_CURRENCY_MAP[country];
  return currencyCode ? getCurrencyByCode(currencyCode) : undefined;
};

// Fetch current exchange rates (using a free API)
export const fetchExchangeRates = async (): Promise<ExchangeRates> => {
  try {
    // Check cache first
    const now = Date.now();
    if (exchangeRateCache && (now - cacheTimestamp < CACHE_DURATION)) {
      return exchangeRateCache;
    }

    // Try to fetch from a free API (exchangerate-api.com)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }
    
    const data = await response.json();
    
    // Update cache
    exchangeRateCache = data.rates;
    cacheTimestamp = now;
    
    return data.rates;
  } catch (error) {
    console.warn('Failed to fetch live exchange rates, using fallback rates:', error);
    
    // Fallback exchange rates (approximate values)
    const fallbackRates: ExchangeRates = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      CAD: 1.35,
      AUD: 1.50,
      JPY: 110.0,
      CHF: 0.92,
      CNY: 7.20,
      INR: 83.0,
      BRL: 5.20,
      MXN: 17.5,
      KRW: 1320.0,
      SGD: 1.35,
      NOK: 10.5,
      SEK: 10.8,
      DKK: 6.35,
      PLN: 4.15,
      CZK: 23.5,
      HUF: 355.0,
      NZD: 1.65,
    };
    
    exchangeRateCache = fallbackRates;
    cacheTimestamp = Date.now();
    
    return fallbackRates;
  }
};

// Convert amount from one currency to another
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  if (fromCurrency === toCurrency) {
    return amount;
  }
  
  try {
    const rates = await fetchExchangeRates();
    
    // Convert to USD first if not already USD
    let usdAmount = amount;
    if (fromCurrency !== 'USD') {
      usdAmount = amount / rates[fromCurrency];
    }
    
    // Convert from USD to target currency
    if (toCurrency === 'USD') {
      return usdAmount;
    }
    
    return usdAmount * rates[toCurrency];
  } catch (error) {
    console.error('Currency conversion failed:', error);
    return amount; // Return original amount if conversion fails
  }
};

// Format currency with proper symbol and locale
export const formatCurrencyWithLocale = (
  amount: number,
  currencyCode: string,
  decimalPlaces: number = 2
): string => {
  const currency = getCurrencyByCode(currencyCode);
  
  if (!currency) {
    return `${amount.toFixed(decimalPlaces)} ${currencyCode}`;
  }
  
  // Round to specified decimal places to avoid floating point precision issues
  const rounded = Math.round(amount * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  
  try {
    // Use Intl.NumberFormat for proper locale formatting
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(rounded);
  } catch (error) {
    // Fallback to manual formatting if Intl.NumberFormat fails
    const formattedAmount = rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
    
    return `${currency.symbol}${formattedAmount}`;
  }
};

// Get user's likely currency based on their timezone/locale
export const detectUserCurrency = (): string => {
  try {
    // Try to detect from browser locale
    const locale = navigator.language || 'en-US';
    
    const localeToCurrency: { [key: string]: string } = {
      'en-US': 'USD',
      'en-CA': 'CAD',
      'en-GB': 'GBP',
      'en-AU': 'AUD',
      'en-NZ': 'NZD',
      'fr-FR': 'EUR',
      'de-DE': 'EUR',
      'it-IT': 'EUR',
      'es-ES': 'EUR',
      'nl-NL': 'EUR',
      'ja-JP': 'JPY',
      'ko-KR': 'KRW',
      'zh-CN': 'CNY',
      'hi-IN': 'INR',
      'pt-BR': 'BRL',
      'es-MX': 'MXN',
    };
    
    return localeToCurrency[locale] || 'USD';
  } catch (error) {
    return 'USD'; // Default fallback
  }
};