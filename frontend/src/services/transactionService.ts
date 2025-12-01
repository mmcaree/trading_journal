import axios from 'axios';
import { API_URL } from './apiConfig';

export interface AccountTransaction {
  id: number;
  user_id: number;
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  transaction_date: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionCreate {
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  transaction_date: string;
  description?: string;
}

export interface TransactionUpdate {
  transaction_type?: 'DEPOSIT' | 'WITHDRAWAL';
  amount?: number;
  transaction_date?: string;
  description?: string;
}

export interface TransactionSummary {
  total_deposits: number;
  total_withdrawals: number;
  net_flow: number;
}

/**
 * Get all account transactions with optional date filtering
 */
export const getTransactions = async (
  startDate?: string,
  endDate?: string
): Promise<AccountTransaction[]> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const response = await axios.get(
    `${API_URL}/api/account-transactions/?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
};

/**
 * Get a specific transaction by ID
 */
export const getTransaction = async (transactionId: number): Promise<AccountTransaction> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  const response = await axios.get(
    `${API_URL}/api/account-transactions/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
};

/**
 * Create a new transaction (deposit or withdrawal)
 */
export const createTransaction = async (
  transaction: TransactionCreate
): Promise<AccountTransaction> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  const response = await axios.post(
    `${API_URL}/api/account-transactions/`,
    transaction,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
};

/**
 * Update an existing transaction
 */
export const updateTransaction = async (
  transactionId: number,
  updates: TransactionUpdate
): Promise<AccountTransaction> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  const response = await axios.put(
    `${API_URL}/api/account-transactions/${transactionId}`,
    updates,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
};

/**
 * Delete a transaction
 */
export const deleteTransaction = async (transactionId: number): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  await axios.delete(
    `${API_URL}/api/account-transactions/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

/**
 * Get summary totals of deposits and withdrawals
 */
export const getTransactionSummary = async (
  startDate?: string,
  endDate?: string
): Promise<TransactionSummary> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const response = await axios.get(
    `${API_URL}/api/account-transactions/summary/totals?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
};
