// Serves the test/ folder over http on a free port (content scripts and image
// downloads behave differently on file:// pages).
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html", ".png": "image/png" };

export async function serve() {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/favicon.ico") return res.writeHead(204).end();
    const name = path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[/\\]+/, "") || "demo.html";
    try {
      const body = await readFile(path.join(root, name));
      res.setHeader("content-type", TYPES[path.extname(name)] || "application/octet-stream").end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}/`, close: () => server.close() };
}
