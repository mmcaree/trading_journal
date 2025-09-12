import { ApiTrade, Trade, PartialExit } from './types';

// Helper function to format dates consistently and safely
export const formatDateSafe = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'Invalid Date';
};

// Calculate total P&L for a trade including partial exits
export const calculateTotalPL = (trade: ApiTrade): number => {
  let total = trade.profit_loss || 0;
  if (trade.partial_exits) {
    total += trade.partial_exits.reduce((sum, exit) => sum + exit.profit_loss, 0);
  }
  return total;
};

// Transform API trade to frontend format
export const transformApiTrade = (trade: ApiTrade): Trade => ({
  ...trade,
  displayStatus: trade.status === 'active' ? 'Open' : 
                trade.status === 'closed' ? 'Closed' : 
                trade.status.charAt(0).toUpperCase() + trade.status.slice(1),
  displayDirection: trade.trade_type === 'long' ? 'Long' : 'Short',
  displayDate: trade.status === 'closed' && trade.exit_date
    ? formatDateSafe(trade.exit_date)
    : formatDateSafe(trade.entry_date),
  entry_notes: trade.entry_notes || undefined, // Don't force empty string
  market_conditions: trade.market_conditions || undefined, // Don't force value
  tags: trade.tags || [],
  partial_exits: trade.partial_exits || []
});
