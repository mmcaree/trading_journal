import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Chip,
  InputAdornment,
  Button,
  Alert,
  Tooltip
} from '@mui/material';
import {
  TrendingUp as BuyIcon,
  TrendingDown as SellIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Security as StopLossIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { Position, PositionEvent, fetchPendingOrders, PendingOrder, updatePendingOrder } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';
import api from '../services/apiConfig';

interface EventBreakdownProps {
  position: Position;
  events: PositionEvent[];
  onUpdateStopLoss?: (eventId: number, newStopLoss: number | null) => void;
  onEditEvent?: (eventId: PositionEvent) => void;
  disabled?: boolean;
  accountBalance?: number;
}

interface EditingState {
  [eventId: number]: {
    editing: boolean;
    value: string;
    error?: string;
  };
}

interface SubLotEditingState {
  [subLotKey: string]: {
    editing: boolean;
    value: string;
    error?: string;
  };
}

interface SubLot {
  buyEventId: number;
  buyPrice: number;
  buyDate: string;
  originalShares: number;
  remainingShares: number;
  stopLoss?: number;
  originalRisk: number;
  originalRiskPercent: number;
  currentRisk: number;
  currentRiskPercent: number;
}

const EventBreakdown: React.FC<EventBreakdownProps> = ({
  position,
  events,
  onUpdateStopLoss,
  onEditEvent,
  disabled = false,
  accountBalance
}) => {
  const { formatCurrency } = useCurrency();
  const [editingStops, setEditingStops] = useState<EditingState>({});
  const [editingSubLots, setEditingSubLots] = useState<SubLotEditingState>({});
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loadingPendingOrders, setLoadingPendingOrders] = useState(false);
  const [eventAccountValues, setEventAccountValues] = useState<Map<string, number>>(new Map());

  // Fetch account values for all event dates
  useEffect(() => {
    const fetchAccountValues = async () => {
      const dates = events.map(e => e.event_date);
      if (dates.length === 0) return;

      try {
        const response = await api.post('/api/users/me/account-values', {
          dates: dates
        });
        
        const valueMap = new Map<string, number>();
        response.data.forEach((item: { date: string; account_value: number }) => {
          valueMap.set(item.date, item.account_value);
        });
        setEventAccountValues(valueMap);
      } catch (error) {
        console.error('Failed to fetch account values:', error);
      }
    };

    if (events.length > 0) {
      fetchAccountValues();
    }
  }, [events]);

  // Fetch pending orders for imported positions
  useEffect(() => {
    const hasImportEvents = events.some(event => event.source === 'import');
    
    if (hasImportEvents) {
      console.log('🔍 Fetching pending orders for imported position:', position.id);
      setLoadingPendingOrders(true);
      fetchPendingOrders(position.id)
        .then(orders => {
          setPendingOrders(orders);
          console.log('✅ Fetched pending orders:', orders);
          console.log('🎯 Pending sell orders:', orders.filter(o => o.side.toLowerCase() === 'sell' && o.status.toLowerCase() === 'pending'));
        })
        .catch(error => {
          console.error('❌ Error fetching pending orders:', error);
          setPendingOrders([]);
        })
        .finally(() => {
          setLoadingPendingOrders(false);
        });
    }
  }, [position.id, events]);

  // Get the original stop loss from the first buy event for Original Risk calculations
  const getOriginalStopLoss = () => {
    // Find the first buy event chronologically
    const firstBuyEvent = events
      .filter(e => e.event_type === 'buy')
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0];
    
    if (!firstBuyEvent) return null;
    
    // Use the stop loss from the first buy event, or find it from pending orders if imported
    let originalStopLoss = firstBuyEvent.stop_loss;
    if (!originalStopLoss && firstBuyEvent.source === 'import' && pendingOrders.length > 0) {
      originalStopLoss = findStopLossForImportedEvent(firstBuyEvent);
    }
    
    return originalStopLoss;
  };

  // Calculate risk metrics for each event
  const calculateEventRisk = (event: PositionEvent, currentPrice?: number) => {
    const eventValue = Math.abs(event.shares || 0) * (event.price || 0);
    let stopLoss = event.stop_loss;
    let takeProfit = event.take_profit;

    // For imported positions, if the event doesn't have a stop loss, try to find it from pending orders
    if (!stopLoss && event.source === 'import' && pendingOrders.length > 0) {
      stopLoss = findStopLossForImportedEvent(event);
    }
    // Calculate original risk using THIS event's stop loss (not the first buy's stop loss)
    // Each buy event should show the risk taken at THAT specific entry
    const originalRisk = stopLoss && event.event_type === 'buy'
      ? Math.abs((event.price || 0) - stopLoss) * Math.abs(event.shares || 0)
      : 0;
    
    // Get account value at this specific event's date (dynamically calculated)
    const eventAccountValue = eventAccountValues.get(event.event_date) || accountBalance || 0;
    const originalRiskPercent = originalRisk > 0 && eventAccountValue > 0
      ? (originalRisk / eventAccountValue) * 100 
      : 0;

    // Calculate current risk (if we have current price)
    let currentRisk = 0;
    let currentRiskPercent = 0;
    if (currentPrice && stopLoss) {
      // For buy events, current risk is current price - stop loss
      // For sell events, risk was realized at sale
      if (event.event_type === 'buy') {
        currentRisk = Math.abs(currentPrice - stopLoss) * Math.abs(event.shares || 0);
        currentRiskPercent = currentRisk > 0 && accountBalance 
          ? (currentRisk / accountBalance) * 100 
          : 0;
        
        // If stop is above current price (for long), risk is 0% (in profit)
        if ((event.shares || 0) > 0 && stopLoss >= currentPrice) {
          currentRisk = 0;
          currentRiskPercent = 0;
        }
      }
    }

    const profitPotential = takeProfit 
      ? Math.abs(takeProfit - (event.price || 0)) * Math.abs(event.shares || 0)
      : 0;
    const riskRewardRatio = originalRisk > 0 && profitPotential > 0 
      ? profitPotential / originalRisk 
      : null;

    return {
      eventValue,
      originalRisk,
      originalRiskPercent,
      currentRisk,
      currentRiskPercent,
      profitPotential,
      riskRewardRatio,
      stopLoss, // Include the found stop loss
      stopIsInProfit: event.event_type === 'buy' && currentPrice && stopLoss ? 
        ((event.shares || 0) > 0 ? stopLoss >= (event.price || 0) : stopLoss <= (event.price || 0)) : false
    };
  };

  // Find stop loss for imported events by matching with pending orders based on timing
  const findStopLossForImportedEvent = (event: PositionEvent): number | undefined => {
    if (!pendingOrders.length) return undefined;

    // Look for sell orders that were placed around the same time as this buy event
    const eventDate = new Date(event.event_date);
    
    // Find sell orders placed within a reasonable time window after this buy event
    // (typically stop losses are placed shortly after or at the same time as the buy)
    const relevantOrders = pendingOrders.filter(order => {
      if (order.side.toLowerCase() !== 'sell') return false;
      
      const orderDate = new Date(order.placed_time);
      const timeDiffHours = (orderDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60);
      
      // Look for orders placed within 24 hours after the buy event
      // This accounts for same-day or next-day stop loss placement
      return timeDiffHours >= -1 && timeDiffHours <= 24;
    });

    if (!relevantOrders.length) return undefined;

    // Sort by how close the placement time is to the event time
    relevantOrders.sort((a, b) => {
      const aTime = Math.abs(new Date(a.placed_time).getTime() - eventDate.getTime());
      const bTime = Math.abs(new Date(b.placed_time).getTime() - eventDate.getTime());
      return aTime - bTime;
    });

    // Return the stop loss from the closest order
    const closestOrder = relevantOrders[0];
    return closestOrder.stop_loss || closestOrder.price;
  };

  // Calculate remaining sub-lots - handle mixed imported/manual positions
  const calculateSubLots = (): SubLot[] => {
    // Check if this is an imported position by looking for import source events
    const hasImportEvents = events.some(event => event.source === 'import');
    const hasManualEvents = events.some(event => event.source !== 'import');
    
    // Determine position type for appropriate calculation method
    
    if (hasImportEvents && hasManualEvents) {
      // Mixed position - use hybrid approach
      return calculateMixedSubLots();
    } else if (hasImportEvents) {
      return calculateImportedSubLots();
    } else {
      return calculateManualSubLots();
    }
  };

  // For mixed positions (imported + manual events), combine both approaches
  const calculateMixedSubLots = (): SubLot[] => {
    // Mixed position: process all events chronologically with FIFO logic
    
    // Use the manual FIFO logic to process all events chronologically
    // This gives us the most accurate picture regardless of import vs manual
    const allEvents = [...events].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
    
    const subLots: SubLot[] = [];
    
    // Process each event chronologically
    allEvents.forEach((event, index) => {

      if (event.event_type === 'buy') {
        let stopLoss = event.stop_loss;
        
        // For imported buy events without stop loss, try to find from pending orders
        if (!stopLoss && event.source === 'import' && pendingOrders.length > 0) {
          stopLoss = findStopLossForImportedEvent(event);
          // Found stop loss from pending orders for imported event
        }
        
        // Use original stop loss from first buy event for consistent Original Risk calculation
        const originalStopLoss = getOriginalStopLoss();
        const originalRisk = originalStopLoss 
          ? Math.abs(event.price - originalStopLoss) * Math.abs(event.shares)
          : 0;
        
        const snapshotAccountValue = position.account_value_at_entry || accountBalance || 0;
        const originalRiskPercent = originalRisk > 0 && snapshotAccountValue > 0
          ? (originalRisk / snapshotAccountValue) * 100 
          : 0;

        const newSubLot = {
          buyEventId: event.id,
          buyPrice: event.price,
          buyDate: event.event_date,
          originalShares: Math.abs(event.shares),
          remainingShares: Math.abs(event.shares),
          stopLoss: stopLoss,
          originalRisk,
          originalRiskPercent,
          currentRisk: 0,
          currentRiskPercent: 0
        };
        
        subLots.push(newSubLot);
        // Created new sub-lot for this buy event
      } else if (event.event_type === 'sell') {
        // Apply sell using FIFO (First In, First Out) - sell from earliest buys first
        let sharesToSell = Math.abs(event.shares);
        
        // Process sub-lots in chronological order (earliest purchases first)
        for (let i = 0; i < subLots.length && sharesToSell > 0; i++) {
          const subLot = subLots[i];
          if (subLot.remainingShares > 0) {
            const sharesFromThisLot = Math.min(sharesToSell, subLot.remainingShares);
            subLot.remainingShares -= sharesFromThisLot;
            sharesToSell -= sharesFromThisLot;
          }
        }
      }
    });

    // Calculate current risk for remaining shares
    const estimatedCurrentPrice = position.avg_entry_price || 0;
    
    subLots.forEach(subLot => {
      if (subLot.remainingShares > 0 && subLot.stopLoss && estimatedCurrentPrice > 0) {
        subLot.currentRisk = Math.abs(estimatedCurrentPrice - subLot.stopLoss) * subLot.remainingShares;
        subLot.currentRiskPercent = subLot.currentRisk > 0 && accountBalance && accountBalance > 0
          ? (subLot.currentRisk / accountBalance) * 100 
          : 0;
          
        // If stop is above current price (for long), risk is 0% (in profit)
        if (subLot.stopLoss >= estimatedCurrentPrice) {
          subLot.currentRisk = 0;
          subLot.currentRiskPercent = 0;
        }
      }
    });

    // Return only sub-lots with remaining shares
    const finalSubLots = subLots.filter(subLot => subLot.remainingShares > 0);
    // Return final sub-lots with remaining shares
    return finalSubLots;
  };

  // For imported positions, use pending sell orders to determine sub-lots
  const calculateImportedSubLots = (): SubLot[] => {
    // Use ALL sell orders (pending, cancelled, filled) to understand the complete picture
    const allSellOrders = pendingOrders.filter(order => 
      order.side.toLowerCase() === 'sell'
    );
    
    // Separate current pending orders vs historical orders
    const currentPendingSellOrders = allSellOrders.filter(order => 
      order.status.toLowerCase() === 'pending'
    );
    
    // Calculate current shares and average entry price
    const currentShares = events.reduce((total, event) => {
      return event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares);
    }, 0);
    
    if (currentShares <= 0) return [];
    
    const buyEvents = events.filter(e => e.event_type === 'buy');
    const totalBuyValue = buyEvents.reduce((sum, event) => sum + (event.price * event.shares), 0);
    const totalBuyShares = buyEvents.reduce((sum, event) => sum + event.shares, 0);
    const avgEntryPrice = totalBuyShares > 0 ? totalBuyValue / totalBuyShares : 0;
    
    if (currentPendingSellOrders.length === 0) {
      // No current pending orders - create single sub-lot with all shares
      // But still try to find the most recent stop loss from historical orders
      const snapshotAccountValue = position.account_value_at_entry || accountBalance || 0;
      
      // Look for the most recent stop loss from any sell orders (including cancelled ones)
      const mostRecentStopLoss = allSellOrders
        .filter(order => order.stop_loss || order.price) // Either has explicit stop_loss or use price
        .sort((a, b) => new Date(b.placed_time).getTime() - new Date(a.placed_time).getTime())[0];
      
      const stopLoss = mostRecentStopLoss?.stop_loss || mostRecentStopLoss?.price;
      
      // Use original stop loss from first buy event for consistent Original Risk calculation
      const originalStopLoss = getOriginalStopLoss();
      const originalRisk = originalStopLoss 
        ? Math.abs(avgEntryPrice - originalStopLoss) * currentShares
        : 0;
      const originalRiskPercent = originalRisk > 0 && snapshotAccountValue > 0
        ? (originalRisk / snapshotAccountValue) * 100 
        : 0;
      
      return [{
        buyEventId: 0,
        buyPrice: avgEntryPrice,
        buyDate: buyEvents[0]?.event_date || '',
        originalShares: currentShares,
        remainingShares: currentShares,
        stopLoss: stopLoss,
        originalRisk,
        originalRiskPercent,
        currentRisk: 0,
        currentRiskPercent: 0
      }];
    }
    
    // Group current pending orders by stop loss price
    const ordersByStopLoss = new Map<number, number>();
    currentPendingSellOrders.forEach(order => {
      // For pending sell orders, use the order price as the stop loss, or explicit stop_loss if available
      const stopLossPrice = order.stop_loss || order.price;
      if (stopLossPrice !== null && stopLossPrice !== undefined) {
        const currentShares = ordersByStopLoss.get(stopLossPrice) || 0;
        ordersByStopLoss.set(stopLossPrice, currentShares + order.shares);
      }
    });
    
    console.log('📈 Current pending orders grouped by stop loss:', Object.fromEntries(ordersByStopLoss));
    
    // Convert to sub-lots
    const snapshotAccountValue = position.account_value_at_entry || accountBalance || 0;
    
    const subLots = Array.from(ordersByStopLoss.entries()).map(([stopLoss, shares]) => {
      // Use original stop loss from first buy event for consistent Original Risk calculation
      const originalStopLoss = getOriginalStopLoss();
      const originalRisk = originalStopLoss 
        ? Math.abs(avgEntryPrice - originalStopLoss) * shares
        : 0;
      const originalRiskPercent = originalRisk > 0 && snapshotAccountValue > 0
        ? (originalRisk / snapshotAccountValue) * 100 
        : 0;
      
      // Calculate current risk
      const estimatedCurrentPrice = position.avg_entry_price || avgEntryPrice;
      let currentRisk = 0;
      let currentRiskPercent = 0;
      
      if (estimatedCurrentPrice > 0) {
        currentRisk = Math.abs(estimatedCurrentPrice - stopLoss) * shares;
        currentRiskPercent = currentRisk > 0 && accountBalance && accountBalance > 0
          ? (currentRisk / accountBalance) * 100 
          : 0;
          
        // If stop is above current price (for long), risk is 0% (in profit)
        if (stopLoss >= estimatedCurrentPrice) {
          currentRisk = 0;
          currentRiskPercent = 0;
        }
      }
      
      return {
        buyEventId: 0, // No specific buy event for imports
        buyPrice: avgEntryPrice,
        buyDate: buyEvents[0]?.event_date || '',
        originalShares: shares,
        remainingShares: shares,
        stopLoss,
        originalRisk,
        originalRiskPercent,
        currentRisk,
        currentRiskPercent
      };
    });
    
    console.log('🎯 Final sub-lots:', subLots);
    return subLots;
  };

  // For manual positions, use FIFO logic as requested
  const calculateManualSubLots = (): SubLot[] => {
    console.log('🔧 calculateManualSubLots called with events:', events);
    
    // Process events chronologically to build accurate sub-lots
    const allEvents = [...events].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
    
    console.log('📅 Events sorted chronologically:', allEvents);
    
    const subLots: SubLot[] = [];
    
    // Process each event chronologically
    allEvents.forEach((event, index) => {
      console.log(`📈 Processing event ${index + 1}:`, event.event_type, event.shares, 'shares at', event.price);
      if (event.event_type === 'buy') {
        // Create new sub-lot for buy - Use original stop loss from first buy event
        const originalStopLoss = getOriginalStopLoss();
        const originalRisk = originalStopLoss 
          ? Math.abs(event.price - originalStopLoss) * Math.abs(event.shares)
          : 0;
        
        const snapshotAccountValue = position.account_value_at_entry || accountBalance || 0;
        const originalRiskPercent = originalRisk > 0 && snapshotAccountValue > 0
          ? (originalRisk / snapshotAccountValue) * 100 
          : 0;

        const newSubLot = {
          buyEventId: event.id,
          buyPrice: event.price,
          buyDate: event.event_date,
          originalShares: Math.abs(event.shares),
          remainingShares: Math.abs(event.shares),
          stopLoss: event.stop_loss,
          originalRisk,
          originalRiskPercent,
          currentRisk: 0,
          currentRiskPercent: 0
        };
        
        subLots.push(newSubLot);
        console.log('  ➕ Created sub-lot:', newSubLot);
      } else if (event.event_type === 'sell') {
        // Apply sell using FIFO (First In, First Out) - sell from earliest buys first
        // This means if we bought 200 shares, then 100 shares, then sell 150 shares:
        // - We sell 150 shares from the first 200-share lot, leaving 50 shares in first lot
        // - The second 100-share lot remains completely intact
        let sharesToSell = Math.abs(event.shares);
        console.log(`  ➖ Selling ${sharesToSell} shares using FIFO`);
        
        // Process sub-lots in chronological order (earliest purchases first)
        for (let i = 0; i < subLots.length && sharesToSell > 0; i++) {
          const subLot = subLots[i];
          if (subLot.remainingShares > 0) {
            const sharesFromThisLot = Math.min(sharesToSell, subLot.remainingShares);
            console.log(`    📉 Taking ${sharesFromThisLot} shares from lot ${i + 1} (had ${subLot.remainingShares})`);
            subLot.remainingShares -= sharesFromThisLot;
            sharesToSell -= sharesFromThisLot;
            console.log(`    📊 Lot ${i + 1} now has ${subLot.remainingShares} shares remaining`);
          }
        }
      }
    });

    // Calculate current risk for remaining shares
    const estimatedCurrentPrice = position.avg_entry_price || 0;
    
    subLots.forEach(subLot => {
      if (subLot.remainingShares > 0 && subLot.stopLoss && estimatedCurrentPrice > 0) {
        subLot.currentRisk = Math.abs(estimatedCurrentPrice - subLot.stopLoss) * subLot.remainingShares;
        subLot.currentRiskPercent = subLot.currentRisk > 0 && accountBalance && accountBalance > 0
          ? (subLot.currentRisk / accountBalance) * 100 
          : 0;
          
        // If stop is above current price (for long), risk is 0% (in profit)
        if (subLot.stopLoss >= estimatedCurrentPrice) {
          subLot.currentRisk = 0;
          subLot.currentRiskPercent = 0;
        }
      }
    });

    // Return only sub-lots with remaining shares
    const finalSubLots = subLots.filter(subLot => subLot.remainingShares > 0);
    console.log('🏁 Final manual sub-lots with remaining shares:', finalSubLots);
    return finalSubLots;
  };

  // Memoize sub-lot calculation to prevent re-renders
  const subLots = useMemo(() => {
    return calculateSubLots();
  }, [events, pendingOrders, position.account_value_at_entry, accountBalance]);
  
  const hasImportEvents = events.some(event => event.source === 'import');
  
  // Debug logging for database sync issues
  useEffect(() => {
    const calculatedShares = events.reduce((total, event) => event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares), 0);
    if (position.current_shares !== calculatedShares) {
      console.warn(`� Database sync issue: DB=${position.current_shares}, Calculated=${calculatedShares}`);
    }
  }, [events, position.current_shares]);

  // Event-level editing handlers
  const handleStartEdit = (eventId: number, currentStopLoss?: number) => {
    setEditingStops({
      ...editingStops,
      [eventId]: {
        editing: true,
        value: currentStopLoss?.toString() || '',
        error: undefined
      }
    });
  };

  const handleCancelEdit = (eventId: number) => {
    const newState = { ...editingStops };
    delete newState[eventId];
    setEditingStops(newState);
  };

  const handleSaveEdit = (eventId: number) => {
    const editState = editingStops[eventId];
    if (!editState) return;

    const newStopLoss = editState.value ? parseFloat(editState.value) : null;
    
    // Validate input
    if (editState.value && (isNaN(newStopLoss!) || newStopLoss! <= 0)) {
      setEditingStops({
        ...editingStops,
        [eventId]: {
          ...editState,
          error: 'Stop loss must be a positive number'
        }
      });
      return;
    }

    // Call update function
    if (onUpdateStopLoss) {
      onUpdateStopLoss(eventId, newStopLoss);
    }

    // Clear editing state
    handleCancelEdit(eventId);
  };

  const handleStopLossChange = (eventId: number, value: string) => {
    setEditingStops({
      ...editingStops,
      [eventId]: {
        ...editingStops[eventId],
        value,
        error: undefined
      }
    });
  };

  // Sub-lot editing handlers
  const handleStartSubLotEdit = (subLotKey: string, currentStopLoss?: number) => {
    setEditingSubLots({
      ...editingSubLots,
      [subLotKey]: {
        editing: true,
        value: currentStopLoss?.toString() || '',
        error: undefined
      }
    });
  };

  const handleCancelSubLotEdit = (subLotKey: string) => {
    const newState = { ...editingSubLots };
    delete newState[subLotKey];
    setEditingSubLots(newState);
  };

  const handleSaveSubLotEdit = async (subLotKey: string, subLot: SubLot) => {
    const editState = editingSubLots[subLotKey];
    if (!editState) return;

    const newStopLoss = editState.value ? parseFloat(editState.value) : null;
    
    // Validate input
    if (editState.value && (isNaN(newStopLoss!) || newStopLoss! <= 0)) {
      setEditingSubLots({
        ...editingSubLots,
        [subLotKey]: {
          ...editState,
          error: 'Stop loss must be a positive number'
        }
      });
      return;
    }

    try {
      // For imported positions, we need to update the pending orders that correspond to this sub-lot
      if (hasImportEvents) {
        await updateSubLotStopLoss(subLot, newStopLoss);
      } else {
        // For manual positions, we could update the original buy event's stop loss
        // This is more complex as we'd need to track which buy event this sub-lot corresponds to
        console.warn('Manual position sub-lot stop loss update not yet implemented');
      }

      // Refresh pending orders to reflect the change
      if (hasImportEvents) {
        setLoadingPendingOrders(true);
        try {
          const orders = await fetchPendingOrders(position.id);
          setPendingOrders(orders);
        } catch (error) {
          console.error('Error refreshing pending orders:', error);
        } finally {
          setLoadingPendingOrders(false);
        }
      }

      // Clear editing state
      handleCancelSubLotEdit(subLotKey);
    } catch (error) {
      console.error('Error updating sub-lot stop loss:', error);
      setEditingSubLots({
        ...editingSubLots,
        [subLotKey]: {
          ...editState,
          error: 'Failed to update stop loss'
        }
      });
    }
  };

  // Update stop loss for imported position sub-lots by updating pending orders
  const updateSubLotStopLoss = async (subLot: SubLot, newStopLoss: number | null) => {
    // Find pending sell orders that match this sub-lot's stop loss
    const matchingOrders = pendingOrders.filter(order => 
      order.side.toLowerCase() === 'sell' && 
      order.status.toLowerCase() === 'pending' &&
      (order.stop_loss === subLot.stopLoss || order.price === subLot.stopLoss)
    );

    if (matchingOrders.length === 0) {
      throw new Error('No matching pending orders found for this sub-lot');
    }

    // Update each matching order
    for (const order of matchingOrders) {
      await updatePendingOrder(order.id, { 
        stop_loss: newStopLoss || undefined,
        // Also update the price if this was a stop loss order
        ...(order.price === subLot.stopLoss && newStopLoss && { price: newStopLoss })
      });
    }
    
    console.log('Updated pending orders:', matchingOrders.map(o => o.id), 'to stop loss:', newStopLoss);
  };

  const handleSubLotStopLossChange = (subLotKey: string, value: string) => {
    setEditingSubLots({
      ...editingSubLots,
      [subLotKey]: {
        ...editingSubLots[subLotKey],
        value,
        error: undefined
      }
    });
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'buy': return 'success';
      case 'sell': return 'warning';
      default: return 'default';
    }
  };

  const getRiskColor = (riskPercent: number) => {
    if (riskPercent === 0) return 'success';
    if (riskPercent <= 2) return 'info';
    if (riskPercent <= 5) return 'warning';
    return 'error';
  };

  // Estimate current price from most recent event or use average
  const estimatedCurrentPrice = events.length > 0 
    ? events[events.length - 1].price 
    : position.avg_entry_price || 0;

  return (
    <Paper sx={{ p: 2 }}>
      {/* Current Holdings Section - Primary Stop Loss Management */}
      {subLots.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
            <StopLossIcon color="primary" />
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🎯 Active Position Management ({events.reduce((total, event) => event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares), 0)} shares)
            </Typography>
            <Chip 
              label="Edit Stop Losses Here" 
              size="small" 
              color="primary"
              variant="filled"
            />
          </Box>
          
          {/* Database Sync Warning */}
          {position.current_shares !== events.reduce((total, event) => event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares), 0) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Database Sync Issue:</strong> Database shows {position.current_shares} shares, but calculated from events is {events.reduce((total, event) => event.event_type === 'buy' ? total + event.shares : total - Math.abs(event.shares), 0)} shares. 
                The calculated value is correct. This may indicate the database needs to be updated.
              </Typography>
            </Alert>
          )}
          
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Manage Your Current Holdings:</strong> Update stop losses and take profits for your active position below. 
              These changes will apply to the shares you currently hold. Stop losses can be set above purchase price to lock in profits.
            </Typography>
          </Alert>
          
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.700' }}>
                  <TableCell>Entry Date</TableCell>
                  <TableCell align="left">Shares</TableCell>
                  <TableCell align="left">Entry Price</TableCell>
                  <TableCell align="left">Current Value</TableCell>
                  <TableCell align="left">Stop Loss</TableCell>
                  <TableCell align="left">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subLots.map((subLot, index) => {
                  // Use estimated current price for current value (should eventually be real-time price)
                  const estimatedCurrentPrice = position.avg_entry_price || subLot.buyPrice;
                  const currentValue = subLot.remainingShares * estimatedCurrentPrice;
                  const subLotKey = `sublot-${subLot.buyEventId}-${index}`;
                  const editState = editingSubLots[subLotKey];
                  const isEditing = editState?.editing || false;
                  
                  return (
                    <TableRow key={subLotKey}>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(subLot.buyDate).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      
                      <TableCell align="left">
                        <Typography variant="body2" fontWeight={500}>
                          {subLot.remainingShares.toLocaleString()}
                        </Typography>
                      </TableCell>
                      
                      <TableCell align="left">
                        <Typography variant="body2">
                          {formatCurrency(subLot.buyPrice)}
                        </Typography>
                      </TableCell>
                      
                      <TableCell align="left">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(currentValue)}
                        </Typography>
                      </TableCell>
                      
                      <TableCell align="left">
                        {isEditing ? (
                          <TextField
                            size="small"
                            value={editState.value}
                            onChange={(e) => handleSubLotStopLossChange(subLotKey, e.target.value)}
                            error={!!editState.error}
                            helperText={editState.error}
                            InputProps={{
                              startAdornment: <InputAdornment position="start">$</InputAdornment>
                            }}
                            sx={{ width: 120 }}
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'left', gap: 1 }}>
                            {subLot.stopLoss ? (
                              <>
                                <StopLossIcon fontSize="small" color="error"/>
                                <Typography variant="body2" fontWeight={500}>
                                  {formatCurrency(subLot.stopLoss)}
                                </Typography>
                              </>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      
                      <TableCell align="left">
                        {isEditing ? (
                          <Box>
                            <IconButton 
                              size="small" 
                              onClick={() => handleSaveSubLotEdit(subLotKey, subLot)}
                              color="primary"
                              disabled={disabled}
                            >
                              <SaveIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={() => handleCancelSubLotEdit(subLotKey)}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          <Tooltip title="Set/Update Stop Loss - This affects your active position">
                            <IconButton 
                              size="small" 
                              onClick={() => handleStartSubLotEdit(subLotKey, subLot.stopLoss || undefined)}
                              disabled={disabled}
                              color="primary"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Event History Section - Data Correction */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <StopLossIcon color="secondary" />
        <Typography variant="h6">
          📊 Event History & Data Correction
        </Typography>
        <Chip 
          label={hasImportEvents ? "Imported Position" : "Manual Position"} 
          size="small" 
          color={hasImportEvents ? "secondary" : "primary"}
          variant="outlined"
        />
        <Tooltip title="View historical events and correct any incorrect stop loss data">
          <IconButton size="small">
            <WarningIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Historical Events & Data Correction:</strong> View all buy/sell events for this position and correct any incorrect stop loss data. 
          Original risk shows risk at time of entry. Current risk shows risk based on estimated current price ({formatCurrency(estimatedCurrentPrice)}). 
          <br /><strong>For active position management:</strong> Use the "Active Position Management" section above to manage stop losses for your current holdings.
          {hasImportEvents && (
            <><br /><strong>Imported Position:</strong> Events imported from broker data - edit if stop loss data is incorrect.</>
          )}
        </Typography>
      </Alert>

      {!accountBalance && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Account Balance Required:</strong> Risk percentages require your account balance to be set. 
            Please update your profile settings to see accurate risk percentages based on your total account size.
          </Typography>
        </Alert>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Event</TableCell>
              <TableCell align="left">Shares</TableCell>
              <TableCell align="left">Price</TableCell>
              <TableCell align="left">Value</TableCell>
              <TableCell align="left">Stop Loss</TableCell>
              <TableCell align="left">Original Risk</TableCell>
              <TableCell align="left">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event) => {
              const riskMetrics = calculateEventRisk(event, estimatedCurrentPrice);
              const editState = editingStops[event.id];
              const isEditing = editState?.editing || false;

              return (
                <TableRow 
                  key={event.id} 
                  sx={{ '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.02)' } }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {event.event_type === 'buy' ? 
                        <BuyIcon color="success" fontSize="small" /> : 
                        <SellIcon color="warning" fontSize="small" />
                      }
                      <Chip 
                        label={event.event_type.toUpperCase()} 
                        size="small"
                        color={getEventTypeColor(event.event_type) as any}
                        variant="outlined"
                      />
                    </Box>
                  </TableCell>
                  
                  <TableCell align="left">
                    <Typography variant="body2" fontWeight={500}>
                      {Math.abs(event.shares).toLocaleString()}
                    </Typography>
                  </TableCell>
                  
                  <TableCell align="left">
                    <Typography variant="body2">
                      {formatCurrency(event.price)}
                    </Typography>
                  </TableCell>
                  
                  <TableCell align="left">
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(riskMetrics?.eventValue || 0)}
                    </Typography>
                  </TableCell>
                  
                  <TableCell align="left">
                    {isEditing ? (
                      <TextField
                        size="small"
                        value={editState.value}
                        onChange={(e) => handleStopLossChange(event.id, e.target.value)}
                        error={!!editState.error}
                        helperText={editState.error}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>
                        }}
                        sx={{ width: 120 }}
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'left', justifyContent: 'left' }}>
                        {(riskMetrics?.stopLoss || event.stop_loss) ? (
                          <Box sx={{ textAlign: 'left' }}>
                            <Typography variant="body2" fontWeight={500}>
                              {formatCurrency((riskMetrics?.stopLoss || event.stop_loss) as number)}
                            </Typography>
                            {riskMetrics?.stopLoss && !event.stop_loss && (
                              <Chip 
                                label="From Orders" 
                                size="small" 
                                color="info"
                                variant="outlined"
                                sx={{ fontSize: '0.6rem', height: 16, ml: 0.5 }}
                              />
                            )}
                            {riskMetrics?.stopIsInProfit && (
                              <Chip 
                                label="In Profit" 
                                size="small" 
                                color="success"
                                variant="outlined"
                                sx={{ fontSize: '0.6rem', height: 16, ml: 0.5 }}
                              />
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            None
                          </Typography>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  
                  <TableCell align="left">
                    {event.event_type === 'buy' && riskMetrics?.originalRisk ? (
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="body2">
                          {formatCurrency(riskMetrics.originalRisk)}
                        </Typography>
                        <Chip 
                          label={
                            position.account_value_at_entry || accountBalance 
                              ? `${riskMetrics.originalRiskPercent.toFixed(1)}%` 
                              : 'N/A'
                          }
                          size="small"
                          color={
                            position.account_value_at_entry || accountBalance 
                              ? getRiskColor(riskMetrics.originalRiskPercent) as any 
                              : 'default'
                          }
                          variant="outlined"
                          sx={{ fontSize: '0.6rem', height: 16 }}
                        />
                      </Box>
                    ) : event.event_type === 'sell' ? (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  
                  <TableCell align="left">
                    {isEditing ? (
                      <Box>
                        <IconButton 
                          size="small" 
                          onClick={() => handleSaveEdit(event.id)}
                          color="primary"
                        >
                          <SaveIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleCancelEdit(event.id)}
                        >
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit historical stop loss data">
                          <IconButton 
                            size="small" 
                            onClick={() => handleStartEdit(event.id, event.stop_loss || undefined)}
                            disabled={disabled}
                            color="secondary"
                          >
                            <StopLossIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {onEditEvent && (
                          <Tooltip title="Edit event details (shares, price, date)">
                            <IconButton 
                              size="small" 
                              onClick={() => onEditEvent(event)}
                              disabled={disabled}
                              color="primary"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {events.length === 0 && (
        <Box sx={{ textAlign: 'left', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            No events found for this position
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default EventBreakdown;