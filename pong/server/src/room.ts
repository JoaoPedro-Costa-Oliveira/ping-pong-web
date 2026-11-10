import { randomUUID } from "node:crypto";
import { CONFIG, PongGame, TICKS_PER_SECOND, type GameEvent } from "./game.js";
import type {
  Direction,
  ErrorCode,
  GameSnapshot,
  LogEntry,
  Phase,
  PlayerInfo,
  PointRecord,
  RoomInfo,
  Side,
} from "./protocol.js";

export const RECONNECT_GRACE_MS = 30_000;
const MAX_LOG_ENTRIES = 8;

export interface Broadcaster {
  info(code: string, info: RoomInfo): void;
  snapshot(code: string, snapshot: GameSnapshot): void;
}

export interface Slot {
  side: Side;
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  graceTimer: NodeJS.Timeout | null;
}

type Status = "waiting" | "active" | "paused" | "finished";

const SIDES: Side[] = ["left", "right"];
const opposite = (side: Side): Side => (side === "left" ? "right" : "left");

/*
 * Uma partida entre dois jogadores em computadores diferentes.
 * Guarda os jogadores, o estado do jogo e o "relógio" (60 ticks/s) que o faz andar.
 */
export class Room {
  private slots: Partial<Record<Side, Slot>> = {};
  private game = new PongGame(CONFIG);
  private status: Status = "waiting";
  private winner: Side | null = null;
  private history: PointRecord[] = [];
  private log: LogEntry[] = [];
  private logCounter = 0;
  private rematchVotes = new Set<Side>();
  private loop: NodeJS.Timeout | null = null;

