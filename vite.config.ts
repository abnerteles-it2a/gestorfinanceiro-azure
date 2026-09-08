import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import https from 'https';
import http from 'http';
import express from 'express';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    if (env.NEON_DATABASE_URL) process.env.NEON_DATABASE_URL = env.NEON_DATABASE_URL;
    if (env.NEON_AUTH_SECRET) process.env.NEON_AUTH_SECRET = env.NEON_AUTH_SECRET;
    if (env.STACK_SECRET_SERVER_KEY) process.env.STACK_SECRET_SERVER_KEY = env.STACK_SECRET_SERVER_KEY;
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
    if (env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;
    
    const port = Number(env.VITE_PORT || process.env.VITE_PORT || 3000);
    const host = env.VITE_HOST || process.env.VITE_HOST || '0.0.0.0';
    const apiTarget = env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || 'https://gestorfinanceiro.it2a.com';
    return {
      build: {
        outDir: 'dist/client',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'charts': ['recharts']
            }
          }
        }
      },
      server: {
        port: port,
        host: host,
        proxy: {
          // NOTE: /api routes are handled locally by the local-api-router plugin below.
          // Only non-API proxy routes (e.g. /proxy/*) need external forwarding.
          '/proxy': { target: apiTarget, changeOrigin: true, secure: false }
        }
      },
      plugins: [
        {
          name: 'env-bridge',
          configureServer() {
            try {
              if (env.NEON_DATABASE_URL) process.env.NEON_DATABASE_URL = env.NEON_DATABASE_URL;
              if (env.NEON_AUTH_SECRET) process.env.NEON_AUTH_SECRET = env.NEON_AUTH_SECRET;
              if (env.STACK_SECRET_SERVER_KEY) process.env.STACK_SECRET_SERVER_KEY = env.STACK_SECRET_SERVER_KEY;
              if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
              if (env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;
              if (env.VITE_BLOB_READ_WRITE_TOKEN && !process.env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = env.VITE_BLOB_READ_WRITE_TOKEN;
              if (env.BRAPI_TOKEN && !process.env.BRAPI_TOKEN) process.env.BRAPI_TOKEN = env.BRAPI_TOKEN;
              if (env.DOCS_MAX_SIZE_BYTES && !process.env.DOCS_MAX_SIZE_BYTES) process.env.DOCS_MAX_SIZE_BYTES = env.DOCS_MAX_SIZE_BYTES;
              if (env.DOCS_RATE_LIMIT_HOURLY && !process.env.DOCS_RATE_LIMIT_HOURLY) process.env.DOCS_RATE_LIMIT_HOURLY = env.DOCS_RATE_LIMIT_HOURLY;
              if (env.DOCS_RATE_LIMIT_DAILY && !process.env.DOCS_RATE_LIMIT_DAILY) process.env.DOCS_RATE_LIMIT_DAILY = env.DOCS_RATE_LIMIT_DAILY;
              if (env.DEV_ALLOW_UNAUTH_UPLOAD && !process.env.DEV_ALLOW_UNAUTH_UPLOAD) process.env.DEV_ALLOW_UNAUTH_UPLOAD = env.DEV_ALLOW_UNAUTH_UPLOAD;
              if (env.NEON_SESSION_TTL_MINUTES && !process.env.NEON_SESSION_TTL_MINUTES) process.env.NEON_SESSION_TTL_MINUTES = env.NEON_SESSION_TTL_MINUTES;
              if (env.STACK_SESSION_TTL_MINUTES && !process.env.STACK_SESSION_TTL_MINUTES) process.env.STACK_SESSION_TTL_MINUTES = env.STACK_SESSION_TTL_MINUTES;
              if (env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY) process.env.GOOGLE_API_KEY = env.GOOGLE_API_KEY;
              if (env.GOOGLE_CLOUD_PROJECT && !process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = env.GOOGLE_CLOUD_PROJECT;
              if (env.GCLOUD_PROJECT && !process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = env.GCLOUD_PROJECT;
              if (env.GOOGLE_VERTEX_LOCATION && !process.env.GOOGLE_VERTEX_LOCATION) process.env.GOOGLE_VERTEX_LOCATION = env.GOOGLE_VERTEX_LOCATION;
              if (env.GOOGLE_VERTEX_MODEL && !process.env.GOOGLE_VERTEX_MODEL) process.env.GOOGLE_VERTEX_MODEL = env.GOOGLE_VERTEX_MODEL;
              if (env.GOOGLE_CLIENT_EMAIL && !process.env.GOOGLE_CLIENT_EMAIL) process.env.GOOGLE_CLIENT_EMAIL = env.GOOGLE_CLIENT_EMAIL;
              if (env.GOOGLE_PRIVATE_KEY && !process.env.GOOGLE_PRIVATE_KEY) process.env.GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY;
              if (env.GOOGLE_CREDENTIALS_JSON && !process.env.GOOGLE_CREDENTIALS_JSON) process.env.GOOGLE_CREDENTIALS_JSON = env.GOOGLE_CREDENTIALS_JSON;
              if (env.AWS_ACCESS_KEY_ID && !process.env.AWS_ACCESS_KEY_ID) process.env.AWS_ACCESS_KEY_ID = env.AWS_ACCESS_KEY_ID;
              if (env.AWS_SECRET_ACCESS_KEY && !process.env.AWS_SECRET_ACCESS_KEY) process.env.AWS_SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY;
              if (env.AWS_REGION && !process.env.AWS_REGION) process.env.AWS_REGION = env.AWS_REGION;
              if (env.ACCESS_KEY_ID && !process.env.ACCESS_KEY_ID) process.env.ACCESS_KEY_ID = env.ACCESS_KEY_ID;
              if (env.SECRET_ACCESS_KEY && !process.env.SECRET_ACCESS_KEY) process.env.SECRET_ACCESS_KEY = env.SECRET_ACCESS_KEY;
              if (env.REGION && !process.env.REGION) process.env.REGION = env.REGION;
              
              console.log('--- Vite Environment Bridge ---');
              console.log('NEON_DATABASE_URL:', process.env.NEON_DATABASE_URL ? 'OK' : 'MISSING');
              console.log('GOOGLE_CREDENTIALS_JSON:', process.env.GOOGLE_CREDENTIALS_JSON ? 'OK' : 'MISSING');
              console.log('-------------------------------');
            } catch {}
          }
        },
        react(),
        tailwindcss(),
        {
          name: 'local-api-router',
          configureServer(server) {
            // Use standard express JSON parser for API requests handled locally (NOT proxied)
            const expressJson = express.json({ limit: '10mb' });
            
            server.middlewares.use(async (req, res, next) => {
              const url = req.url || '';
              if (!url.startsWith('/api/')) return next();
              
              const u = new URL(url, 'http://localhost');
              const pathname = u.pathname;

              // In dev mode, ALL /api/* routes are handled locally via ssrLoadModule.
              // There is no separate backend process running on port 3011.
              // skipPrefixes is intentionally empty to allow all routes to be resolved locally.
              
              // Only parse body for routes handled locally (not proxied)
              if (req.method === 'POST' || req.method === 'PUT') {
                await new Promise((resolve) => {
                  expressJson(req as any, res as any, resolve);
                });
              }

              const tsPath = path.resolve(process.cwd(), '.' + pathname + '.ts');
              const jsPath = path.resolve(process.cwd(), '.' + pathname + '.js');
              const candidates = [`/@fs/${tsPath}`, `/@fs/${jsPath}`];
              
              console.log(`[Router] Attempting to load: ${pathname} (${req.method})`);
              for (const id of candidates) {
                try {
                  const mod: any = await server.ssrLoadModule(id);
                  if (mod.default) {
                    console.log(`[Router] Loaded and executing: ${pathname}`);
                    await mod.default(req, res);
                    return;
                  }
                } catch (e: any) {
                  if (e.code !== 'ENOENT') {
                    console.error(`[Router] Error loading ${id}:`, e);
                  }
                }
              }
              
              console.warn(`[Router] No handler found for ${pathname} — returning 404`);
              res.statusCode = 404;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'not_found', path: pathname }));
            });
          }
        },
      ],
      define: {
        '__APP_SUPABASE_URL__': JSON.stringify(
          env.VITE_SUPABASE_URL
          || env.NEXT_PUBLIC_SUPABASE_URL
          || process.env.VITE_SUPABASE_URL
          || process.env.NEXT_PUBLIC_SUPABASE_URL
          || process.env.SUPABASE_URL
          || ''
        ),
        '__APP_SUPABASE_ANON_KEY__': JSON.stringify(
          env.VITE_SUPABASE_ANON_KEY
          || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          || process.env.VITE_SUPABASE_ANON_KEY
          || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          || process.env.SUPABASE_ANON_KEY
          || ''
        )
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
