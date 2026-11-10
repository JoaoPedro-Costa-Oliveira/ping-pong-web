import { createGameServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3001);

const { httpServer } = createGameServer();

httpServer.listen(PORT, () => {
  console.log(`Pong server rodando em http://localhost:${PORT}`);
});
