import { defineConfig } from 'vite';

export default defineConfig({
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    // Tauri expects a fixed port, fail if that port is not available
    port: 5173,
    strictPort: true,
    host: true,
    watch: {
      // Tell Vite to ignore watching the src-tauri folder,
      // avoiding EBUSY errors on rapidly changing Rust build files
      ignored: ['**/src-tauri/**']
    }
    // Note: the /cors-proxy block for Nvidia was removed.
    // All LLM API calls (including Nvidia NIM) are now routed through the
    // Rust perform_http_request command which bypasses CORS entirely.
  }
});
