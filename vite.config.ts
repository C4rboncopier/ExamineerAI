import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      '/omr': {
        target: 'http://localhost:5001',
        rewrite: path => path.replace(/^\/omr/, ''),
        changeOrigin: true,
      },
    },
  },
})
