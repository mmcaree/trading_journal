-- Migration: Add starting_balance_date to users table
-- Date: 2025-12-02
-- Description: Adds starting_balance_date field to track when user set their initial balance

-- Add starting_balance_date column (initial_account_balance already exists)
ALTER TABLE users ADD COLUMN starting_balance_date DATETIME;

-- Backfill starting_balance_date for existing users with their account creation date
UPDATE users 
SET starting_balance_date = created_at
WHERE starting_balance_date IS NULL;
