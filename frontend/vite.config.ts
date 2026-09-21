import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 18930,
    proxy: {
      '/api': 'http://localhost:19930',
    },
  },
});
