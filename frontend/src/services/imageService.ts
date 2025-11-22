import { API_URL } from './apiConfig';
import {
  ImageUploadResponse,
  ImageUpdateResponse
} from '../types/api';

// Re-export types for backward compatibility
export type { ImageUploadResponse, ImageUpdateResponse };

class ImageService {
  private baseUrl = `${API_URL}/api/images`;

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
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload image');
    }

    const result = await response.json();
    
    // Convert relative URL to absolute URL only if it's a local path
    if (result.image_url && result.image_url.startsWith('/')) {
      result.image_url = `${API_URL}${result.image_url}`;
    }
    // Cloudinary URLs are already absolute, so we don't need to modify them
    
    return result;
  }

  async updateTradeImages(tradeId: number, imageUrls: string[]): Promise<ImageUpdateResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/trade/${tradeId}/images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(imageUrls),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update trade images');
    }

    return response.json();
  }

  async clearTradeImages(tradeId: number): Promise<ImageUpdateResponse> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseUrl}/trade/${tradeId}/images`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to clear trade images');
    }

    return response.json();
  }
}

export const imageService = new ImageService();