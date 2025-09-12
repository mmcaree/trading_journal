FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Make sure vite.config.ts is properly configured
RUN echo 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    host: "0.0.0.0",\n    port: 5173,\n    strictPort: true,\n    watch: {\n      usePolling: true,\n    },\n  },\n});' > vite.config.ts

# Ensure development server uses 0.0.0.0 as host
ENV VITE_HOST=0.0.0.0

EXPOSE 5173

# Use --host flag explicitly
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
