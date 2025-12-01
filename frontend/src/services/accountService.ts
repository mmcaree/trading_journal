import { AccountSettings } from '../types/api';
import { calculateRiskPercent as calcRisk } from '../utils/calculations';
import { API_URL } from './apiConfig';

// Re-export for backward compatibility
export type { AccountSettings };

/**
 * Account Settings Service
 * Manages account balance and settings for position sizing calculations
 */

const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  starting_balance: 10000,
  current_balance: 10000,
  last_updated: new Date().toISOString()
};

export const accountService = {
  /**
   * Get current account settings from localStorage
   */
  getAccountSettings(): AccountSettings {
    try {
      const saved = localStorage.getItem('accountSettings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error loading account settings:', error);
    }
    return DEFAULT_ACCOUNT_SETTINGS;
  },

  /**
   * Update account settings in localStorage
   */
  updateAccountSettings(settings: AccountSettings): void {
    try {
      localStorage.setItem('accountSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving account settings:', error);
      throw new Error('Failed to save account settings');
    }
  },

  /**
   * Get current account balance
   */
  getCurrentBalance(): number {
    return this.getAccountSettings().current_balance;
  },

  /**
   * Update just the current balance
   */
  updateCurrentBalance(newBalance: number): void {
    const currentSettings = this.getAccountSettings();
    const updatedSettings: AccountSettings = {
      ...currentSettings,
      current_balance: newBalance,
      last_updated: new Date().toISOString()
    };
    this.updateAccountSettings(updatedSettings);
  },

  /**
   * Update starting balance
   */
  updateStartingBalance(newStartingBalance: number): void {
    const currentSettings = this.getAccountSettings();
    const updatedSettings: AccountSettings = {
      ...currentSettings,
      starting_balance: newStartingBalance,
      last_updated: new Date().toISOString()
    };
    this.updateAccountSettings(updatedSettings);
  },

  /**
   * Calculate position size based on risk percentage and account balance
   * @param accountRiskPercent - Percentage of account to risk (e.g., 1 for 1%)
   * @param entryPrice - Entry price per share
   * @param stopLoss - Stop loss price per share
   * @returns Object with position size and risk details
   */
  calculatePositionSize(accountRiskPercent: number, entryPrice: number, stopLoss: number) {
    const accountBalance = this.getCurrentBalance();
    const riskAmount = accountBalance * (accountRiskPercent / 100);
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    
    if (riskPerShare === 0) {
      return {
        shares: 0,
        positionValue: 0,
        riskAmount: 0,
        riskPerShare: 0,
        accountBalance
      };
    }
    
    const shares = Math.floor(riskAmount / riskPerShare);
    const positionValue = shares * entryPrice;
    
    return {
      shares,
      positionValue,
      riskAmount: shares * riskPerShare, // Actual risk based on whole shares
      riskPerShare,
      accountBalance,
      effectiveRiskPercent: (shares * riskPerShare) / accountBalance * 100
    };
  },

  /**
   * Calculate risk percentage for a given position
   * @param shares - Number of shares
   * @param entryPrice - Entry price per share  
   * @param stopLoss - Stop loss price per share
   * @returns Risk percentage of account
   */
  calculateRiskPercent(shares: number, entryPrice: number, stopLoss: number): number {
    const accountBalance = this.getCurrentBalance();
    return calcRisk(shares, entryPrice, stopLoss, accountBalance);
  },

  /**
   * Calculate original risk percentage based on total shares bought (before any sells)
   * @param totalSharesBought - Total shares originally purchased
   * @param entryPrice - Entry price per share  
   * @param stopLoss - Stop loss price per share
   * @returns Original risk percentage of account
   */
  calculateOriginalRiskPercent(totalSharesBought: number, entryPrice: number, stopLoss: number): number {
    const accountBalance = this.getCurrentBalance();
    return calcRisk(totalSharesBought, entryPrice, stopLoss, accountBalance);
  },

  /**
   * Get account growth statistics
   * Now accounts for deposits and withdrawals to show true trading performance
   */
  async getAccountGrowth() {
    const settings = this.getAccountSettings();
    
    try {
      // Try to fetch transaction summary to exclude deposits/withdrawals
      const token = localStorage.getItem('token');
      if (token) {
        const response = await fetch(`${API_URL}/api/account-transactions/summary/totals`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const summary = await response.json();
          const netCashFlow = summary.total_deposits - summary.total_withdrawals;
          
          // True trading growth = (Current - Starting - Net Deposits)
          const tradingGrowth = settings.current_balance - settings.starting_balance - netCashFlow;
          const tradingGrowthPercent = (tradingGrowth / settings.starting_balance) * 100;
          
          return {
            growth: tradingGrowth,
            growthPercent: tradingGrowthPercent,
            startingBalance: settings.starting_balance,
            currentBalance: settings.current_balance,
            totalDeposits: summary.total_deposits,
            totalWithdrawals: summary.total_withdrawals,
            netCashFlow: netCashFlow,
            // Raw growth including cash flows (for reference)
            rawGrowth: settings.current_balance - settings.starting_balance,
            rawGrowthPercent: ((settings.current_balance - settings.starting_balance) / settings.starting_balance) * 100
          };
        }
      }
    } catch (error) {
      console.error('Error fetching transaction summary:', error);
    }
    
    // Fallback to simple calculation if API fails or no token
    const growth = settings.current_balance - settings.starting_balance;
    const growthPercent = (growth / settings.starting_balance) * 100;
    
    return {
      growth,
      growthPercent,
      startingBalance: settings.starting_balance,
      currentBalance: settings.current_balance,
      totalDeposits: 0,
      totalWithdrawals: 0,
      netCashFlow: 0,
      rawGrowth: growth,
      rawGrowthPercent: growthPercent
    };
  },

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  }
};

export default accountService;