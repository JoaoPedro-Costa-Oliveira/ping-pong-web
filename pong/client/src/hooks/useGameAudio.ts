import { useCallback, useEffect, useRef, useState } from "react";
import type { GameConfig, GameSnapshot } from "../../../server/src/protocol";

export interface AudioSettings {
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
}

const STORAGE_KEY = "pong-audio-settings";
const DEFAULT_SETTINGS: AudioSettings = {
  music: true,
  effects: true,
  musicVolume: 0.2,
  effectsVolume: 0.4,
};
const MUSIC_NOTES = [392, 523.25, 587.33, 523.25, 440, 523.25, 659.25, 587.33];

interface PreviousBall {
  x: number;
  y: number;
  dx: number;
  dy: number;
  phase: GameSnapshot["phase"];
}

function isAudioSettings(value: unknown): value is AudioSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.music === "boolean" &&
    typeof settings.effects === "boolean" &&
    typeof settings.musicVolume === "number" &&
    settings.musicVolume >= 0 &&
    settings.musicVolume <= 1 &&
    typeof settings.effectsVolume === "number" &&
    settings.effectsVolume >= 0 &&
    settings.effectsVolume <= 1
  );
}

function loadSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(stored);
    return isAudioSettings(parsed) ? parsed : DEFAULT_SETTINGS;
  } catch (error) {
    console.warn("Não foi possível carregar as configurações de áudio.", error);
    return DEFAULT_SETTINGS;
  }
}

export function useGameAudio(snapshot: GameSnapshot, config: GameConfig) {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const [audioReady, setAudioReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousBallRef = useRef<PreviousBall | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("Não foi possível salvar as configurações de áudio.", error);
    }
  }, [settings]);

  const enableAudio = useCallback(() => {
    const audioContext = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioContext;
    void audioContext.resume().then(
      () => setAudioReady(true),
      (error: unknown) => console.error("Não foi possível ativar o áudio.", error),
    );
  }, []);

  const updateSettings = useCallback((updates: Partial<AudioSettings>) => {
    setSettings((current) => ({ ...current, ...updates }));
  }, []);

  const playTone = useCallback((frequency: number, duration: number, volume: number, type: OscillatorType) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== "running" || volume <= 0) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.72), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }, []);

  useEffect(() => {
    if (!audioReady || !settings.music || settings.musicVolume === 0) return;

    let noteIndex = 0;
    const playNextNote = () => {
      const note = MUSIC_NOTES[noteIndex % MUSIC_NOTES.length];
      if (note !== undefined) playTone(note, 0.28, settings.musicVolume * 0.055, "triangle");
      noteIndex++;
    };
    playNextNote();
    const interval = window.setInterval(playNextNote, 360);
    return () => window.clearInterval(interval);
  }, [audioReady, playTone, settings.music, settings.musicVolume]);

  useEffect(() => {
    const current: PreviousBall = { ...snapshot.ball, dx: 0, dy: 0, phase: snapshot.phase };
    const previous = previousBallRef.current;
    if (previous && previous.phase === "playing" && snapshot.phase === "playing") {
      current.dx = snapshot.ball.x - previous.x;
      current.dy = snapshot.ball.y - previous.y;
      const horizontalBounce = (previous.dx > 0 && current.dx < 0) || (previous.dx < 0 && current.dx > 0);
      const verticalBounce = (previous.dy > 0 && current.dy < 0) || (previous.dy < 0 && current.dy > 0);

      if (settings.effects && horizontalBounce) {
        const leftFace = config.paddleMargin + config.paddleWidth;
        const rightFace = config.width - config.paddleMargin - config.paddleWidth;
        const nearLeftPaddle = snapshot.ball.x <= leftFace + config.ballRadius * 2;
        const nearRightPaddle = snapshot.ball.x >= rightFace - config.ballRadius * 2;
        const overlapsPaddle = (side: "left" | "right") =>
          snapshot.ball.y + config.ballRadius >= snapshot.paddles[side] &&
          snapshot.ball.y - config.ballRadius <= snapshot.paddles[side] + config.paddleHeight;

        if ((nearLeftPaddle && overlapsPaddle("left")) || (nearRightPaddle && overlapsPaddle("right"))) {
          playTone(680, 0.11, settings.effectsVolume * 0.22, "sine");
        }
      } else if (settings.effects && verticalBounce && (snapshot.ball.y <= config.ballRadius * 2 || snapshot.ball.y >= config.height - config.ballRadius * 2)) {
        playTone(300, 0.09, settings.effectsVolume * 0.14, "triangle");
      }
    }

    if (previous) {
      current.dx = snapshot.ball.x - previous.x;
      current.dy = snapshot.ball.y - previous.y;
    }
    previousBallRef.current = current;
  }, [config, playTone, settings.effects, settings.effectsVolume, snapshot]);

  useEffect(
    () => () => {
      const audioContext = audioContextRef.current;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch((error: unknown) => console.error("Não foi possível fechar o áudio.", error));
      }
    },
    [],
  );

  return { settings, updateSettings, enableAudio };
}
