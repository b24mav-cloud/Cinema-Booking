import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/index.js";
import { getSessionUser } from "./api/auth.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handler(req, res);
  if (req.url.startsWith("/admin")) {
    return getSessionUser(req, res).then(user => {
      if (!user) { res.statusCode = 302; res.setHeader("Location", "/signin.html?next=/admin.html"); return res.end(); }
      if (user.role !== "admin") { res.statusCode = 302; res.setHeader("Location", "/signin.html?error=not-authorized"); return res.end(); }
      return serveStatic(req, res);
    });
  }
  if (req.url.startsWith("/account")) {
    return getSessionUser(req, res).then(user => {
      if (!user) { res.statusCode = 302; res.setHeader("Location", "/signin.html?next=/account.html"); return res.end(); }
      if (user.role !== "customer") { res.statusCode = 302; res.setHeader("Location", "/signin.html?error=not-authorized"); return res.end(); }
      return serveStatic(req, res);
    });
  }
  return serveStatic(req, res);
});
function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}
server.listen(process.env.PORT || 3000, () => console.log(`CinemaBooking running at http://localhost:${process.env.PORT || 3000}`));
