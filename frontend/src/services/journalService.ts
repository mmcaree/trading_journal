import { API_URL } from './apiConfig';

export interface JournalEntry {
  id: number;
  entry_type: 'note' | 'lesson' | 'mistake' | 'analysis';
  content: string;
  entry_date: string;
  created_at: string;
  updated_at: string;
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalEntryCreate {
  entry_type: 'note' | 'lesson' | 'mistake' | 'analysis';
  content: string;
  entry_date?: string; // Optional, defaults to now
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalEntryUpdate {
  entry_type?: 'note' | 'lesson' | 'mistake' | 'analysis';
  content?: string;
  entry_date?: string;
  attached_images?: Array<{ url: string; description: string }>;
  attached_charts?: number[];
}

export interface JournalResponse {
  success?: boolean;
  message?: string;
}

class JournalService {
  private baseUrl = `${API_URL}/api/v2`;

  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getJournalEntries(positionId: number): Promise<JournalEntry[]> {
    const response = await fetch(`${this.baseUrl}/positions/${positionId}/journal`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to get journal entries';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async createJournalEntry(positionId: number, entryData: JournalEntryCreate): Promise<JournalEntry> {
    const response = await fetch(`${this.baseUrl}/positions/${positionId}/journal`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(entryData),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create journal entry';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async updateJournalEntry(entryId: number, entryData: JournalEntryUpdate): Promise<JournalEntry> {
    const response = await fetch(`${this.baseUrl}/journal/${entryId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(entryData),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to update journal entry';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async deleteJournalEntry(entryId: number): Promise<JournalResponse> {
    const response = await fetch(`${this.baseUrl}/journal/${entryId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to delete journal entry';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }
}

export const journalService = new JournalService();