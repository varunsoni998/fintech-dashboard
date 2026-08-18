import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/notion-api": {
        target: "https://api.notion.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/notion-api/, ""),
      },
    },
  },

  plugins: [
    react(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));