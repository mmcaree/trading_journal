# Multi-stage build for Railway deployment
FROM python:3.12-slim as backend-builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build stage
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install ALL dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy frontend source
COPY frontend/ .

# For Railway deployment, we'll use relative URLs
ENV VITE_API_URL=""

# Build the frontend
RUN npm run build

# Verify build output exists
RUN ls -la dist/

# Final stage
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=backend-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy backend code
COPY backend/ ./backend/

# Create static directory
RUN mkdir -p ./backend/static

# Copy built frontend (Vite builds to 'dist' directory)
COPY --from=frontend-builder /app/frontend/dist/ ./backend/static/

# Verify static files were copied
RUN ls -la ./backend/static/

# Expose port
EXPOSE $PORT

# Start command
CMD ["sh", "-c", "cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT"]