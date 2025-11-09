import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Grid,
  InputAdornment,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  Divider,
  Paper
} from '@mui/material';
import {
  TrendingDown as StopLossIcon,
  TrendingUp as TakeProfitIcon,
  Security as RiskIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import { Position } from '../services/positionsService';
import { useCurrency } from '../context/CurrencyContext';

export interface PerEventRiskLevels {
  useEventLevels: boolean;
  stopLoss?: number;
  takeProfit?: number;
}

interface PerEventStopLossManagerProps {
  position: Position;
  eventShares: number;
  eventPrice: number;
  eventType: 'buy' | 'sell';
  riskLevels: PerEventRiskLevels;
  onRiskLevelsChange: (levels: PerEventRiskLevels) => void;
  accountBalance?: number;
  disabled?: boolean;
}

const PerEventStopLossManager: React.FC<PerEventStopLossManagerProps> = ({
  position,
  eventShares,
  eventPrice,
  eventType,
  riskLevels,
  onRiskLevelsChange,
  accountBalance,
  disabled = false
}) => {
  const { formatCurrency } = useCurrency();

  // Calculate risk metrics
  const eventValue = eventShares * eventPrice;
  const currentPositionValue = position.current_shares * (position.avg_entry_price || eventPrice);
  const newTotalShares = eventType === 'buy' 
    ? position.current_shares + eventShares 
    : position.current_shares - eventShares;
  
  // Risk calculations
  const calculateRiskReward = (stopLoss?: number, takeProfit?: number) => {
    if (!stopLoss && !takeProfit) return null;
    
    const stopRisk = stopLoss ? Math.abs(eventPrice - stopLoss) * eventShares : 0;
    const profitPotential = takeProfit ? Math.abs(takeProfit - eventPrice) * eventShares : 0;
    const riskRewardRatio = stopRisk > 0 && profitPotential > 0 ? profitPotential / stopRisk : null;
    
    // Use account balance at entry for historical consistency, fall back to current balance
    const balanceForRiskCalc = position.account_value_at_entry || accountBalance || 0;
    
    return {
      stopRisk,
      profitPotential,
      riskRewardRatio,
      riskPercent: stopRisk > 0 && balanceForRiskCalc > 0 ? (stopRisk / balanceForRiskCalc) * 100 : 0,
      rewardPercent: profitPotential > 0 && balanceForRiskCalc > 0 ? (profitPotential / balanceForRiskCalc) * 100 : 0
    };
  };

  const riskMetrics = calculateRiskReward(riskLevels.stopLoss, riskLevels.takeProfit);

  const getRiskColor = (riskPercent: number) => {
    if (riskPercent <= 0.25) return 'success';
    if (riskPercent <= 0.75) return 'warning';
    return 'error';
  };

  const getRiskRatioColor = (ratio: number) => {
    if (ratio >= 3) return 'success';
    if (ratio >= 2) return 'warning';
    return 'error';
  };

  const handleToggleEventLevels = (checked: boolean) => {
    onRiskLevelsChange({
      ...riskLevels,
      useEventLevels: checked,
      // Pre-populate with position defaults when enabled
      stopLoss: checked && !riskLevels.stopLoss ? position.current_stop_loss || undefined : riskLevels.stopLoss,
      takeProfit: checked && !riskLevels.takeProfit ? position.current_take_profit || undefined : riskLevels.takeProfit
    });
  };

  const handleStopLossChange = (value: string) => {
    onRiskLevelsChange({
      ...riskLevels,
      stopLoss: value ? parseFloat(value) : undefined
    });
  };

  const handleTakeProfitChange = (value: string) => {
    onRiskLevelsChange({
      ...riskLevels,
      takeProfit: value ? parseFloat(value) : undefined
    });
  };

  return (
    <Box>
      {/* Per-Event Risk Toggle */}
      <Paper sx={{ 
        p: 2, 
        bgcolor: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid',
        borderColor: riskLevels.useEventLevels ? 'primary.main' : 'divider'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RiskIcon color={riskLevels.useEventLevels ? 'primary' : 'disabled'} />
            <Typography variant="h6" color={riskLevels.useEventLevels ? 'primary' : 'text.secondary'}>
              Per-Event Risk Management
            </Typography>
            <Tooltip title="Set individual stop loss and take profit levels for this specific event">
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          
          <FormControlLabel
            control={
              <Switch
                checked={riskLevels.useEventLevels}
                onChange={(e) => handleToggleEventLevels(e.target.checked)}
                disabled={disabled}
                color="primary"
              />
            }
            label=""
          />
        </Box>

        {riskLevels.useEventLevels && (
          <Box>
            {/* Current Position Context */}
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Position Context:</strong> Adding {formatCurrency(eventValue)} to {position.ticker} position. 
                Current position: {position.current_shares} shares at {formatCurrency(position.avg_entry_price || 0)} avg.
                {position.current_stop_loss && (
                  <span> Current stop: {formatCurrency(position.current_stop_loss)}</span>
                )}
              </Typography>
            </Alert>

            {/* Risk Level Inputs */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Event Stop Loss"
                  type="number"
                  value={riskLevels.stopLoss || ''}
                  onChange={(e) => handleStopLossChange(e.target.value)}
                  disabled={disabled}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <StopLossIcon color="error" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">$</InputAdornment>
                    )
                  }}
                  placeholder={position.current_stop_loss ? formatCurrency(position.current_stop_loss) : 'Optional'}
                  helperText="Stop loss price for this event only"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Event Take Profit"
                  type="number"
                  value={riskLevels.takeProfit || ''}
                  onChange={(e) => handleTakeProfitChange(e.target.value)}
                  disabled={disabled}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <TakeProfitIcon color="success" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">$</InputAdornment>
                    )
                  }}
                  placeholder={position.current_take_profit ? formatCurrency(position.current_take_profit) : 'Optional'}
                  helperText="Take profit price for this event only"
                />
              </Grid>
            </Grid>

            {/* Risk Metrics Display */}
            {riskMetrics && (riskMetrics.stopRisk > 0 || riskMetrics.profitPotential > 0) && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Event Risk Analysis
                </Typography>
                
                <Grid container spacing={2}>
                  {riskMetrics.stopRisk > 0 && (
                    <Grid item xs={12} sm={4}>
                      <Card sx={{ bgcolor: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <WarningIcon color="error" fontSize="small" />
                            <Typography variant="caption" color="error.main">Risk</Typography>
                          </Box>
                          <Typography variant="h6" color="error.main">
                            {formatCurrency(riskMetrics.stopRisk)}
                          </Typography>
                          <Chip 
                            label={`${riskMetrics.riskPercent.toFixed(1)}%`}
                            size="small"
                            color={getRiskColor(riskMetrics.riskPercent) as any}
                            variant="outlined"
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  
                  {riskMetrics.profitPotential > 0 && (
                    <Grid item xs={12} sm={4}>
                      <Card sx={{ bgcolor: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CheckIcon color="success" fontSize="small" />
                            <Typography variant="caption" color="success.main">Reward</Typography>
                          </Box>
                          <Typography variant="h6" color="success.main">
                            {formatCurrency(riskMetrics.profitPotential)}
                          </Typography>
                          <Chip 
                            label={`${riskMetrics.rewardPercent.toFixed(1)}%`}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  
                  {riskMetrics.riskRewardRatio && (
                    <Grid item xs={12} sm={4}>
                      <Card sx={{ bgcolor: 'rgba(25, 118, 210, 0.1)', border: '1px solid rgba(25, 118, 210, 0.3)' }}>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <RiskIcon color="primary" fontSize="small" />
                            <Typography variant="caption" color="primary.main">R:R Ratio</Typography>
                          </Box>
                          <Typography variant="h6" color="primary.main">
                            1:{riskMetrics.riskRewardRatio.toFixed(1)}
                          </Typography>
                          <Chip 
                            label={riskMetrics.riskRewardRatio >= 2 ? 'Good' : 'Review'}
                            size="small"
                            color={getRiskRatioColor(riskMetrics.riskRewardRatio) as any}
                            variant="outlined"
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}

            {/* Account Balance Warning */}
            {(!position.account_value_at_entry && (!accountBalance || accountBalance <= 0)) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Account Balance Required:</strong> Risk percentages require your account balance to be set. 
                  Please update your profile settings to see accurate risk percentages based on your total account size.
                </Typography>
              </Alert>
            )}
            
            {/* Historical Balance Info */}
            {position.account_value_at_entry && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Historical Risk Analysis:</strong> Risk percentages are calculated based on your account balance when this position was opened (${position.account_value_at_entry.toLocaleString()}) for consistent historical analysis.
                </Typography>
              </Alert>
            )}

            {/* Professional Tips */}
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>💡 Pro Tips:</strong>
                <br />• Use tighter stops on larger additions to manage risk
                <br />• Consider R:R ratio of 2:1 or better for sustainable profitability
                <br />• Event-level stops allow precision scaling strategies
                <br />• Leave blank to use position-level defaults
              </Typography>
            </Alert>
          </Box>
        )}

        {!riskLevels.useEventLevels && (
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2">
              Using position-level risk management. Enable per-event levels for advanced scaling strategies.
            </Typography>
          </Alert>
        )}
      </Paper>
    </Box>
  );
};

export default PerEventStopLossManager;