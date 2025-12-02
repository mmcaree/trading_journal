-- Migration: Add account_value_at_entry to trading_positions table (PostgreSQL)
-- Date: 2025-12-02
-- Description: Adds account_value_at_entry field to track account value when position was opened

-- Add account_value_at_entry column
ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS account_value_at_entry DOUBLE PRECISION;

-- Note: Backfill will be done via Python script for accurate historical calculations
