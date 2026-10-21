import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development, API calls are forwarded to the FastAPI server.
// Its port comes from APP_PORT in the project-root .env (costing/.env).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = env.APP_PORT || '8000';
  return {
    plugins: [react()],
    envDir: '..',
    // Built into the backend so the FastAPI server serves it; committed, so other
    // machines need only uv (no Node) to run the app.
    build: { outDir: '../backend/static', emptyOutDir: true },
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
