# Test Data for Universal CSV Import

This directory contains sample CSV files for testing the universal broker import system.

## Sample Files

### 1. Webull USA (`webull_usa_sample.csv`)
**Format:** Standard US format with simple column names
- **Columns:** Symbol, Action, Quantity, Price, Date, Commission
- **Actions:** BUY, SELL
- **Date Format:** YYYY-MM-DD
- **Signature:** Symbol + Action + Quantity columns

### 2. Webull Australia (`webull_australia_sample.csv`)
**Format:** Australian format with 14 columns including currency and exchange
- **Columns:** Symbol, Name, Currency, Buy/Sell, Trade Date, Time, Quantity, Price, Consideration, Brokerage, Transaction Type, Exchange Rate, Comm/Fee/Tax, GST, Exchange
- **Actions:** Buy, Sell
- **Date Format:** DD/MM/YYYY
- **Currency:** AUD
- **Signature:** Currency + Exchange + GST columns

### 3. Robinhood (`robinhood_sample.csv`)
**Format:** Activity report with process and settle dates
- **Columns:** Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount
- **Actions:** Buy, Sell (in Trans Code)
- **Date Format:** MM/DD/YYYY
- **Signature:** Activity Date + Trans Code + Instrument columns

### 4. TD Ameritrade (`td_ameritrade_sample.csv`)
**Format:** Transaction report with balance tracking
- **Columns:** Date, Transaction, Description, Symbol, Qty, Price, Commission, Amount, Balance
- **Actions:** BOUGHT, SOLD
- **Date Format:** MM/DD/YYYY
- **Signature:** Transaction + Qty + Balance columns

### 5. Interactive Brokers (`interactive_brokers_sample.csv`)
**Format:** Trade report with detailed P/L tracking
- **Columns:** TradeID, ClientAccountID, Symbol, Date/Time, Quantity, T. Price, C. Price, Proceeds, Comm/Fee, Basis, Realized P/L, MTM P/L, Code
- **Actions:** B (Buy), S (Sell) in Code column
- **Date Format:** YYYY-MM-DD HH:MM:SS
- **Signature:** TradeID + T. Price + Code columns

### 6. E*TRADE (`etrade_sample.csv`)
**Format:** Transaction history with CUSIP numbers
- **Columns:** TransactionDate, TransactionType, SecurityType, Symbol, Quantity, Amount, Price, Commission, Fees, CUSIPNumber, SecurityDescription
- **Actions:** Bought, Sold
- **Date Format:** MM/DD/YYYY
- **Signature:** TransactionType + SecurityType + CUSIPNumber columns

### 7. Fidelity (`fidelity_sample.csv`)
**Format:** Account statement with verbose actions
- **Columns:** Run Date, Account, Action, Symbol, Security Description, Security Type, Quantity, Price, Commission, Fees, Accrued Interest, Amount, Settlement Date
- **Actions:** YOU BOUGHT, YOU SOLD
- **Date Format:** MM/DD/YYYY
- **Signature:** Run Date + "YOU BOUGHT" action + Settlement Date columns

### 8. Charles Schwab (`charles_schwab_sample.csv`)
**Format:** Complex date format with currency symbols
- **Columns:** Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
- **Actions:** Buy, Sell
- **Date Format:** MM/DD/YYYY as of MM/DD/YYYY (dual date)
- **Currency:** Amounts include $ symbols and thousand separators (commas)
- **Signature:** "as of" in date + $ symbols in amounts

## Testing the Import System

### Auto-Detection Test
1. Upload any of these CSV files without selecting a broker
2. The system should automatically detect the broker format
3. Verify the detected broker matches the file

### Manual Selection Test
1. Select a specific broker from the dropdown
2. Upload the corresponding CSV file
3. Verify the import succeeds

### Column Mapping Test
1. Modify a CSV file to have non-standard column names
2. Upload without selecting a broker
3. Verify the ColumnMapper component appears
4. Map columns manually and verify import succeeds

### Validation Test
1. Click "Validate CSV" before importing
2. Verify sample data preview shows correct values
3. Verify column mapping is accurate
4. Verify row count matches file

### Template Download Test
1. Select each broker from dropdown
2. Download the template
3. Compare template columns to sample file
4. Verify template can be imported successfully

## Expected Results

All sample files contain the same trades with slight variations in:
- Date formats
- Column names
- Action terminology
- Commission/fee handling
- Currency symbols

After importing any file, you should see:
- **12 events imported** (10 trades for most brokers)
- **7 unique positions** (AAPL, TSLA, MSFT, GOOGL, NVDA, META, AMD/RIO)
- **Mixed open and closed positions**

## Data Consistency

All files represent similar trading activity:
- Initial buys in January 2024
- Some partial sells
- Additional buys in February 2024
- Final sells for testing position closure

Total shares per symbol may vary between brokers to demonstrate different position states.
