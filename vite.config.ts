import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/target/**", "**/src-tauri/gen/**"] },
  },
  clearScreen: false,
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/framer-motion/") ||
            id.includes("/motion-dom/") ||
            id.includes("/motion-utils/")
          )
            return "motion";
          if (id.includes("/@base-ui/")) return "base-ui";
          if (id.includes("/@xterm/")) return "terminal";
          if (id.includes("/radix-ui/") || id.includes("/@radix-ui/"))
            return "primitives";
        },
      },
    },
  },
});
