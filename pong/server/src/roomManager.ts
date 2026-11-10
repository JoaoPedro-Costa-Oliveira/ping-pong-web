import { Room, type Broadcaster } from "./room.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export const MAX_NAME_LENGTH = 16;

/* Normaliza o nome digitado: remove caracteres de controle e espaços extras. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private readonly broadcaster: Broadcaster) {}

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(): Room {
    const room = new Room(this.generateCode(), this.broadcaster, (r) => this.rooms.delete(r.code));
    this.rooms.set(room.code, room);
    return room;
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    return code;
  }
}
