/*
 * Contrato de comunicação entre front-end e back-end.
 * Este arquivo contém APENAS tipos (sem código executável): o cliente o importa com `import type`.
 */

export type Side = "left" | "right";

/* Fase da sala, do ponto de vista dos jogadores */
export type Phase = "waiting" | "serving" | "playing" | "paused" | "finished";

export interface GameConfig {
  width: number;
  height: number;
  paddleWidth: number;
  paddleHeight: number;
  paddleMargin: number;
  ballRadius: number;
  pointsToWin: number;
  serveTimeoutSeconds: number;
}

export interface PlayerInfo {
  side: Side;
  name: string;
  connected: boolean;
  score: number;
}

/* Uma linha da tabela de pontos (inserida a cada ponto marcado) */
export interface PointRecord {
  number: number;
  scorer: Side;
  scorerName: string;
  left: number;
  right: number;
}

/* Uma linha da lista de eventos (as mais antigas são removidas) */
export interface LogEntry {
  id: number;
  text: string;
}

/* Dados "lentos": enviados somente quando algo muda na sala */
export interface RoomInfo {
  code: string;
  phase: Phase;
  players: PlayerInfo[];
  serving: Side | null;
  winner: Side | null;
  rematchVotes: Side[];
  history: PointRecord[];
  log: LogEntry[];
  config: GameConfig;
}

/* Dados "rápidos": enviados a cada tick do servidor (60 vezes por segundo) */
export interface GameSnapshot {
  phase: Phase;
  ball: { x: number; y: number };
  paddles: { left: number; right: number };
  scores: { left: number; right: number };
  serving: Side | null;
  serveSecondsLeft: number | null;
  lastScorer: Side | null;
}

export type ErrorCode =
  | "INVALID_NAME"
  | "INVALID_CODE"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "SESSION_EXPIRED"
  | "NOT_IN_ROOM";

export interface JoinedPayload {
  code: string;
  playerId: string;
  side: Side;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };

export type Direction = -1 | 0 | 1;

export interface ClientToServerEvents {
  "room:create": (payload: { name: string }, ack: (res: Ack<JoinedPayload>) => void) => void;
  "room:join": (payload: { name: string; code: string }, ack: (res: Ack<JoinedPayload>) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: string }, ack: (res: Ack<JoinedPayload>) => void) => void;
  "room:leave": () => void;
  "player:input": (payload: { dir: Direction }) => void;
  "player:serve": () => void;
  "player:rematch": () => void;
}

export interface ServerToClientEvents {
  "room:info": (info: RoomInfo) => void;
  "game:state": (snapshot: GameSnapshot) => void;
}
