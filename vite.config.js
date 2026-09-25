import { defineConfig } from "vite";
import { attachRooms } from "./server/rooms.js";

// Online rooms run on the same port as the dev server (WebSocket at /ws).
const rooms = () => ({
  name: 'boomtown-rooms',
  configureServer(server) { if (server.httpServer) attachRooms(server.httpServer, { log: (m) => console.log(`[rooms] ${m}`) }); },
  configurePreviewServer(server) { if (server.httpServer) attachRooms(server.httpServer); },
});

// Hostnames allowed to reach the dev/preview server (raw IPs and localhost are always allowed).
const allowedHosts = ['furwipe.com', 'www.furwipe.com'];

export default defineConfig({
  plugins: [rooms()],
  // Port 80 so the game is at http://furwipe.com with no port in the URL.
  // strictPort: fail loudly if 80 is taken instead of silently moving to 81.
  // Override with the PORT environment variable.
  server: { port: Number(process.env.PORT) || 80, strictPort: true, host: true, allowedHosts, open: false },
  preview: { host: true, allowedHosts },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
