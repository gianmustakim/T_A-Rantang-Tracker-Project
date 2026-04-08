import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Forward Chaining Rules
  const RULES = [
    { current: 'Di Dapur (Bersih)', action: 'Isi Makanan', next: 'Siap Dikirim' },
    { current: 'Siap Dikirim', action: 'Scan oleh Kurir', next: 'Dalam Perjalanan' },
    { current: 'Dalam Perjalanan', action: 'Diterima Pelanggan', next: 'Di Pelanggan' },
    { current: 'Di Pelanggan', action: 'Diambil Kurir', next: 'Penarikan Kotor' },
    { current: 'Penarikan Kotor', action: 'Tiba di Dapur', next: 'Proses Cuci' },
    { current: 'Proses Cuci', action: 'Selesai Dicuci', next: 'Di Dapur (Bersih)' },
  ];

  // Forward Chaining Engine API
  app.post("/api/forward-chaining", (req, res) => {
    const { currentStatus, action } = req.body;
    
    if (!currentStatus || !action) {
      return res.status(400).json({ error: "Missing currentStatus or action" });
    }

    const rule = RULES.find(r => r.current === currentStatus && r.action === action);

    if (rule) {
      res.json({ success: true, nextStatus: rule.next });
    } else {
      res.status(400).json({ 
        success: false, 
        error: `Invalid transition: Action '${action}' is not allowed for status '${currentStatus}'` 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // SPA Fallback for dev
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api/')) return next();
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
