import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api 代理到后端（后端网关默认 8000；开发联调用 8010 由 VITE_API_PROXY 覆盖）
const target = process.env.VITE_API_PROXY || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  // 挂载在平台后端 /platform 路径下（后端 8000 同源托管，生产构建产物）
  base: "/platform/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target,
        changeOrigin: true,
      },
      // 应用运行时统一入口（点餐端/商家端）与 SDK 走后端，避免被平台 SPA 接管
      "/app": {
        target,
        changeOrigin: true,
      },
      "/app-sdk": {
        target,
        changeOrigin: true,
      },
    },
  },
});