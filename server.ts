import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple env loader to ensure variables are present in production/start mode
const loadEnv = (file: string) => {
  const p = path.resolve(process.cwd(), file);
  if (fs.existsSync(p)) {
    console.log(`Loading env from ${file}`);
    const content = fs.readFileSync(p, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
       const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
       if (m) {
         const k = m[1];
         let v = m[2].trim();
         if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('`') && v.endsWith('`'))) {
            v = v.slice(1, -1);
         }
         if (!process.env[k]) process.env[k] = v;
       }
    }
  }
};

loadEnv('.env');
loadEnv('.env.local');

// Log environment status (safe)
const checkEnv = (key: string) => process.env[key] ? 'OK' : 'MISSING';
console.log('--- Environment Check ---');
console.log('NEON_DATABASE_URL:', checkEnv('NEON_DATABASE_URL'));
console.log('NEON_AUTH_SECRET:', checkEnv('NEON_AUTH_SECRET'));
console.log('GOOGLE_CLOUD_PROJECT:', checkEnv('GOOGLE_CLOUD_PROJECT'));
console.log('GOOGLE_CREDENTIALS_JSON:', checkEnv('GOOGLE_CREDENTIALS_JSON'));
console.log('VITE_SUPABASE_URL:', checkEnv('VITE_SUPABASE_URL'));
console.log('SES_REGION:', checkEnv('SES_REGION'));
console.log('SES_SENDER:', checkEnv('SES_SENDER'));
console.log('SES_ACCESS_KEY_ID:', checkEnv('SES_ACCESS_KEY_ID'), 'FALLBACK:', checkEnv('ACCESS_KEY_ID'));
console.log('SES_SECRET_ACCESS_KEY:', checkEnv('SES_SECRET_ACCESS_KEY'), 'FALLBACK:', checkEnv('SECRET_ACCESS_KEY'));
console.log('-------------------------');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to log requests
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[Server] ${req.method} ${req.url} - Started`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Server] ${req.method} ${req.url} - Finished in ${duration}ms (Status: ${res.statusCode})`);
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      const duration = Date.now() - start;
      console.log(`[Server] ${req.method} ${req.url} - Aborted after ${duration}ms`);
    }
  });
  next();
});

// Load API routes using Vite's import.meta.glob
// This will be replaced by the actual modules during the Vite build
const apiRoutes = import.meta.glob('./api/**/*.ts', { eager: true });

Object.entries(apiRoutes).forEach(([filePath, module]: [string, any]) => {
  // filePath is relative to the current file, e.g., "./api/foo.ts"
  // We want to map it to "/api/foo"
  let routePath = filePath.replace(/^\./, '').replace(/\.ts$/, '');
  
  // Handle specific cases if needed, e.g., index files (though not present in the list)
  if (routePath.endsWith('/index')) {
    routePath = routePath.slice(0, -6);
  }

  const handler = module.default;
  if (typeof handler === 'function') {
    console.log(`Setting up route: ${routePath}`);
    // Use app.all to handle all HTTP methods for this route, passing it to the handler
    app.all(routePath, async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        console.error(`Error in ${routePath}:`, err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      }
    });
  }
});

// Serve static files from the client build directory
// We assume the frontend is built to 'client' subdirectory inside the dist folder
app.use(express.static(path.join(__dirname, 'client')));

// SPA fallback: serve index.html for any unknown routes
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
