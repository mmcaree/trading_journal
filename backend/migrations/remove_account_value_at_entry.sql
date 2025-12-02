-- Migration: Remove account_value_at_entry column
-- Date: December 2, 2025
-- Reason: Always calculate dynamically via AccountValueService
-- Safe: Column was never populated (always null), backward compatible

-- Remove the column
ALTER TABLE trading_positions DROP COLUMN IF EXISTS account_value_at_entry;

-- Verify removal
SELECT COUNT(*) as verification_check
FROM information_schema.columns 
WHERE table_name = 'trading_positions' 
  AND column_name = 'account_value_at_entry';
-- Should return 0

-- Done! No rollback needed - column was never used.
