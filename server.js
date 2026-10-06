// Hog & Mug — local server.  Run with:  node server.js   (Node 18+, no packages needed)
// Serves the website from ./public and the API from lib/app.js.
// Data is saved to ./data/db.json, or to Upstash Redis if KV_REST_API_URL/TOKEN are set.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createHandler, countUsers, APP_VERSION, ADMIN_KEY, ADMIN_KEY_OK } = require("./lib/app");
const { pickStore } = require("./lib/store");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

if (!ADMIN_KEY_OK) {
  console.error("Refusing to start: set ADMIN_KEY to a secret of at least 12 characters in production.");
  process.exit(1);
}

const store = pickStore();
const handleApi = createHandler(store);

// ---------- Static files ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  // Don't reuse connections. Node closes idle keep-alive sockets after a few seconds,
  // and Safari sometimes sends a POST on a socket the server just closed, which shows
  // up in the browser as "Load failed" (e.g. after taking time to fill in the sign-up form).
  res.setHeader("Connection", "close");
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname.startsWith("/api/")) return await handleApi(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end("Method not allowed"); }
    serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); res.end('{"error":"Server error"}'); }
  }
});

// Keep the server running if something unexpected goes wrong in a request
process.on("uncaughtException", err => console.error("Unexpected error:", err));
process.on("unhandledRejection", err => console.error("Unexpected error:", err));

server.listen(PORT, async () => {
  console.log(`Hog & Mug v${APP_VERSION}`);
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`Sign up page:      http://localhost:${PORT}/#signup`);
  console.log(`Admin orders page: http://localhost:${PORT}/admin.html`);
  console.log(`Data stored in:    ${store.name}`);
  try { console.log(`Registered users:  ${await countUsers(store)}`); } catch (e) { console.error("Could not read data:", e.message); }
  if (ADMIN_KEY === "changeme") console.log('Warning: using default ADMIN_KEY "changeme". Set ADMIN_KEY env var.');
});
