// Advanced Analytics Utilities for Trading Journal
import { Position, PositionEvent } from '../services/positionsService';

// Extended position interface for analytics that includes optional events
interface PositionWithEvents extends Position {
  events?: PositionEvent[];
}

export interface RiskMetrics {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  recoveryFactor: number;
  calmarRatio: number;
  sortinoRatio: number;
  expectancy: number;
  kellyPercentage: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface TimeBasedMetrics {
  cumulativeReturns: Array<{ date: string; value: number; runningPnL: number }>;
  monthlyReturns: Array<{ month: string; year: number; return: number; trades: number }>;
  dailyReturns: number[];
  weeklyReturns: number[];
  holdingPeriodAnalysis: Array<{ days: number; return: number; winRate: number }>;
  dayOfWeekPerformance: Array<{ day: string; avgReturn: number; winRate: number; trades: number }>;
}

export interface PortfolioMetrics {
  avgPositionSize: number;
  avgPositionSizePercent: number;
  positionSizeDistribution: Array<{ range: string; count: number; avgReturn: number }>;
  portfolioConcentration: Array<{ ticker: string; totalCost: number; percentage: number }>;
  sectorBreakdown: Array<{ sector: string; count: number; totalPnL: number }>;
}

export interface EntryExitMetrics {
  entryTimeAnalysis: Array<{ hour: number; avgReturn: number; trades: number }>;
  exitTimeAnalysis: Array<{ hour: number; avgReturn: number; trades: number }>;
  stopLossHitRate: number;
  takeProfitHitRate: number;
  avgHoldingPeriod: number;
  earlyExits: number;
  lateExits: number;
}

export interface PsychologyMetrics {
  revengeTradingCount: number;
  overtradingScore: number;
  emotionalStateCorrelation: number;
  weekendEffectScore: number;
  streakAnalysis: Array<{ type: 'win' | 'loss'; length: number; startDate: string; endDate: string }>;
}

export interface AdvancedMetrics {
  alpha: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
  treynorRatio: number;
  jensenAlpha: number;
}

// Portfolio value timeline point interface
// This represents the portfolio value at a specific point in time
interface PortfolioValuePoint {
  date: Date;
  portfolioValue: number;  // Total portfolio value (account balance + realized + unrealized P&L)
  realizedPnL: number;     // Cumulative realized P&L up to this date
  unrealizedPnL: number;   // Estimated unrealized P&L at this date
  accountBalance: number;  // Account balance (initial + realized P&L)
}

// Calculate portfolio value timeline for proper drawdown analysis
// This creates a timeline of portfolio values at significant trading events (entries, exits, partial sells)
// instead of just calculating cumulative P&L at trade close dates. This gives a more accurate
// representation of when the portfolio actually experienced gains/losses for max drawdown calculation.
const calculatePortfolioTimeline = (positions: PositionWithEvents[], initialBalance: number): PortfolioValuePoint[] => {
  // Collect all significant dates (entries, exits, and events if available)
  const significantDates = new Set<string>();
  
  positions.forEach(pos => {
    if (pos.opened_at) {
      significantDates.add(pos.opened_at.split('T')[0]); // Add date part only
    }
    if (pos.closed_at) {
      significantDates.add(pos.closed_at.split('T')[0]);
    }
    
    // Add event dates if available (for positions with events)
    if (pos.events) {
      pos.events.forEach((event: PositionEvent) => {
        if (event.event_date) {
          significantDates.add(event.event_date.split('T')[0]);
        }
      });
    }
  });
  
  // Convert to sorted array of dates
  const sortedDates = Array.from(significantDates)
    .map(dateStr => new Date(dateStr))
    .sort((a, b) => a.getTime() - b.getTime());
  
  // Calculate portfolio value at each significant date
  const timeline: PortfolioValuePoint[] = [];
  
  sortedDates.forEach(currentDate => {
    let realizedPnL = 0;
    let unrealizedPnL = 0;
    
    positions.forEach(pos => {
      const posOpenDate = pos.opened_at ? new Date(pos.opened_at.split('T')[0]) : null;
      const posCloseDate = pos.closed_at ? new Date(pos.closed_at.split('T')[0]) : null;
      
      // Skip positions that haven't opened yet
      if (!posOpenDate || currentDate < posOpenDate) {
        return;
      }
      
      // Handle positions with events (partial sells)
      if (pos.events && pos.events.length > 0) {
        pos.events.forEach((event: PositionEvent) => {
          if (event.event_type === 'sell' && event.event_date) {
            const eventDate = new Date(event.event_date.split('T')[0]);
            if (eventDate <= currentDate) {
              realizedPnL += event.realized_pnl || 0;
            }
          }
        });
        
        // For open positions, estimate unrealized P&L
        if (pos.status === 'open') {
          // Get the latest event date to estimate current position
          const latestEventDate = pos.events
            .map((e: PositionEvent) => e.event_date ? new Date(e.event_date.split('T')[0]) : new Date(0))
            .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
          
          if (latestEventDate <= currentDate) {
            // Conservative approximation for unrealized P&L
            // Use a small percentage of the remaining position value as potential unrealized movement
            const remainingShares = pos.current_shares || 0;
            const avgEntryPrice = pos.avg_entry_price || 0;
            const remainingCost = remainingShares * avgEntryPrice;
            
            if (remainingShares > 0 && remainingCost > 0) {
              // Conservative assumption: open positions are roughly break-even on unrealized P&L
              // In a real implementation, you'd calculate: (current_price - avg_entry_price) * remaining_shares
              // For now, assume 0 unrealized P&L for open positions to avoid inflating drawdown calculations
              unrealizedPnL += 0; // Conservative approach - assume break-even
            }
          }
        }
      } else {
        // Handle positions without events (traditional closed/open positions)
        if (pos.status === 'closed' && posCloseDate && posCloseDate <= currentDate) {
          realizedPnL += pos.total_realized_pnl || 0;
        } else if (pos.status === 'open') {
          // Estimate unrealized P&L for open positions
          const daysSinceOpen = Math.floor((currentDate.getTime() - posOpenDate.getTime()) / (1000 * 60 * 60 * 24));
          const currentShares = pos.current_shares || 0;
          const avgEntryPrice = pos.avg_entry_price || 0;
          const positionCost = currentShares * avgEntryPrice;
          
          if (positionCost > 0) {
            // Conservative assumption: open positions are roughly break-even on unrealized P&L
            // In reality, you'd calculate (current_price - avg_entry_price) * shares
            // For now, assume 0 unrealized P&L to avoid inflating drawdown calculations without real market data
            unrealizedPnL += 0; // Conservative approach - assume break-even
          }
        }
      }
    });
    
    const portfolioValue = initialBalance + realizedPnL + unrealizedPnL;
    
    timeline.push({
      date: currentDate,
      portfolioValue,
      realizedPnL,
      unrealizedPnL,
      accountBalance: initialBalance + realizedPnL
    });
  });
  
  return timeline;
};

// Calculate proper max drawdown from portfolio value timeline
const calculateMaxDrawdownFromTimeline = (timeline: PortfolioValuePoint[]): { maxDrawdown: number; maxDrawdownPercent: number } => {
  if (timeline.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0 };
  }
  
