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
    },
    proxy: {
      '/cors-proxy': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cors-proxy/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Remove origin header so Nvidia doesn't complain
            proxyReq.removeHeader('origin');
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Manually inject CORS headers back to the browser
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
            res.setHeader('Access-Control-Allow-Headers', '*');
          });
        }
      }
    }
  }
});
