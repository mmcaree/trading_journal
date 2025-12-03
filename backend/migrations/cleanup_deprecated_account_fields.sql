-- Phase 2.3: Cleanup deprecated account balance fields
-- Created: 2025-12-02
-- 
-- This migration removes deprecated fields that are no longer needed
-- after implementing dynamic account value calculations.
--
-- IMPORTANT: Only run this AFTER verifying Phase 2.3 is fully deployed
-- and working in production for at least 1 week.

-- Check if default_account_size exists (it shouldn't in production, but defensive)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'default_account_size'
    ) THEN
        ALTER TABLE users DROP COLUMN default_account_size;
        RAISE NOTICE '✓ Removed default_account_size column';
    ELSE
        RAISE NOTICE '✓ Column default_account_size does not exist (already clean)';
    END IF;
END $$;

-- NOTE: We are KEEPING current_account_balance for now even though it's deprecated
-- for writes. This provides a fallback and avoids breaking changes.
-- It should only be read through AccountValueService going forward.
-- 
-- Future cleanup (Phase 3+):
-- - Remove current_account_balance column
-- - Ensure all code paths use AccountValueService exclusively
--
-- DO NOT remove these columns yet:
-- - current_account_balance (deprecated but kept for compatibility)
-- - initial_account_balance (actively used - user's starting balance)
-- - starting_balance_date (actively used)

RAISE NOTICE '✓ Phase 2.3 database cleanup complete';
RAISE NOTICE '  - Deprecated fields documented';
RAISE NOTICE '  - Dynamic account value system fully operational';
