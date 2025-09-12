// API service for trade data import functionality
import { API_URL } from './apiConfig';

export interface ImportBatch {
  batch_id: string;
  filename: string;
  total_orders: number;
  filled_orders: number;
  pending_orders: number;
  cancelled_orders: number;
  failed_orders: number;
  created_at: string;
  completed_at?: string;
}

export interface ImportOrder {
  id: number;
  symbol: string;
  company_name: string;
  side: string;
  status: string;
  filled_qty: number;
  total_qty: number;
  price?: number;
  avg_price?: number;
  time_in_force: string;
  placed_time?: string;
  filled_time?: string;
  processed: boolean;
}

export interface ImportResults {
  positions_created: number;
  positions_updated: number;
  trades_created: number;
  orders_processed: number;
}

export interface ImportResponse {
  success: boolean;
  batch_id: string;
  filename: string;
  total_orders: number;
  filled_orders: number;
  pending_orders: number;
  cancelled_orders: number;
  failed_orders: number;
  message: string;
}

export interface ProcessResponse {
  success: boolean;
  batch_id: string;
  results: ImportResults;
  message: string;
}

export interface BatchDetailsResponse {
  success: boolean;
  data: ImportBatch & {
    sample_orders: ImportOrder[];
  };
}

export interface BatchListResponse {
  success: boolean;
  data: {
    total_batches: number;
    batches: ImportBatch[];
  };
}

class ImportService {
  private baseUrl = `${API_URL}/api/import`;

  async uploadCSV(file: File): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/csv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload CSV');
    }

    return response.json();
  }

  async processBatch(batchId: string, accountSize?: number): Promise<ProcessResponse> {
    const token = localStorage.getItem('token');
    
    const url = accountSize 
      ? `${this.baseUrl}/process/${batchId}?account_size=${accountSize}`
      : `${this.baseUrl}/process/${batchId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to process batch');
    }

    return response.json();
  }

  async getBatches(): Promise<BatchListResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/batches`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get batches');
    }

    return response.json();
  }

  async getBatchDetails(batchId: string): Promise<BatchDetailsResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/batches/${batchId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get batch details');
    }

    return response.json();
  }

  async deleteBatch(batchId: string): Promise<{ success: boolean; message: string }> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/batches/${batchId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete batch');
    }

    return response.json();
  }

  async getBatchOrders(batchId: string, skip: number = 0, limit: number = 100): Promise<{
    success: boolean;
    data: {
      total: number;
      skip: number;
      limit: number;
      orders: ImportOrder[];
    };
  }> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/orders/${batchId}?skip=${skip}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get batch orders');
    }

    return response.json();
  }

  async detectStopLosses(batchId?: string, accountSize?: number): Promise<any> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No token found');
    }

    const baseImportsUrl = `${API_URL}/api/import`;
    let url = `${baseImportsUrl}/detect-stop-losses`;
    
    const params = new URLSearchParams();
    if (batchId) params.append('batch_id', batchId);
    if (accountSize) params.append('account_size', accountSize.toString());
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to detect stop losses');
    }

    return response.json();
  }
}

export const importService = new ImportService();