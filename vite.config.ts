import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'logo.svg', 'apple-touch-icon.png', 'logo-192.png', 'logo-512.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      workbox: {
        // Keep the app shell + fonts cached; never cache Supabase API data
        globPatterns: ['**/*.{js,css,html,svg,png,woff}'],
      },
      manifest: {
        name: 'Soran Hookah Shop',
        short_name: 'Soran POS',
        description: 'Soran Hookah Shop — نێرگەلە و پێداویستییەکانی نێرگەلە',
        theme_color: '#4f46e5',
        background_color: '#1e1b4b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 700,
  },
})
