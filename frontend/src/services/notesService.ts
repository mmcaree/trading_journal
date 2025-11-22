import { API_URL } from './apiConfig';
import { NotesUpdateResponse } from '../types/api';

// Re-export types for backward compatibility
export type { NotesUpdateResponse };

class NotesService {
  private baseUrl = `${API_URL}/api/notes`;

  async updateTradeNotes(tradeId: number, notes: string): Promise<NotesUpdateResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/trade/${tradeId}/notes`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update notes');
    }

    return response.json();
  }
}

export const notesService = new NotesService();