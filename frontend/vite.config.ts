import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true, // listen on IPv4 and IPv6 so both localhost and 127.0.0.1 work
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } },
  },
})