  let peak = timeline[0].portfolioValue;
  let maxDrawdown = 0;
  
  timeline.forEach(point => {
    // Update peak if we have a new high
    if (point.portfolioValue > peak) {
      peak = point.portfolioValue;
    }
    
    // Calculate current drawdown from peak
    const currentDrawdown = peak - point.portfolioValue;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  });
  
  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
  
  return { maxDrawdown, maxDrawdownPercent };
};

// Risk Management Calculations
export const calculateRiskMetrics = (positions: PositionWithEvents[], accountBalance: number = 10000): RiskMetrics => {
  const closedPositions = positions.filter(p => p.status === 'closed' && p.total_realized_pnl !== null);
  
  if (positions.length === 0) {
    return {
      maxDrawdown: 0, maxDrawdownPercent: 0, sharpeRatio: 0, profitFactor: 0,
      recoveryFactor: 0, calmarRatio: 0, sortinoRatio: 0, expectancy: 0,
      kellyPercentage: 0, winRate: 0, avgWin: 0, avgLoss: 0,
      largestWin: 0, largestLoss: 0, consecutiveWins: 0, consecutiveLosses: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0
    };
  }

  // Calculate proper max drawdown using portfolio value timeline
  const portfolioTimeline = calculatePortfolioTimeline(positions, accountBalance);
  const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdownFromTimeline(portfolioTimeline);

  // Continue with other metrics using closed positions for trade-based calculations
  if (closedPositions.length === 0) {
    return {
      maxDrawdown, maxDrawdownPercent,
      sharpeRatio: 0, profitFactor: 0, recoveryFactor: 0, calmarRatio: 0, sortinoRatio: 0, expectancy: 0,
      kellyPercentage: 0, winRate: 0, avgWin: 0, avgLoss: 0,
      largestWin: 0, largestLoss: 0, consecutiveWins: 0, consecutiveLosses: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0
    };
  }

  // Sort positions by closed date for sequential analysis
  const sortedPositions = closedPositions.sort((a, b) => 
    new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
  );

  const returns = sortedPositions.map(p => p.total_realized_pnl || 0);
  const winningTrades = returns.filter(r => r > 0);
  const losingTrades = returns.filter(r => r < 0);

  // Basic metrics
  const winRate = (winningTrades.length / returns.length) * 100;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((a, b) => a + b, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((a, b) => a + b, 0) / losingTrades.length) : 0;
  const largestWin = Math.max(...winningTrades, 0);
  const largestLoss = Math.abs(Math.min(...losingTrades, 0));

  // Calculate total return for other metrics
  const totalReturn = returns.reduce((sum, ret) => sum + ret, 0);

  // Profit Factor
  const grossProfit = winningTrades.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losingTrades.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // Recovery Factor
  const recoveryFactor = maxDrawdown > 0 ? totalReturn / maxDrawdown : totalReturn > 0 ? 999 : 0;

  // Expectancy
  const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;

  // Kelly Criterion
  const kellyPercentage = avgLoss > 0 ? ((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) / avgWin * 100 : 0;

  // Sharpe Ratio (assuming 3% risk-free rate annually, adjusted for trade frequency)
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const returnStdDev = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length);
  const riskFreeRate = accountBalance * 0.03 / 252; // Daily risk-free rate approximation
  const sharpeRatio = returnStdDev > 0 ? (avgReturn - riskFreeRate) / returnStdDev : 0;

  // Sortino Ratio (only downside deviation)
  const downsideReturns = returns.filter(r => r < avgReturn);
  const downsideStdDev = downsideReturns.length > 0 
    ? Math.sqrt(downsideReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / downsideReturns.length)
    : returnStdDev;
  const sortinoRatio = downsideStdDev > 0 ? (avgReturn - riskFreeRate) / downsideStdDev : 0;

  // Calmar Ratio (Annual return / Max Drawdown)
  const annualReturn = totalReturn * (252 / returns.length); // Approximate annualization
  const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : annualReturn > 0 ? 999 : 0;

  // Consecutive wins/losses analysis
  let currentStreak = 0;
  let currentStreakType: 'win' | 'loss' | null = null;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;

  returns.forEach((ret, index) => {
    const isWin = ret > 0;
    
    if (currentStreakType === null) {
      currentStreakType = isWin ? 'win' : 'loss';
      currentStreak = 1;
    } else if ((isWin && currentStreakType === 'win') || (!isWin && currentStreakType === 'loss')) {
      currentStreak++;
    } else {
      // Streak ended
      if (currentStreakType === 'win') {
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentStreak);
      } else {
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
      }
      
      currentStreakType = isWin ? 'win' : 'loss';
      currentStreak = 1;
    }
    
    // Handle last trade
    if (index === returns.length - 1) {
      if (currentStreakType === 'win') {
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentStreak);
        consecutiveWins = currentStreak;
      } else {
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
        consecutiveLosses = currentStreak;
      }
    }
  });

  return {
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    profitFactor,
    recoveryFactor,
    calmarRatio,
    sortinoRatio,
    expectancy,
    kellyPercentage,
    winRate,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    consecutiveWins,
    consecutiveLosses,
    maxConsecutiveWins,
    maxConsecutiveLosses
  };
};