  constructor(
    readonly code: string,
    private readonly broadcaster: Broadcaster,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  /* ---------- Jogadores ---------- */

  canJoin(): ErrorCode | null {
    if (SIDES.every((side) => this.slots[side])) return "ROOM_FULL";
    if (this.status !== "waiting") return "ROOM_ALREADY_STARTED";
    return null;
  }

  addPlayer(name: string, socketId: string): Slot {
    const side = SIDES.find((s) => !this.slots[s]);
    if (!side) throw new Error("Room is full");

    const slot: Slot = { side, playerId: randomUUID(), name, socketId, connected: true, graceTimer: null };
    this.slots[side] = slot;
    this.addLog(side === "left" && !this.slots.right ? `${name} criou a sala` : `${name} entrou na sala`);

    if (this.playerCount === 2 && this.allConnected()) {
      this.startMatch();
    } else {
      this.emitInfo();
    }
    return slot;
  }

  findSlot(playerId: string): Slot | undefined {
    return SIDES.map((s) => this.slots[s]).find((slot) => slot?.playerId === playerId);
  }

  /* Volta de uma queda de conexão: reassocia o novo socket ao jogador */
  reconnect(playerId: string, socketId: string): Slot | null {
    const slot = this.findSlot(playerId);
    if (!slot) return null;

    this.clearGrace(slot);
    slot.socketId = socketId;
    slot.connected = true;
    this.addLog(`${slot.name} reconectou`);

    if (this.status === "waiting" && this.playerCount === 2 && this.allConnected()) {
      this.startMatch();
      return slot;
    }
    if (this.status === "paused" && this.allConnected()) {
      this.status = "active";
      this.startLoop();
    }
    this.emitInfo();
    this.emitSnapshot();
    return slot;
  }

  disconnect(slot: Slot, socketId: string): void {
    if (slot.socketId !== socketId || !slot.connected) return;

    slot.connected = false;
    slot.socketId = null;
    this.game.setInput(slot.side, 0);
    this.addLog(`${slot.name} perdeu a conexão`);

    if (this.status === "active") {
      this.status = "paused";
      this.stopLoop();
    }
    this.clearGrace(slot);
    slot.graceTimer = setTimeout(() => this.leave(slot.side), RECONNECT_GRACE_MS);
    this.emitInfo();
    this.emitSnapshot();
  }

  /* Saída definitiva (botão "Sair" ou fim do prazo de reconexão) */
  leave(side: Side): void {
    const slot = this.slots[side];
    if (!slot) return;

    this.clearGrace(slot);
    delete this.slots[side];
    this.rematchVotes.delete(side);
    this.addLog(`${slot.name} saiu da partida`);

    const remaining = this.slots[opposite(side)];
    if (!remaining) {
      this.destroy();
      this.onEmpty(this);
      return;
    }

    if (this.status === "active" || this.status === "paused") {
      this.status = "finished";
      this.winner = remaining.side;
      this.stopLoop();
      this.addLog(`${remaining.name} venceu por desistência`);
    } else if (this.status === "finished") {
      this.rematchVotes.clear();
    }
    this.emitInfo();
    this.emitSnapshot();
  }

  destroy(): void {
    this.stopLoop();
    SIDES.forEach((side) => {
      const slot = this.slots[side];
      if (slot) this.clearGrace(slot);
    });
  }

  /* ---------- Comandos dos jogadores ---------- */

  input(side: Side, dir: Direction): void {
    this.game.setInput(side, dir);
  }

  serve(side: Side): void {
    if (this.status !== "active") return;
    if (this.game.serve(side)) {
      this.addLog(`${this.nameOf(side)} sacou`);
      this.emitInfo();
      this.emitSnapshot();
    }
  }

  requestRematch(side: Side): void {
    if (this.status !== "finished" || this.playerCount < 2 || !this.allConnected()) return;

    this.rematchVotes.add(side);
    if (this.rematchVotes.size === 2) {
      this.startMatch();
    } else {
      this.addLog(`${this.nameOf(side)} quer jogar de novo`);
      this.emitInfo();
    }
  }

  /* ---------- Estado ---------- */

  get playerCount(): number {
    return SIDES.filter((side) => this.slots[side]).length;
  }

  get phase(): Phase {
    return this.status === "active" ? this.game.phase : this.status;
  }

  info(): RoomInfo {
    const scores = this.game.scores;
    const players: PlayerInfo[] = SIDES.flatMap((side) => {
      const slot = this.slots[side];
      return slot ? [{ side, name: slot.name, connected: slot.connected, score: scores[side] }] : [];
    });

    return {
      code: this.code,
      phase: this.phase,
      players,
      serving: this.status === "active" && this.game.phase === "serving" ? this.game.servingSide : null,
      winner: this.winner,
      rematchVotes: [...this.rematchVotes],
      history: this.history,
      log: this.log,
      config: CONFIG,
    };
  }

  snapshot(): GameSnapshot {
    const snapshot = { ...this.game.snapshot(), phase: this.phase };
    // Fora do jogo ativo (aguardando/pausado/fim) ninguém tem a vez nem contagem de saque
    return this.status === "active" ? snapshot : { ...snapshot, serving: null, serveSecondsLeft: null };
  }

  emitInfo(): void {
    this.broadcaster.info(this.code, this.info());
  }

  emitSnapshot(): void {
    this.broadcaster.snapshot(this.code, this.snapshot());
  }

  /* ---------- Internos ---------- */

  private startMatch(): void {
    this.game = new PongGame(CONFIG);
    this.history = [];
    this.winner = null;
    this.rematchVotes.clear();
    this.status = "active";
    this.addLog(`Partida iniciada — ${this.nameOf(this.game.servingSide)} saca primeiro`);
    this.startLoop();
    this.emitInfo();
    this.emitSnapshot();
  }

  private startLoop(): void {
    if (this.loop) return;
    this.loop = setInterval(() => this.tick(), 1000 / TICKS_PER_SECOND);
  }

  private stopLoop(): void {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  private tick(): void {
    const events = this.game.tick();
    events.forEach((event) => this.handleEvent(event));
    if (events.length > 0) this.emitInfo();
    this.emitSnapshot();
  }

  private handleEvent(event: GameEvent): void {
    switch (event.type) {
      case "point": {
        const scorerName = this.nameOf(event.scorer);
        this.history.push({
          number: this.history.length + 1,
          scorer: event.scorer,
          scorerName,
          left: event.scores.left,
          right: event.scores.right,
        });
        this.addLog(`Ponto de ${scorerName} (${event.scores.left} x ${event.scores.right})`);
        if (this.game.phase === "serving") {
          this.addLog(`Vez de ${this.nameOf(this.game.servingSide)} sacar`);
        }
        break;
      }
      case "finished":
        this.status = "finished";
        this.winner = event.winner;
        this.stopLoop();
        this.addLog(`${this.nameOf(event.winner)} venceu a partida!`);
        break;
      case "auto-serve":
        this.addLog(`Saque automático de ${this.nameOf(event.side)}`);
        break;
    }
  }

  private allConnected(): boolean {
    return SIDES.every((side) => this.slots[side]?.connected);
  }

  private nameOf(side: Side): string {
    return this.slots[side]?.name ?? (side === "left" ? "Jogador 1" : "Jogador 2");
  }

  private addLog(text: string): void {
    this.log.push({ id: ++this.logCounter, text });
    if (this.log.length > MAX_LOG_ENTRIES) {
      this.log.splice(0, this.log.length - MAX_LOG_ENTRIES);
    }
  }

  private clearGrace(slot: Slot): void {
    if (slot.graceTimer) {
      clearTimeout(slot.graceTimer);
      slot.graceTimer = null;
    }
  }
}
