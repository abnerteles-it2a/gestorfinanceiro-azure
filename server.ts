import express from 'express';
import cors from 'cors';
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
console.log('--- Azure Cloud-Native Stack Status ---');
console.log('DATABASE_URL:', checkEnv('DATABASE_URL') === 'OK' || checkEnv('NEON_DATABASE_URL') === 'OK' ? 'OK' : 'MISSING');
console.log('JWT_SECRET:', checkEnv('JWT_SECRET') === 'OK' || checkEnv('NEON_AUTH_SECRET') === 'OK' ? 'OK' : 'MISSING');
console.log('AZURE_OPENAI_ENDPOINT:', checkEnv('AZURE_OPENAI_ENDPOINT'));
console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', checkEnv('AZURE_OPENAI_DEPLOYMENT_NAME'));
console.log('AZURE_OPENAI_API_KEY:', checkEnv('AZURE_OPENAI_API_KEY'));
console.log('COMMUNICATION_SERVICES:', checkEnv('COMMUNICATION_SERVICES_CONNECTION_STRING'));
console.log('AZURE_EMAIL_SENDER:', checkEnv('AZURE_EMAIL_SENDER'));
console.log('ASAAS_API_KEY:', checkEnv('ASAAS_API_KEY'));
console.log('---------------------------------------');

const app = express();
app.disable('x-powered-by');

// Security Headers Guardrails
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS Guardrail
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// In-Memory Rate Limiting Guardrail (Lightweight, zero-overhead, highly performant)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits.entries()) {
    if (v.resetAt < now) rateLimits.delete(k);
  }
}, 60000);

const rateLimiter = (req: any, res: any, next: any) => {
  const path = req.path || '';
  if (!path.startsWith('/api')) return next();

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const isAuth = path.includes('/api/neon-auth/');
  const isAi = path.includes('/api/ai/');

  // Calibrated limits: tight for auth (15/min), comfortable for AI (60/min), generous for general API (300/min)
  const maxRequests = isAuth ? 15 : (isAi ? 60 : 300);
  const key = `${ip}:${isAuth ? 'auth' : (isAi ? 'ai' : 'general')}`;
  
  let record = rateLimits.get(key);
  if (!record || record.resetAt < now) {
    record = { count: 1, resetAt: now + 60000 };
    rateLimits.set(key, record);
    return next();
  }

  record.count += 1;
  if (record.count > maxRequests) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', '60');
    return res.end(JSON.stringify({
      error: 'too_many_requests',
      message: isAuth 
        ? 'Muitas tentativas de autenticação. Por favor, aguarde 1 minuto.' 
        : 'Limite de requisições excedido temporariamente. Tente novamente em breve.'
    }));
  }

  next();
};
app.use(rateLimiter);

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
