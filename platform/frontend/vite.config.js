import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api 代理到后端（后端网关默认 8000；开发联调用 8010 由 VITE_API_PROXY 覆盖）
const target = process.env.VITE_API_PROXY || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target,
        changeOrigin: true,
      },
    },
  },
});