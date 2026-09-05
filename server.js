import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handler(req, res);
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
server.listen(process.env.PORT || 3000, () => console.log(`CinemaBooking running at http://localhost:${process.env.PORT || 3000}`));
