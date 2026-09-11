import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 8080, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.{js,ts}"],
    environment: "node",
  },
});
