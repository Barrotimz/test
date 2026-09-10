import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/dex": {
        target: "https://api.dexscreener.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dex/, ""),
      },
      "/gecko": {
        target: "https://api.geckoterminal.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gecko/, ""),
      },
      "/rug": {
        target: "https://api.rugcheck.xyz",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rug/, ""),
      },
      "/goplus": {
        target: "https://api.gopluslabs.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/goplus/, ""),
      },
      "/fx": {
        target: "https://api.fxtwitter.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fx/, ""),
      },
    },
  },
});
