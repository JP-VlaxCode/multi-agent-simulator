import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/task': 'http://localhost:3010',
      '/health': 'http://localhost:3010',
      '/memory': 'http://localhost:3010',
      '/memory/graph-data': 'http://localhost:3010',
    },
  },
})
