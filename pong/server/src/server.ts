import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import type {
  Ack,
  ClientToServerEvents,
  Direction,
  JoinedPayload,
  ServerToClientEvents,
} from "./protocol.js";
import type { Room, Slot } from "./room.js";
import { normalizeCode, RoomManager, sanitizeName } from "./roomManager.js";

interface SocketData {
  code?: string;
  playerId?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServer {
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  manager: RoomManager;
  close(): Promise<void>;
}

export function createGameServer(): GameServer {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? "*" },
  });

  const manager = new RoomManager({
    info: (code, info) => io.to(code).emit("room:info", info),
    snapshot: (code, snapshot) => io.to(code).emit("game:state", snapshot),
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", rooms: manager.size });
  });

  // Em produção o próprio servidor entrega o front-end compilado
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  io.on("connection", (socket: GameSocket) => {
    const currentContext = (): { room: Room; slot: Slot } | null => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return null;
      const room = manager.get(code);
      const slot = room?.findSlot(playerId);
      if (!room || !slot || slot.socketId !== socket.id) return null;
      return { room, slot };
    };

    const detach = (): void => {
      const context = currentContext();
      if (context) {
        context.room.leave(context.slot.side);
        void socket.leave(context.room.code);
      }
      socket.data.code = undefined;
      socket.data.playerId = undefined;
    };

    const attach = (room: Room, slot: Slot): JoinedPayload => {
      socket.data.code = room.code;
      socket.data.playerId = slot.playerId;
      void socket.join(room.code);
      return { code: room.code, playerId: slot.playerId, side: slot.side };
    };

    socket.on("room:create", (payload, ack) => {
      if (typeof ack !== "function") return;
      const name = sanitizeName(payload?.name);
      if (!name) return ack({ ok: false, error: "INVALID_NAME" } satisfies Ack<JoinedPayload>);

      detach();
      const room = manager.create();
      void socket.join(room.code);
      const slot = room.addPlayer(name, socket.id);
      ack({ ok: true, data: attach(room, slot) });
      room.emitInfo();
      room.emitSnapshot();
    });

    socket.on("room:join", (payload, ack) => {
      if (typeof ack !== "function") return;
      const name = sanitizeName(payload?.name);
      if (!name) return ack({ ok: false, error: "INVALID_NAME" });
      const code = normalizeCode(payload?.code);
      if (!code) return ack({ ok: false, error: "INVALID_CODE" });

      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: "ROOM_NOT_FOUND" });
      const blocked = room.canJoin();
      if (blocked) return ack({ ok: false, error: blocked });

      detach();
      void socket.join(room.code);
      const slot = room.addPlayer(name, socket.id);
      ack({ ok: true, data: attach(room, slot) });
      room.emitInfo();
      room.emitSnapshot();
    });

    socket.on("room:rejoin", (payload, ack) => {
      if (typeof ack !== "function") return;
      const code = normalizeCode(payload?.code);
      if (!code || typeof payload?.playerId !== "string") return ack({ ok: false, error: "SESSION_EXPIRED" });

      const room = manager.get(code);
      const existing = room?.findSlot(payload.playerId);
      if (!room || !existing) return ack({ ok: false, error: "SESSION_EXPIRED" });

      const slot = room.reconnect(payload.playerId, socket.id);
      if (!slot) return ack({ ok: false, error: "SESSION_EXPIRED" });
      ack({ ok: true, data: attach(room, slot) });
      room.emitInfo();
      room.emitSnapshot();
    });

    socket.on("room:leave", detach);

    socket.on("player:input", (payload) => {
      const dir = payload?.dir;
      if (dir !== -1 && dir !== 0 && dir !== 1) return;
      const context = currentContext();
      context?.room.input(context.slot.side, dir as Direction);
    });

    socket.on("player:serve", () => {
      const context = currentContext();
      context?.room.serve(context.slot.side);
    });

    socket.on("player:rematch", () => {
      const context = currentContext();
      context?.room.requestRematch(context.slot.side);
    });

    socket.on("disconnect", () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return;
      const room = manager.get(code);
      const slot = room?.findSlot(playerId);
      if (room && slot) room.disconnect(slot, socket.id);
    });
  });

  return {
    httpServer,
    io,
    manager,
    close: () =>
      new Promise<void>((resolve) => {
        void io.close(() => resolve());
      }),
  };
}
