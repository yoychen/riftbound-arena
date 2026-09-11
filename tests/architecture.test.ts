import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const coreDir = new URL("../src/core/", import.meta.url).pathname;
const coreFiles = readdirSync(coreDir).filter((f: string) => f.endsWith(".ts"));

/**
 * 核心層的分層約束。
 *
 * 整個重構的前提是 core/ 不依賴 THREE 與 DOM —— 一旦有人隨手在裡面
 * import THREE 或呼叫 document，測試就得跟著搬進瀏覽器，這條線就守不住了。
 * 與其靠紀律，不如讓它在 CI 上直接紅掉。
 */
describe("核心層不依賴 THREE 與 DOM", () => {
  it("至少掃到預期數量的檔案（避免路徑錯誤讓測試空轉）", () => {
    expect(coreFiles.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of coreFiles) {
    const source = readFileSync(join(coreDir, file), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    it(`${file} 沒有 import 任何 render 層的東西`, () => {
      const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/three/i);
        expect(specifier.startsWith(".") || specifier.startsWith("node:")).toBe(
          true,
        );
      }
    });

    it(`${file} 沒有碰瀏覽器全域物件`, () => {
      for (const global of [
        "document",
        "window",
        "navigator",
        "localStorage",
        "requestAnimationFrame",
        "matchMedia",
      ])
        expect(code).not.toMatch(new RegExp(`\\b${global}\\b`));
    });
  }
});
