import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-прокси на сервер (Express + Socket.io), см. TDD §3.2/§12.2.
const SERVER_PORT = process.env.SERVER_PORT || 3001;
const SERVER_TARGET = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    // 127.0.0.1 явно (а не только IPv6 ::1) — избегаем сюрпризов dual-stack на Windows.
    host: '127.0.0.1',
    proxy: {
      '/socket.io': {
        target: SERVER_TARGET,
        ws: true,
      },
      '/healthz': {
        target: SERVER_TARGET,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
