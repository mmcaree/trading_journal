# Common Utilities Quick Reference

## Backend Validators (`backend/app/utils/validators.py`)

### Usage
```python
from app.utils.validators import (
    validate_email,
    validate_username,
    validate_password,
    validate_time_format,
    validate_ticker,
    validate_shares,
    validate_price
)

# All validators return Tuple[bool, Optional[str]]
is_valid, error_message = validate_email("user@example.com")
if not is_valid:
    raise ValueError(error_message)
```

### Available Validators
| Function | Purpose | Returns |
|----------|---------|---------|
| `validate_email(email)` | RFC-compliant email validation | `(bool, str)` |
| `validate_username(username)` | 3-20 chars, alphanumeric + underscore | `(bool, str)` |
| `validate_password(password)` | Min 6 characters | `(bool, str)` |
| `validate_time_format(time_str)` | HH:MM format | `(bool, str)` |
| `validate_positive_number(value, field_name)` | Value > 0 | `(bool, str)` |
| `validate_non_negative_number(value, field_name)` | Value >= 0 | `(bool, str)` |
| `validate_percentage(value, field_name)` | 0 <= value <= 100 | `(bool, str)` |
| `validate_ticker(ticker)` | Stock ticker format | `(bool, str)` |
| `validate_date_range(start, end)` | Date range validation | `(bool, str)` |
| `validate_shares(shares)` | Positive integer, reasonable limit | `(bool, str)` |
| `validate_price(price)` | Positive float, reasonable limit | `(bool, str)` |
| `sanitize_string(value, max_length)` | Remove extra whitespace, truncate | `str` |

---

## Frontend Calculations (`frontend/src/utils/calculations.ts`)

### Usage
```typescript
import {
  calculateWinRate,
  calculateRiskPercent,
  calculatePnL,
  calculateSharpeRatio
} from '../utils/calculations';

const winRate = calculateWinRate(wins, totalTrades);
const riskPercent = calculateRiskPercent(shares, entryPrice, stopLoss, accountBalance);
```

### Position Calculations
| Function | Parameters | Returns | Purpose |
|----------|------------|---------|---------|
| `calculatePnL(shares, entryPrice, exitPrice)` | `number, number, number` | `number` | Profit/loss |
| `calculateReturn(entryPrice, exitPrice)` | `number, number` | `number` | % return |
| `calculatePositionValue(shares, price)` | `number, number` | `number` | Total value |
| `calculateRiskPerShare(entryPrice, stopLoss)` | `number, number` | `number` | Risk per share |
| `calculateTotalRisk(shares, entryPrice, stopLoss)` | `number, number, number` | `number` | Total risk $ |
| `calculateRiskPercent(shares, entryPrice, stopLoss, accountBalance)` | `number, number, number, number` | `number` | Risk as % of account |
| `calculateReward(shares, entryPrice, takeProfit)` | `number, number, number` | `number` | Potential reward $ |
| `calculateRiskRewardRatio(entryPrice, stopLoss, takeProfit)` | `number, number, number` | `number` | R:R ratio |
| `calculatePositionSize(accountBalance, riskPercent, entryPrice, stopLoss)` | `number, number, number, number` | `number` | Shares to buy |
| `calculateAveragePrice(totalCost, totalShares)` | `number, number` | `number` | Avg entry price |

### Performance Metrics
| Function | Parameters | Returns | Purpose |
|----------|------------|---------|---------|
| `calculateWinRate(wins, total)` | `number, number` | `number` | Win rate % |
| `calculateProfitFactor(totalProfit, totalLoss)` | `number, number` | `number` | Profit factor |
| `calculateExpectancy(winRate, avgWin, avgLoss)` | `number, number, number` | `number` | Expectancy $ |
| `calculateKellyCriterion(winRate, avgWin, avgLoss)` | `number, number, number` | `number` | Kelly % |
| `calculateSharpeRatio(returns, riskFreeRate)` | `number[], number` | `number` | Sharpe ratio |
| `calculateMaxDrawdown(portfolioValues)` | `number[]` | `{maxDrawdown, maxDrawdownPercent}` | Max drawdown |
| `calculateSortinoRatio(returns, riskFreeRate)` | `number[], number` | `number` | Sortino ratio |
| `calculateCalmarRatio(annualReturn, maxDrawdown)` | `number, number` | `number` | Calmar ratio |
| `calculateCAGR(beginningValue, endingValue, years)` | `number, number, number` | `number` | CAGR % |

### Options
| Function | Parameters | Returns | Purpose |
|----------|------------|---------|---------|
| `convertOptionsPrice(contractPrice)` | `number` | `number` | Contract → Actual (×100) |
| `convertToContractPrice(actualPrice)` | `number` | `number` | Actual → Contract (÷100) |

### Helpers
| Function | Parameters | Returns | Purpose |
|----------|------------|---------|---------|
| `safeNumber(value, defaultValue)` | `any, number` | `number` | Safe conversion |
| `roundTo(value, decimals)` | `number, number` | `number` | Round to decimals |
| `calculatePercentageChange(oldValue, newValue)` | `number, number` | `number` | % change |

---

## Frontend Validation Schemas (`frontend/src/utils/validationSchemas.ts`)

### Constants
```typescript
import {
  PASSWORD_MIN_LENGTH,  // 6
  PASSWORD_MAX_LENGTH,  // 128
  USERNAME_MIN_LENGTH,  // 3
  USERNAME_MAX_LENGTH   // 20
} from '../utils/validationSchemas';
```

