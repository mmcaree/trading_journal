import { API_URL } from './apiConfig';

export interface ImageUploadResponse {
  success: boolean;
  image_url: string;
  filename: string;
}

export interface ChartResponse {
  success: boolean;
  chart_id?: number;
  message: string;
}

export interface ChartsResponse {
  success: boolean;
  charts: PositionChart[];
}

export interface PositionChart {
  id: number;
  image_url: string;
  description: string;
  timeframe: string;
  created_at: string;
}

export interface NotesUpdateResponse {
  success: boolean;
  message: string;
  notes: string | null;
  lessons: string | null;
  mistakes: string | null;
}

class PositionImageService {
  private baseUrl = `${API_URL}/api/position-images`;

  async uploadImage(file: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Failed to upload image';
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Convert relative URL to absolute URL only if it's a local path
    if (result.image_url && result.image_url.startsWith('/')) {
      result.image_url = `${API_URL}${result.image_url}`;
    }
    // Cloudinary URLs are already absolute, so we don't need to modify them
    
    return result;
  }

  async addPositionChart(
    positionId: number, 
    imageUrl: string, 
    description: string = '', 
    timeframe: string = ''
  ): Promise<ChartResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/position/${positionId}/charts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        description,
        timeframe
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to add chart';
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

  async getPositionCharts(positionId: number): Promise<ChartsResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/position/${positionId}/charts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get charts');
    }

    return response.json();
  }

  async updatePositionNotes(
    positionId: number,
    notes: string = '',
    lessons: string = '',
    mistakes: string = ''
  ): Promise<NotesUpdateResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/position/${positionId}/notes`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notes,
        lessons,
        mistakes
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to update notes';
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

  async deleteChart(chartId: number): Promise<ChartResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/chart/${chartId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete chart');
    }

    return response.json();
  }
}

export const positionImageService = new PositionImageService();