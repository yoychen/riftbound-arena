import { mkdir, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ["index.html", "src", "vendor"]) {
  await cp(path.join(root, name), path.join(out, name), { recursive: true });
}
console.log("Built dist/ (static ES modules; no bundling or minification).");
