"use strict";
/**
 * server.js — Japa Session Tool Dev Server
 *
 * Serves the `public/` directory at http://localhost:3000
 * Also exposes GET /api/images (lists NRJD_Pics) and
 * auto-generates public/image-list.json on start so that
 * Capacitor APK builds always have a current image index.
 *
 * Run: node server.js
 * Generate list only: node server.js --gen
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public"); // webDir = public
const IMG_DIR = path.join(ROOT, "NRJD_Pics");
const IMG_JSON = path.join(ROOT, "image-list.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/* ─── Helpers ─────────────────────────────────────────── */

/**
 * Read NRJD_Pics and return sorted list of image filenames.
 * Returns [] if the directory does not exist.
 */
function listImages() {
  try {
    return fs
      .readdirSync(IMG_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

/**
 * Write public/image-list.json so Capacitor APK builds
 * always have a bundled image index without a server.
 */
function generateImageList() {
  const files = listImages();

  // Ensure public/ exists (safety)
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

  fs.writeFileSync(IMG_JSON, JSON.stringify(files, null, 2), "utf8");
  console.log(`📋 image-list.json written → ${files.length} image(s)`);
  return files;
}

/* ─── Generate-only mode ─────────────────────────────── */
if (process.argv.includes("--gen") || process.argv.includes("--generate")) {
  generateImageList();
  process.exit(0);
}

/* ─── Auto-generate on startup ───────────────────────── */
generateImageList();

// Also ensure NRJD_Pics dir exists for first-time setup
if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  console.log(`📁 Created NRJD_Pics/ inside public/ — add images here`);
}

/* ─── HTTP Server ─────────────────────────────────────── */
const server = http.createServer((req, res) => {
  // Decode and strip query string
  const rawUrl = decodeURIComponent(req.url.split("?")[0]);

  /* ── CORS headers (useful for local dev on different ports) */
  res.setHeader("Access-Control-Allow-Origin", "*");

  /* ── API: list images ─────────────────────────────────── */
  if (rawUrl === "/api/images") {
    const files = listImages();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return;
  }

  /* ── API: regenerate image list (POST /api/refresh) ────── */
  if (rawUrl === "/api/refresh" && req.method === "POST") {
    const files = generateImageList();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: files.length }));
    return;
  }

  /* ── Static file serving ──────────────────────────────── */
  const relPath = rawUrl === "/" ? "index.html" : rawUrl.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(ROOT, relPath));

  // Security: reject directory traversal outside ROOT
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  // Resolve directories → index.html
  let target = filePath;
  try {
    if (fs.statSync(target).isDirectory()) {
      target = path.join(target, "index.html");
    }
  } catch {}

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(target, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Server Error");
      }
      return;
    }

    // Add cache headers: no-cache for HTML/JSON, 1-hour for images/assets
    const cacheControl = [".html", ".json"].includes(ext)
      ? "no-cache"
      : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const line = "─".repeat(50);
  console.log(`\n${line}`);
  console.log(`🔔  Japa Session Tool`);
  console.log(`${line}`);
  console.log(`    URL   : http://localhost:${PORT}`);
  console.log(`    Root  : ${ROOT}`);
  console.log(`    Images: ${IMG_DIR}`);
  console.log(`${line}`);
  console.log(`    Keyboard shortcuts:`);
  console.log(`      Space / Enter  →  Start / Pause`);
  console.log(`      R              →  Reset`);
  console.log(`      N              →  Next participant (bell)`);
  console.log(`      S              →  Settings`);
  console.log(`      F              →  Fullscreen`);
  console.log(`      H              →  Hide / show controls`);
  console.log(`${line}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `❌  Port ${PORT} is already in use. Set PORT=XXXX to use another.`
    );
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