### Reusable Schemas
```typescript
import {
  emailSchema,
  usernameSchema,
  passwordSchema,
  confirmPasswordSchema,
  tickerSchema,
  positiveNumberSchema,
  nonNegativeNumberSchema,
  percentageSchema
} from '../utils/validationSchemas';

// Use in Yup object schemas
const mySchema = Yup.object().shape({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  confirmPassword: confirmPasswordSchema,
  shares: positiveNumberSchema('Shares'),
  riskPercent: percentageSchema('Risk %')
});
```

### Form Schemas
```typescript
import {
  loginFormSchema,
  personalInfoSchema,
  accountInfoSchema,
  passwordResetSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  createPositionSchema
} from '../utils/validationSchemas';

// Use directly in Formik
const formik = useFormik({
  initialValues: {...},
  validationSchema: loginFormSchema,
  onSubmit: handleSubmit
});
```

### Helper Functions
```typescript
import {
  isValidEmail,
  isValidUsername,
  isValidPassword,
  getPasswordStrength
} from '../utils/validationSchemas';

// Validate without Yup
if (!isValidEmail(email)) {
  setError('Invalid email');
}

// Check password strength
const { strength, score } = getPasswordStrength(password);
// strength: 'weak' | 'medium' | 'strong'
// score: 0-5
```

---

## Common Patterns

### Backend: Validate and Return Error
```python
from app.utils.validators import validate_email, validate_password

def register_user(username: str, email: str, password: str):
    # Validate email
    is_valid, error = validate_email(email)
    if not is_valid:
        raise ValueError(error)
    
    # Validate password
    is_valid, error = validate_password(password)
    if not is_valid:
        raise ValueError(error)
    
    # Proceed with registration...
```

### Frontend: Form with Validation
```typescript
import { useFormik } from 'formik';
import { loginFormSchema } from '../utils/validationSchemas';

const MyForm = () => {
  const formik = useFormik({
    initialValues: { username: '', password: '' },
    validationSchema: loginFormSchema,
    onSubmit: async (values) => {
      // Form is already validated
      await handleLogin(values);
    }
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <TextField
        name="username"
        value={formik.values.username}
        onChange={formik.handleChange}
        error={formik.touched.username && Boolean(formik.errors.username)}
        helperText={formik.touched.username && formik.errors.username}
      />
      {/* ... */}
    </form>
  );
};
```

### Frontend: Calculate and Display
```typescript
import { calculateWinRate, calculateRiskPercent } from '../utils/calculations';
import { formatPercentage } from '../utils/formatters';

const PositionStats = ({ wins, losses, shares, entry, stop, balance }) => {
  const winRate = calculateWinRate(wins, wins + losses);
  const risk = calculateRiskPercent(shares, entry, stop, balance);
  
  return (
    <div>
      <div>Win Rate: {formatPercentage(winRate)}</div>
      <div>Risk: {formatPercentage(risk)}</div>
    </div>
  );
};
```

---

## Migration Guide

### Migrating Existing Code

#### Before (Inline Validation)
```typescript
const schema = Yup.object().shape({
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required')
});
```

#### After (Centralized Schema)
```typescript
import { passwordSchema } from '../utils/validationSchemas';

const schema = Yup.object().shape({
  password: passwordSchema
});
```

---

#### Before (Inline Calculation)
```typescript
const winRate = total > 0 ? (wins / total) * 100 : 0;
```

#### After (Centralized Function)
```typescript
import { calculateWinRate } from '../utils/calculations';

const winRate = calculateWinRate(wins, total);
```

---

#### Before (Python Inline Validation)
```python
try:
    datetime.strptime(time_str, "%H:%M")
    is_valid = True
except ValueError:
    is_valid = False
```

#### After (Centralized Validator)
```python
from app.utils.validators import validate_time_format

is_valid, error_msg = validate_time_format(time_str)
if not is_valid:
    raise ValueError(error_msg)
```

---

## Testing

### Test Validators
```python
from app.utils.validators import validate_email

def test_email_validation():
    is_valid, _ = validate_email("valid@example.com")
    assert is_valid == True
    
    is_valid, error = validate_email("invalid")
    assert is_valid == False
    assert "Invalid email format" in error
```

### Test Calculations
```typescript
import { calculateWinRate } from '../utils/calculations';

describe('calculateWinRate', () => {
  it('calculates win rate correctly', () => {
    expect(calculateWinRate(7, 10)).toBe(70);
  });
  
  it('handles zero total', () => {
    expect(calculateWinRate(0, 0)).toBe(0);
  });
});
```

---

## Best Practices

1. **Always use utilities instead of inline logic**
   - ✅ `calculateWinRate(wins, total)`
   - ❌ `(wins / total) * 100`

2. **Import what you need**
   - ✅ `import { calculateWinRate } from '../utils/calculations'`
   - ❌ `import * as calculations from '../utils/calculations'`

3. **Use validation constants**
   - ✅ `if (password.length < PASSWORD_MIN_LENGTH)`
   - ❌ `if (password.length < 6)`

4. **Handle validator return values**
   - ✅ Check both `is_valid` and `error_message`
   - ❌ Only check boolean without using error message

5. **Prefer schemas over helper functions in forms**
   - ✅ Use `loginFormSchema` with Formik
   - ⚠️ Use `isValidEmail()` only for non-form validation

---

## Troubleshooting

### Import Errors
```typescript
// ❌ Wrong
import { calculateWinRate } from './utils/calculations';

// ✅ Correct
import { calculateWinRate } from '../utils/calculations';
```

### Validator Return Type
```python
# ❌ Wrong - ignoring error message
is_valid = validate_email(email)

# ✅ Correct - destructuring tuple
is_valid, error_msg = validate_email(email)
```

### Schema Usage
```typescript
// ❌ Wrong - schema instance instead of schema definition
validationSchema: passwordSchema()

// ✅ Correct - schema definition
validationSchema: passwordSchema
```
