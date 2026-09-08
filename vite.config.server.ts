import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    ssr: true,
    copyPublicDir: false,
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: false, // Don't empty, as client build might run first or parallel
    rollupOptions: {
      input: 'server.ts',
      output: {
        entryFileNames: 'server.js',
        format: 'es',
      },
      external: [
        'express',
        'pg',
        'bcryptjs',
        'jose',
        'cors',
        '@google-cloud/vertexai',
        '@google/genai',
        '@vercel/blob',
        '@aws-sdk/client-s3',
        '@aws-sdk/s3-request-presigner',
        '@aws-sdk/client-ses',
        // Externalize built-ins
        'path',
        'fs',
        'http',
        'https',
        'url',
        'crypto',
        'stream',
        'util',
        'events'
      ]
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
