import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ClientToServerEvents,
  Direction,
  GameSnapshot,
  JoinedPayload,
  RoomInfo,
  ServerToClientEvents,
} from "../../../server/src/protocol";
import { ERROR_MESSAGES } from "../messages";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = "pong:session";

function loadSession(): JoinedPayload | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as JoinedPayload) : null;
  } catch {
    return null;
  }
}

function saveSession(session: JoinedPayload | null): void {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

export interface GameConnection {
  connected: boolean;
  session: JoinedPayload | null;
  room: RoomInfo | null;
  snapshot: GameSnapshot | null;
  error: string | null;
  busy: boolean;
  createRoom(name: string): void;
  joinRoom(name: string, code: string): void;
  leaveRoom(): void;
  sendInput(dir: Direction): void;
  serve(): void;
  rematch(): void;
  clearError(): void;
}

/*
 * Única ponte entre a interface e o servidor.
 * O front-end não calcula nada do jogo: apenas envia comandos (entrada, saque, revanche)
 * e exibe o estado que o servidor devolve.
 */
export function useGame(): GameConnection {
  const socketRef = useRef<GameSocket | null>(null);
  const sessionRef = useRef<JoinedPayload | null>(loadSession());

  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<JoinedPayload | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applySession = useCallback((next: JoinedPayload | null) => {
    sessionRef.current = next;
    saveSession(next);
    setSession(next);
    if (!next) {
      setRoom(null);
      setSnapshot(null);
    }
  }, []);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    const socket: GameSocket = serverUrl ? io(serverUrl) : io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const saved = sessionRef.current;
      if (saved) {
        socket.emit("room:rejoin", { code: saved.code, playerId: saved.playerId }, (res) => {
          if (res.ok) applySession(res.data);
          else {
            applySession(null);
            setError(ERROR_MESSAGES[res.error]);
          }
        });
      }
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setBusy(false);
    });
    socket.on("room:info", setRoom);
    socket.on("game:state", setSnapshot);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applySession]);

  const handleAck = useCallback(
    (res: Ack<JoinedPayload>) => {
      setBusy(false);
      if (res.ok) {
        setError(null);
        applySession(res.data);
      } else {
        setError(ERROR_MESSAGES[res.error]);
      }
    },
    [applySession],
  );

  const createRoom = useCallback(
    (name: string) => {
      setBusy(true);
      socketRef.current?.emit("room:create", { name }, handleAck);
    },
    [handleAck],
  );

  const joinRoom = useCallback(
    (name: string, code: string) => {
      setBusy(true);
      socketRef.current?.emit("room:join", { name, code }, handleAck);
    },
    [handleAck],
  );

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("room:leave");
    applySession(null);
  }, [applySession]);

  const sendInput = useCallback((dir: Direction) => {
    if (socketRef.current?.connected) socketRef.current.emit("player:input", { dir });
  }, []);

  const serve = useCallback(() => {
    if (socketRef.current?.connected) socketRef.current.emit("player:serve");
  }, []);
  const rematch = useCallback(() => {
    if (socketRef.current?.connected) socketRef.current.emit("player:rematch");
  }, []);
  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
    session,
    room,
    snapshot,
    error,
    busy,
    createRoom,
    joinRoom,
    leaveRoom,
    sendInput,
    serve,
    rematch,
    clearError,
  };
}
