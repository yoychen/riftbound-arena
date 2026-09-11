import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const project = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const root = process.argv.includes("--dist")
  ? path.join(project, "dist")
  : project;
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const allowed =
        relative === "index.html" || /^(src|vendor)\//.test(relative);
      const filename = path.resolve(root, relative);
      if (
        !allowed ||
        relative.split("/").some((p) => p.startsWith(".")) ||
        !filename.startsWith(root + path.sep)
      ) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = await readFile(filename);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Riftbound: http://localhost:${port}`),
  );
