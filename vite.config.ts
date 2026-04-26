import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // When running `npm run cf:dev`, wrangler proxies /api/* to functions/.
    // For pure `npm run dev`, you can either run wrangler in parallel
    // or wire a proxy to localhost:8788 here. cf:dev is the recommended path.
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
