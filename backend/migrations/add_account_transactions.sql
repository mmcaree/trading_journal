-- Migration: Add Account Transactions Table
-- Date: 2025-12-02
-- Description: Creates table for tracking deposits and withdrawals to calculate accurate account growth

-- Create account_transactions table
CREATE TABLE IF NOT EXISTS account_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date DATETIME NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_transactions_user ON account_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_date ON account_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_account_transactions_type ON account_transactions(transaction_type);
