import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "rendering", test: /node_modules[\\/]zrender[\\/]/, priority: 20 },
            { name: "charts", test: /node_modules[\\/]echarts[\\/]/, priority: 10, maxSize: 700000 },
          ],
        },
      },
    },
  },
});
