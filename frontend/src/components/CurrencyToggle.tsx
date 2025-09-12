import React from 'react';
import {
  IconButton,
  Tooltip,
  Badge,
  Box,
  Typography,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Switch,
  FormControlLabel,
  Chip
} from '@mui/material';
import {
  CurrencyExchange as CurrencyExchangeIcon,
  Public as PublicIcon,
  SwapHoriz as SwapHorizIcon
} from '@mui/icons-material';
import { useCurrency } from '../context/CurrencyContext';

interface CurrencyToggleProps {
  variant?: 'icon' | 'chip' | 'text';
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const CurrencyToggle: React.FC<CurrencyToggleProps> = ({ 
  variant = 'icon', 
  size = 'medium',
  showLabel = false 
}) => {
  const { 
    displayCurrency, 
    nativeCurrency, 
    currentCurrency, 
    availableCurrencies,
    setDisplayCurrency,
    toggleCurrency,
    isConverting 
  } = useCurrency();

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    // Always show the currency selection menu
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCurrencySelect = (currencyCode: string) => {
    setDisplayCurrency(currencyCode);
    handleClose();
  };

  const isNonUSD = displayCurrency !== 'USD';

  if (variant === 'chip') {
    return (
      <Chip
        icon={<CurrencyExchangeIcon />}
        label={`${currentCurrency?.symbol} ${displayCurrency}`}
        onClick={handleClick}
        color={isNonUSD ? 'primary' : 'default'}
        variant={isNonUSD ? 'filled' : 'outlined'}
        size={size === 'large' ? 'medium' : size}
        disabled={isConverting}
      />
    );
  }

  if (variant === 'text') {
    return (
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          padding: 1,
          borderRadius: 1,
          '&:hover': {
            backgroundColor: 'action.hover'
          }
        }}
      >
        <CurrencyExchangeIcon 
          fontSize={size} 
          color={isNonUSD ? 'primary' : 'action'} 
        />
        <Typography variant="body2" color={isNonUSD ? 'primary' : 'textSecondary'}>
          {currentCurrency?.symbol} {displayCurrency}
          {showLabel && (
            <Typography variant="caption" display="block">
              {isNonUSD ? 'Local Currency' : 'USD'}
            </Typography>
          )}
        </Typography>
      </Box>
    );
  }

  // Default icon variant
  return (
    <>
      <Tooltip 
        title={`Currently showing ${displayCurrency}. Click to ${
          displayCurrency === 'USD' ? `switch to ${nativeCurrency}` : 'switch to USD'
        }`}
      >
        <IconButton
          onClick={handleClick}
          size={size}
          disabled={isConverting}
          color={isNonUSD ? 'primary' : 'default'}
        >
          <Badge 
            badgeContent={isNonUSD ? currentCurrency?.symbol : undefined}
            color="primary"
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
          >
            <CurrencyExchangeIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      {/* Currency selection menu */}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem disabled>
          <ListItemIcon>
            <PublicIcon />
          </ListItemIcon>
          <ListItemText primary="Select Currency" />
        </MenuItem>
        <Divider />
        
        {/* Quick toggle option */}
        <MenuItem onClick={toggleCurrency}>
          <ListItemIcon>
            <SwapHorizIcon />
          </ListItemIcon>
          <ListItemText 
            primary={`Switch to ${displayCurrency === 'USD' ? nativeCurrency : 'USD'}`}
            secondary="Quick toggle"
          />
        </MenuItem>
        
        <Divider />
        
        {/* Popular currencies */}
        {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].map((code) => {
          const currency = availableCurrencies.find(c => c.code === code);
          if (!currency) return null;
          
          return (
            <MenuItem 
              key={code}
              onClick={() => handleCurrencySelect(code)}
              selected={displayCurrency === code}
            >
              <ListItemText 
                primary={`${currency.symbol} ${currency.code}`}
                secondary={currency.name}
              />
            </MenuItem>
          );
        })}
        
        <Divider />
        
        {/* Other currencies */}
        {availableCurrencies
          .filter(c => !['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].includes(c.code))
          .map((currency) => (
            <MenuItem 
              key={currency.code}
              onClick={() => handleCurrencySelect(currency.code)}
              selected={displayCurrency === currency.code}
            >
              <ListItemText 
                primary={`${currency.symbol} ${currency.code}`}
                secondary={currency.name}
              />
            </MenuItem>
          ))
        }
      </Menu>
    </>
  );
};

export default CurrencyToggle;