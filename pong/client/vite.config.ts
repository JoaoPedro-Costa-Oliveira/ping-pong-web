import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O proxy mantém o cliente e o WebSocket na mesma origem (funciona também em outros computadores da rede)
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
});
