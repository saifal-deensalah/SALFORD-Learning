import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import local from '../frontend/src/services/local-config.json' with {type: 'json'};
export default defineConfig({
  plugins: [react()], base: '/admin/',
  server: { host: '127.0.0.1', port: local.adminPort, strictPort: true,
    proxy: { '/v1': `http://127.0.0.1:${local.apiPort}` } },
});