// Time-Based Analysis
export const calculateTimeBasedMetrics = (positions: PositionWithEvents[]): TimeBasedMetrics => {
  const closedPositions = positions.filter(p => p.status === 'closed' && p.closed_at && p.total_realized_pnl !== null);
  
  // Sort by closed date
  const sortedPositions = closedPositions.sort((a, b) => 
    new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
  );

  // Cumulative Returns
  let runningPnL = 0;
  const cumulativeReturns = sortedPositions.map(pos => {
    runningPnL += pos.total_realized_pnl || 0;
    return {
      date: pos.closed_at!,
      value: pos.total_realized_pnl || 0,
      runningPnL
    };
  });

  // Monthly Returns
  const monthlyMap = new Map<string, { return: number; trades: number }>();
  sortedPositions.forEach(pos => {
    const date = new Date(pos.closed_at!);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { return: 0, trades: 0 });
    }
    
    const monthData = monthlyMap.get(key)!;
    monthData.return += pos.total_realized_pnl || 0;
    monthData.trades += 1;
  });

  const monthlyReturns = Array.from(monthlyMap.entries()).map(([key, data]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      month: new Date(year, month).toLocaleDateString('en-US', { month: 'short' }),
      year,
      return: data.return,
      trades: data.trades
    };
  });

  // Daily/Weekly Returns (simplified for now)
  const dailyReturns = sortedPositions.map(p => p.total_realized_pnl || 0);
  const weeklyReturns: number[] = []; // Will implement weekly grouping if needed

  // Holding Period Analysis
  const holdingPeriods = sortedPositions.map(pos => {
    if (!pos.opened_at || !pos.closed_at) return { days: 0, return: 0 };
    
    const openDate = new Date(pos.opened_at);
    const closeDate = new Date(pos.closed_at);
    const days = Math.ceil((closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      days,
      return: pos.total_realized_pnl || 0
    };
  });

  // Group by holding period ranges
  const holdingPeriodRanges = [
    { range: '1 day', min: 0, max: 1 },
    { range: '2-3 days', min: 2, max: 3 },
    { range: '4-7 days', min: 4, max: 7 },
    { range: '1-2 weeks', min: 8, max: 14 },
    { range: '2-4 weeks', min: 15, max: 28 },
    { range: '1-3 months', min: 29, max: 90 },
    { range: '3+ months', min: 91, max: 9999 }
  ];

  const holdingPeriodAnalysis = holdingPeriodRanges.map(range => {
    const tradesInRange = holdingPeriods.filter(hp => hp.days >= range.min && hp.days <= range.max);
    const avgReturn = tradesInRange.length > 0 
      ? tradesInRange.reduce((sum, hp) => sum + hp.return, 0) / tradesInRange.length 
      : 0;
    const winRate = tradesInRange.length > 0 
      ? (tradesInRange.filter(hp => hp.return > 0).length / tradesInRange.length) * 100 
      : 0;
    
    return {
      days: range.min,
      return: avgReturn,
      winRate
    };
  });

  // Day of Week Performance
  const dayOfWeekMap = new Map<string, { returns: number[]; trades: number }>();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  sortedPositions.forEach(pos => {
    const date = new Date(pos.closed_at!);
    const dayName = dayNames[date.getDay()];
    
    if (!dayOfWeekMap.has(dayName)) {
      dayOfWeekMap.set(dayName, { returns: [], trades: 0 });
    }
    
    const dayData = dayOfWeekMap.get(dayName)!;
    dayData.returns.push(pos.total_realized_pnl || 0);
    dayData.trades += 1;
  });

  const dayOfWeekPerformance = dayNames.map(day => {
    const dayData = dayOfWeekMap.get(day);
    if (!dayData || dayData.returns.length === 0) {
      return { day, avgReturn: 0, winRate: 0, trades: 0 };
    }
    
    const avgReturn = dayData.returns.reduce((a, b) => a + b, 0) / dayData.returns.length;
    const winRate = (dayData.returns.filter(r => r > 0).length / dayData.returns.length) * 100;
    
    return {
      day,
      avgReturn,
      winRate,
      trades: dayData.trades
    };
  });

  return {
    cumulativeReturns,
    monthlyReturns,
    dailyReturns,
    weeklyReturns,
    holdingPeriodAnalysis,
    dayOfWeekPerformance
  };
};

