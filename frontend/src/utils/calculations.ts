/**
 * Calculation utilities for common trading calculations.
 * Provides reusable calculation functions across the application.
 */

/**
 * Calculate profit/loss from buy and sell prices
 */
export const calculatePnL = (
  shares: number,
  entryPrice: number,
  exitPrice: number
): number => {
  return shares * (exitPrice - entryPrice);
};

/**
 * Calculate percentage return
 */
export const calculateReturn = (
  entryPrice: number,
  exitPrice: number
): number => {
  if (entryPrice === 0) return 0;
  return ((exitPrice - entryPrice) / entryPrice) * 100;
};

/**
 * Calculate position value
 */
export const calculatePositionValue = (
  shares: number,
  price: number
): number => {
  return shares * price;
};

/**
 * Calculate risk per share
 */
export const calculateRiskPerShare = (
  entryPrice: number,
  stopLoss: number
): number => {
  return Math.abs(entryPrice - stopLoss);
};

/**
 * Calculate total risk for a position
 */
export const calculateTotalRisk = (
  shares: number,
  entryPrice: number,
  stopLoss: number
): number => {
  const riskPerShare = calculateRiskPerShare(entryPrice, stopLoss);
  return shares * riskPerShare;
};

/**
 * Calculate risk percentage of account
 */
export const calculateRiskPercent = (
  shares: number,
  entryPrice: number,
  stopLoss: number,
  accountBalance: number
): number => {
  if (accountBalance === 0) return 0;
  const totalRisk = calculateTotalRisk(shares, entryPrice, stopLoss);
  return (totalRisk / accountBalance) * 100;
};

/**
 * Calculate potential reward
 */
export const calculateReward = (
  shares: number,
  entryPrice: number,
  takeProfit: number
): number => {
  return shares * Math.abs(takeProfit - entryPrice);
};

/**
 * Calculate risk/reward ratio
 */
export const calculateRiskRewardRatio = (
  entryPrice: number,
  stopLoss: number,
  takeProfit: number
): number => {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  
  if (risk === 0) return 0;
  return reward / risk;
};

/**
 * Calculate position size based on risk percentage
 */
export const calculatePositionSize = (
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number
): number => {
  const riskAmount = accountBalance * (riskPercent / 100);
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare === 0) return 0;
  return Math.floor(riskAmount / riskPerShare);
};

/**
 * Calculate average entry price
 */
export const calculateAveragePrice = (
  totalCost: number,
  totalShares: number
): number => {
  if (totalShares === 0) return 0;
  return totalCost / totalShares;
};

/**
 * Calculate win rate
 */
export const calculateWinRate = (
  wins: number,
  total: number
): number => {
  if (total === 0) return 0;
  return (wins / total) * 100;
};

/**
 * Calculate profit factor
 */
export const calculateProfitFactor = (
  totalProfit: number,
  totalLoss: number
): number => {
  if (totalLoss === 0) return totalProfit > 0 ? 999 : 0;
  return totalProfit / Math.abs(totalLoss);
};

/**
 * Calculate expectancy
 */
export const calculateExpectancy = (
  winRate: number,
  avgWin: number,
  avgLoss: number
): number => {
  return (winRate / 100) * avgWin - ((100 - winRate) / 100) * Math.abs(avgLoss);
};

/**
 * Calculate Kelly Criterion percentage
 */
export const calculateKellyCriterion = (
  winRate: number,
  avgWin: number,
  avgLoss: number
): number => {
  if (avgWin === 0) return 0;
  const p = winRate / 100;
  const q = 1 - p;
  const b = avgWin / Math.abs(avgLoss);
  
  return ((p * b - q) / b) * 100;
};

/**
 * Calculate Sharpe Ratio
 */
export const calculateSharpeRatio = (
  returns: number[],
  riskFreeRate: number = 0.03
): number => {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  return (avgReturn - riskFreeRate) / stdDev;
};

/**
 * Calculate maximum drawdown
 */
export const calculateMaxDrawdown = (
  portfolioValues: number[]
): { maxDrawdown: number; maxDrawdownPercent: number } => {
  if (portfolioValues.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0 };
  }
  
  let peak = portfolioValues[0];
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  
  for (const value of portfolioValues) {
    if (value > peak) {
      peak = value;
    }
    
    const drawdown = peak - value;
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
    
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }
  
  return { maxDrawdown, maxDrawdownPercent };
};

/**
 * Calculate Sortino Ratio (downside deviation)
 */
export const calculateSortinoRatio = (
  returns: number[],
  riskFreeRate: number = 0.03
): number => {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const negativeReturns = returns.filter(r => r < 0);
  
  if (negativeReturns.length === 0) return avgReturn > riskFreeRate ? 999 : 0;
  
  const downsideVariance = negativeReturns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  
  if (downsideDeviation === 0) return 0;
  return (avgReturn - riskFreeRate) / downsideDeviation;
};

/**
 * Calculate Calmar Ratio (return / max drawdown)
 */
export const calculateCalmarRatio = (
  annualReturn: number,
  maxDrawdown: number
): number => {
  if (maxDrawdown === 0) return annualReturn > 0 ? 999 : 0;
  return annualReturn / maxDrawdown;
};

/**
 * Calculate average holding period in days
 */
export const calculateAvgHoldingPeriod = (
  positions: Array<{ opened_at: Date; closed_at: Date | null }>
): number => {
  const closedPositions = positions.filter(p => p.closed_at !== null);
  
  if (closedPositions.length === 0) return 0;
  
  const totalDays = closedPositions.reduce((sum, pos) => {
    const openDate = new Date(pos.opened_at);
    const closeDate = new Date(pos.closed_at!);
    const days = (closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24);
    return sum + days;
  }, 0);
  
  return totalDays / closedPositions.length;
};

/**
 * Safe number helper - ensures valid number
 */
export const safeNumber = (value: any, defaultValue: number = 0): number => {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }
  return num;
};

/**
 * Round to decimal places
 */
export const roundTo = (value: number, decimals: number = 2): number => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
};

/**
 * Calculate percentage change
 */
export const calculatePercentageChange = (
  oldValue: number,
  newValue: number
): number => {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
};

/**
 * Calculate compound annual growth rate (CAGR)
 */
export const calculateCAGR = (
  beginningValue: number,
  endingValue: number,
  years: number
): number => {
  if (beginningValue === 0 || years === 0) return 0;
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
};

/**
 * Options-specific: Convert contract price to actual value
 */
export const convertOptionsPrice = (contractPrice: number): number => {
  return contractPrice * 100;
};

/**
 * Options-specific: Convert actual value to contract price
 */
export const convertToContractPrice = (actualPrice: number): number => {
  return actualPrice / 100;
};
