import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  server: { port: 8080, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
    // 遊戲本體之外，模型展示頁也一起輸出（/showcase.html）。
    rolldownOptions: {
      input: {
        main: "index.html",
        showcase: "showcase.html",
      },
    },
  },
});