// Portfolio Analysis
export const calculatePortfolioMetrics = (positions: PositionWithEvents[], accountBalance: number = 10000): PortfolioMetrics => {
  const allPositions = positions.filter(p => p.total_cost && p.total_cost > 0);
  
  // Average Position Size
  const totalCost = allPositions.reduce((sum, p) => sum + (p.total_cost || 0), 0);
  const avgPositionSize = allPositions.length > 0 ? totalCost / allPositions.length : 0;
  const avgPositionSizePercent = accountBalance > 0 ? (avgPositionSize / accountBalance) * 100 : 0;

  // Position Size Distribution
  const sizeRanges = [
    { range: 'Small (<2%)', min: 0, max: 0.02 },
    { range: 'Medium (2-5%)', min: 0.02, max: 0.05 },
    { range: 'Large (5-10%)', min: 0.05, max: 0.10 },
    { range: 'Very Large (>10%)', min: 0.10, max: 1.0 }
  ];

  const positionSizeDistribution = sizeRanges.map(range => {
    const positionsInRange = allPositions.filter(p => {
      const sizePercent = (p.total_cost || 0) / accountBalance;
      return sizePercent >= range.min && sizePercent < range.max;
    });
    
    const avgReturn = positionsInRange.length > 0 && positionsInRange.filter(p => p.status === 'closed').length > 0
      ? positionsInRange
          .filter(p => p.status === 'closed')
          .reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0) / 
        positionsInRange.filter(p => p.status === 'closed').length
      : 0;
    
    return {
      range: range.range,
      count: positionsInRange.length,
      avgReturn
    };
  });

  // Portfolio Concentration (Top positions)
  const portfolioConcentration = allPositions
    .map(p => ({
      ticker: p.ticker,
      totalCost: p.total_cost || 0,
      percentage: accountBalance > 0 ? ((p.total_cost || 0) / totalCost) * 100 : 0
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10); // Top 10 positions

  // Sector Breakdown (placeholder - would need sector data)
  const sectorBreakdown = [
    { sector: 'Technology', count: 0, totalPnL: 0 },
    { sector: 'Healthcare', count: 0, totalPnL: 0 },
    { sector: 'Finance', count: 0, totalPnL: 0 },
    { sector: 'Consumer', count: 0, totalPnL: 0 },
    { sector: 'Other', count: allPositions.length, totalPnL: allPositions.filter(p => p.status === 'closed').reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0) }
  ];

  return {
    avgPositionSize,
    avgPositionSizePercent,
    positionSizeDistribution,
    portfolioConcentration,
    sectorBreakdown
  };
};

