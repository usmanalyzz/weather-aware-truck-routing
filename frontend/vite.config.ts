/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // MapLibre is most of the bundle; a separate chunk caches independently of app code.
        manualChunks: { maplibre: ['maplibre-gl'], vendor: ['react', 'react-dom', '@tanstack/react-query'] },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
