/**
 * Options Symbol Parser Utility
 * Parses options symbols in the format: TICKER + YYMMDD + C/P + STRIKE_PRICE
 * Example: INTC250926C00030000 = INTC, Sep 26 2025, Call, $30 strike
 */

export interface OptionsInfo {
  ticker: string;
  expirationDate: Date;
  optionType: 'call' | 'put';
  strikePrice: number;
  isOptions: boolean;
}

export interface OptionsParseResult {
  isOptions: boolean;
  ticker: string;
  optionsInfo?: OptionsInfo;
}

/**
 * Checks if a symbol is an options symbol
 * Options symbols typically have a format like: TICKER + YYMMDD + C/P + STRIKE
 */
export function isOptionsSymbol(symbol: string): boolean {
  // Options symbols are typically longer and contain C or P followed by numbers
  // Example: INTC250926C00030000 (21 chars), SPY250724P00634000 (18 chars)
  if (symbol.length < 15) return false;
  
  // Look for pattern: letters + 6 digits (date) + C/P + 8 digits (strike)
  const optionsPattern = /^[A-Z]+\d{6}[CP]\d{8}$/;
  return optionsPattern.test(symbol);
}

/**
 * Parses an options symbol into its components
 * Format: TICKER + YYMMDD + C/P + STRIKE_PRICE (8 digits)
 * Example: INTC250926C00030000
 */
export function parseOptionsSymbol(symbol: string): OptionsParseResult {
  if (!isOptionsSymbol(symbol)) {
    return {
      isOptions: false,
      ticker: symbol
    };
  }

  try {
    // Find where the date starts (6 digits followed by C/P)
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    
    if (!match) {
      return {
        isOptions: false,
        ticker: symbol
      };
    }

    const [, ticker, dateStr, optionTypeChar, strikePriceStr] = match;
    
    // Parse date (YYMMDD format)
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(4, 6));
    const expirationDate = new Date(year, month, day);
    
    // Parse option type
    const optionType: 'call' | 'put' = optionTypeChar === 'C' ? 'call' : 'put';
    
    // Parse strike price (8 digits representing dollars and cents)
    // Example: 00030000 = $30.00, 00300000 = $300.00
    const strikePrice = parseInt(strikePriceStr) / 1000;
    
    const optionsInfo: OptionsInfo = {
      ticker,
      expirationDate,
      optionType,
      strikePrice,
      isOptions: true
    };

    return {
      isOptions: true,
      ticker,
      optionsInfo
    };
  } catch (error) {
    console.error('Error parsing options symbol:', symbol, error);
    return {
      isOptions: false,
      ticker: symbol
    };
  }
}

/**
 * Formats options info for display
 */
export function formatOptionsDisplay(optionsInfo: OptionsInfo): string {
  const expirationStr = optionsInfo.expirationDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit'
  });
  
  const typeStr = optionsInfo.optionType === 'call' ? 'C' : 'P';
  const strikeStr = `$${optionsInfo.strikePrice}`;
  
  return `${optionsInfo.ticker} ${expirationStr} ${strikeStr}${typeStr}`;
}

/**
 * Converts options contract price to actual dollar value
 * Options contracts are quoted per share but represent 100 shares
 * Example: $0.07 per contract = $7.00 actual value
 */
export function convertOptionsPrice(contractPrice: number): number {
  return contractPrice * 100;
}

/**
 * Converts actual dollar value back to options contract price
 * Example: $7.00 actual value = $0.07 per contract
 */
export function convertToContractPrice(actualPrice: number): number {
  return actualPrice / 100;
}