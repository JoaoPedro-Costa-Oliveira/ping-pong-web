import { useEffect, useRef, useState } from "react";
import type { GameSnapshot, RoomInfo, Side } from "../../../server/src/protocol";
import { useControls } from "../hooks/useControls";
import { useGameAudio } from "../hooks/useGameAudio";
import type { GameConnection } from "../hooks/useGame";
import { Court } from "./Court";
import { Scoreboard } from "./Scoreboard";
import { EventLog, PointsTable } from "./SidePanels";

interface GameScreenProps {
  game: GameConnection;
  room: RoomInfo;
  snapshot: GameSnapshot;
  mySide: Side;
}

export function GameScreen({ game, room, snapshot, mySide }: GameScreenProps) {
  const { sendInput, serve, rematch, leaveRoom } = game;
  const controls = useControls(sendInput, serve);
  const audio = useGameAudio(snapshot, room.config);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Ref usada apenas para dar o foco do teclado à tela do jogo (os eventos de tecla são do React)
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pageRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!game.connected) controls.releaseAll();
  }, [game.connected, controls.releaseAll]);

  const nameOf = (side: Side) => room.players.find((p) => p.side === side)?.name ?? "Oponente";
  const opponentSide: Side = mySide === "left" ? "right" : "left";
  const opponent = room.players.find((p) => p.side === opponentSide);
  const myTurn = snapshot.serving === mySide;
  const iVoted = room.rematchVotes.includes(mySide);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  function renderOverlay() {
    if (!game.connected) {
      return (
        <div className="overlay">
          <h2>Conexão perdida</h2>
          <p>Reconectando ao servidor…</p>
        </div>
      );
    }
    switch (snapshot.phase) {
      case "waiting":
        return (
          <div className="overlay">
            <h2>Aguardando oponente…</h2>
            <p>Passe este código para o outro jogador:</p>
            <button type="button" className="room-code" onClick={copyCode} title="Copiar código">
              {room.code}
            </button>
            <small>{copyError ? "Não foi possível copiar. Informe o código acima ao seu oponente." : copied ? "Código copiado!" : "Clique no código para copiar"}</small>
          </div>
        );
      case "serving":
        return (
          <div className={`overlay light ${myTurn ? "my-turn" : ""}`}>
            {myTurn ? (
              <>
                <h2>Sua vez de sacar!</h2>
                <p>
                  Pressione <kbd>Espaço</kbd> ou clique em sacar ({snapshot.serveSecondsLeft}s)
                </p>
                <button type="button" className="btn btn-primary" onClick={() => { serve(); pageRef.current?.focus(); }}>
                  Sacar
                </button>
              </>
            ) : (
              <h2>
                Vez de {nameOf(snapshot.serving ?? opponentSide)} sacar… ({snapshot.serveSecondsLeft}s)
              </h2>
            )}
          </div>
        );
      case "paused":
        return (
          <div className="overlay">
            <h2>Jogo pausado</h2>
            <p>{opponent && !opponent.connected ? `${opponent.name} perdeu a conexão. Aguardando…` : "Reconectando…"}</p>
          </div>
        );
      case "finished": {
        const iWon = room.winner === mySide;
        return (
          <div className={`overlay ${iWon ? "victory" : "defeat"}`}>
            <h2>{room.winner ? `🏆 ${nameOf(room.winner)} venceu!` : "Fim de jogo"}</h2>
            <p>{iWon ? "Parabéns, você ganhou!" : "Boa partida! Que tal uma revanche?"}</p>
            {room.players.length === 2 ? (
              <button type="button" className="btn btn-primary" onClick={rematch} disabled={iVoted}>
                {iVoted ? "Aguardando oponente…" : "Jogar novamente"}
              </button>
            ) : (
              <p className="hint">O oponente saiu da sala.</p>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div
      ref={pageRef}
      className="game-page"
      tabIndex={0}
      onPointerDownCapture={audio.enableAudio}
      onKeyDownCapture={audio.enableAudio}
      onKeyDown={controls.onKeyDown}
      onKeyUp={controls.onKeyUp}
      onBlur={controls.releaseAll}
    >
      <header className="game-header">
        <h1>🏓 Pong Online</h1>
        <div className="game-header-info">
          <span className="chip">
            Sala <strong>{room.code}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={leaveRoom}>
            Sair
          </button>
          <div className="settings-control">
            <button
              type="button"
              className="btn btn-ghost"
              aria-expanded={settingsOpen}
              aria-controls="audio-settings"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Áudio
            </button>
            {settingsOpen && (
              <section id="audio-settings" className="settings-menu" aria-label="Configurações de áudio">
                <h2>Configurações de áudio</h2>
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={audio.settings.music}
                    onChange={(event) => audio.updateSettings({ music: event.currentTarget.checked })}
                  />
                  Música
                </label>
                <label className="setting-volume">
                  Volume da música
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.settings.musicVolume}
                    onChange={(event) => audio.updateSettings({ musicVolume: Number(event.currentTarget.value) })}
                  />
                </label>
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={audio.settings.effects}
                    onChange={(event) => audio.updateSettings({ effects: event.currentTarget.checked })}
                  />
                  Efeitos sonoros
                </label>
                <label className="setting-volume">
                  Volume dos efeitos
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.settings.effectsVolume}
                    onChange={(event) => audio.updateSettings({ effectsVolume: Number(event.currentTarget.value) })}
                  />
                </label>
                <p className="settings-hint">O áudio começa depois da primeira interação com o jogo.</p>
              </section>
            )}
          </div>
        </div>
      </header>

      <Scoreboard
        players={room.players}
        mySide={mySide}
        serving={snapshot.serving}
        winner={room.winner}
        pointsToWin={room.config.pointsToWin}
      />

      <div className="game-layout">
        <div className="court-wrapper">
          <Court config={room.config} snapshot={snapshot} mySide={mySide} onFocusGame={() => pageRef.current?.focus()} />
          {renderOverlay()}
        </div>

        <aside className="side">
          <PointsTable history={room.history} />
          <EventLog log={room.log} />
        </aside>
      </div>

      <div className="touch-controls">
        {(["btn-up", "btn-down"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="btn btn-secondary touch-btn"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={() => controls.press(key)}
            onPointerUp={() => controls.release(key)}
            onPointerLeave={() => controls.release(key)}
            onPointerCancel={() => controls.release(key)}
          >
            {key === "btn-up" ? "▲ Subir" : "▼ Descer"}
          </button>
        ))}
      </div>

      <p className="instructions">
        Você joga com a raquete <strong>{mySide === "left" ? "da esquerda" : "da direita"}</strong>. Use <kbd>W</kbd>/<kbd>S</kbd> ou{" "}
        <kbd>↑</kbd>/<kbd>↓</kbd> para mover e <kbd>Espaço</kbd> para sacar quando for a sua vez. Clique na mesa para voltar aos controles.
      </p>
    </div>
  );
}
