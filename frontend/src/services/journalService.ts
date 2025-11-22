import { API_URL } from './apiConfig';
import {
  JournalEntry,
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalResponse
} from '../types/api';

// Re-export types for backward compatibility
export type {
  JournalEntry,
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalResponse
};

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