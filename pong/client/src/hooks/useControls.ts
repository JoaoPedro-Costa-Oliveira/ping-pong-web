import { useCallback, useRef, type KeyboardEvent } from "react";
import type { Direction } from "../../../server/src/protocol";

const UP_KEYS = new Set(["w", "arrowup", "btn-up"]);
const DOWN_KEYS = new Set(["s", "arrowdown", "btn-down"]);
const SERVE_KEYS = new Set([" ", "enter"]);

/*
 * Converte eventos de teclado/ponteiro do React em comandos para o servidor.
 * Só envia mensagem quando a direção efetiva muda (poucas mensagens, sem repetição de tecla).
 */
export function useControls(sendInput: (dir: Direction) => void, serve: () => void) {
  const held = useRef(new Set<string>());
  const lastSent = useRef<Direction>(0);

  const flush = useCallback(() => {
    const keys = [...held.current];
    const up = keys.some((k) => UP_KEYS.has(k));
    const down = keys.some((k) => DOWN_KEYS.has(k));
    const dir: Direction = up === down ? 0 : up ? -1 : 1;
    if (dir !== lastSent.current) {
      lastSent.current = dir;
      sendInput(dir);
    }
  }, [sendInput]);

  const press = useCallback(
    (key: string) => {
      held.current.add(key);
      flush();
    },
    [flush],
  );

  const release = useCallback(
    (key: string) => {
      held.current.delete(key);
      flush();
    },
    [flush],
  );

  const releaseAll = useCallback(() => {
    held.current.clear();
    flush();
  }, [flush]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      const key = event.key.toLowerCase();
      if (UP_KEYS.has(key) || DOWN_KEYS.has(key) || SERVE_KEYS.has(key)) {
        event.preventDefault();
      }
      if (SERVE_KEYS.has(key)) {
        if (!event.repeat) serve();
        return;
      }
      press(key);
    },
    [press, serve],
  );

  const onKeyUp = useCallback((event: KeyboardEvent) => release(event.key.toLowerCase()), [release]);

  return { onKeyDown, onKeyUp, press, release, releaseAll };
}
