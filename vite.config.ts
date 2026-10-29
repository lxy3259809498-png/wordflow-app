import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves from /<repo>/, so the asset base must match. Set
  // VITE_BASE=/repo-name/ at build time; everything else (local dev, Netlify,
  // Cloudflare Pages, a custom domain at the root) uses '/'.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'WordFlow — 英语背单词',
        short_name: 'WordFlow',
        description: '以主动回忆和间隔复习为核心的本地优先英语背单词工具',
        lang: 'zh-CN',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f6f2',
        theme_color: '#6d5efc',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the shell only. The eight exam decks are ~4.7 MB of word
        // data: precaching them would force every first visit to download the
        // entire vocabulary, defeating the on-demand import() in
        // seedDecks.generated.ts. They are cached at runtime once opened.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: [
          '**/assets/zk-core-*.js',
          '**/assets/gk-core-*.js',
          '**/assets/cet4-full-*.js',
          '**/assets/cet6-full-*.js',
          '**/assets/kaoyan-full-*.js',
          '**/assets/ielts-full-*.js',
          '**/assets/toefl-full-*.js',
          '**/assets/gre-full-*.js',
        ],
        runtimeCaching: [
          {
            // Deck chunks: cached on first use so a studied deck works offline.
            urlPattern: /\/assets\/(zk-core|gk-core|cet4-full|cet6-full|kaoyan-full|ielts-full|toefl-full|gre-full)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wordflow-decks',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Online dictionary audio: cache so repeated plays work offline.
            urlPattern: /^https:\/\/dict\.youdao\.com\/dictvoice/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wordflow-audio',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind all interfaces so a phone on the same Wi-Fi can reach the dev server.
    // `localhost` on a phone resolves to the phone itself, not this machine.
    host: true,
    // Vite blocks unknown Host headers by default (DNS-rebinding protection).
    // The LAN IP is stable here, but allowing it explicitly avoids a confusing
    // "Blocked request" page when the router hands out a different address.
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