// Entry/Exit Analysis
export const calculateEntryExitMetrics = (positions: PositionWithEvents[]): EntryExitMetrics => {
  const closedPositions = positions.filter(p => p.status === 'closed' && p.opened_at && p.closed_at);
  
  // Entry Time Analysis (by hour of day)
  const entryHourMap = new Map<number, { returns: number[]; trades: number }>();
  const exitHourMap = new Map<number, { returns: number[]; trades: number }>();
  
  closedPositions.forEach(pos => {
    const entryDate = new Date(pos.opened_at!);
    const exitDate = new Date(pos.closed_at!);
    const entryHour = entryDate.getHours();
    const exitHour = exitDate.getHours();
    const return_ = pos.total_realized_pnl || 0;
    
    // Entry hour analysis
    if (!entryHourMap.has(entryHour)) {
      entryHourMap.set(entryHour, { returns: [], trades: 0 });
    }
    const entryData = entryHourMap.get(entryHour)!;
    entryData.returns.push(return_);
    entryData.trades += 1;
    
    // Exit hour analysis
    if (!exitHourMap.has(exitHour)) {
      exitHourMap.set(exitHour, { returns: [], trades: 0 });
    }
    const exitData = exitHourMap.get(exitHour)!;
    exitData.returns.push(return_);
    exitData.trades += 1;
  });
  
  const entryTimeAnalysis = Array.from({ length: 24 }, (_, hour) => {
    const data = entryHourMap.get(hour);
    return {
      hour,
      avgReturn: data ? data.returns.reduce((a, b) => a + b, 0) / data.returns.length : 0,
      trades: data ? data.trades : 0
    };
  });
  
  const exitTimeAnalysis = Array.from({ length: 24 }, (_, hour) => {
    const data = exitHourMap.get(hour);
    return {
      hour,
      avgReturn: data ? data.returns.reduce((a, b) => a + b, 0) / data.returns.length : 0,
      trades: data ? data.trades : 0
    };
  });

  // Stop Loss / Take Profit Analysis (would need additional data from position model)
  const stopLossHitRate = 0; // Placeholder
  const takeProfitHitRate = 0; // Placeholder
  
  // Average Holding Period
  const holdingPeriods = closedPositions.map(pos => {
    const openDate = new Date(pos.opened_at!);
    const closeDate = new Date(pos.closed_at!);
    return (closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24);
  });
  
  const avgHoldingPeriod = holdingPeriods.length > 0 
    ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length 
    : 0;
  
  // Early/Late Exits (placeholder logic)
  const earlyExits = Math.floor(closedPositions.length * 0.3); // Estimate
  const lateExits = Math.floor(closedPositions.length * 0.2); // Estimate

  return {
    entryTimeAnalysis,
    exitTimeAnalysis,
    stopLossHitRate,
    takeProfitHitRate,
    avgHoldingPeriod,
    earlyExits,
    lateExits
  };
};

// Export all calculation functions
export const calculateAllMetrics = (positions: PositionWithEvents[], accountBalance: number = 10000) => {
  return {
    risk: calculateRiskMetrics(positions, accountBalance),
    timeBased: calculateTimeBasedMetrics(positions),
    portfolio: calculatePortfolioMetrics(positions, accountBalance),
    entryExit: calculateEntryExitMetrics(positions)
  };
};