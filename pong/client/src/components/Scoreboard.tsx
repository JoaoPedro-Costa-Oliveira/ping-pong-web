import { memo } from "react";
import type { PlayerInfo, Side } from "../../../server/src/protocol";

interface ScoreboardProps {
  players: PlayerInfo[];
  mySide: Side;
  serving: Side | null;
  winner: Side | null;
  pointsToWin: number;
}

function PlayerPanel({
  player,
  isMe,
  hasTurn,
  isWinner,
}: {
  player: PlayerInfo | undefined;
  isMe: boolean;
  hasTurn: boolean;
  isWinner: boolean;
}) {
  if (!player) {
    return (
      <div className="player-panel empty">
        <span className="player-name">Aguardando jogador…</span>
        <span className="player-score">–</span>
      </div>
    );
  }

  // O estilo do painel muda conforme o estado: vez de sacar, vencedor, desconectado
  const classes = ["player-panel", hasTurn ? "has-turn" : "", isWinner ? "winner" : "", player.connected ? "" : "offline"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <span className="player-name">
        {player.name}
        {isMe && <small> (você)</small>}
      </span>
      {/* key = pontuação: ao mudar, o elemento é recriado e a animação "pop" roda de novo */}
      <span className="player-score" key={player.score}>
        {player.score}
      </span>
      <span className="player-status">
        {!player.connected ? "desconectado" : hasTurn ? "🎾 tem a vez de sacar" : isWinner ? "🏆 vencedor" : "\u00a0"}
      </span>
    </div>
  );
}

export const Scoreboard = memo(function Scoreboard({ players, mySide, serving, winner, pointsToWin }: ScoreboardProps) {
  const left = players.find((p) => p.side === "left");
  const right = players.find((p) => p.side === "right");

  return (
    <section className="scoreboard" aria-label="Placar">
      <PlayerPanel player={left} isMe={mySide === "left"} hasTurn={serving === "left"} isWinner={winner === "left"} />
      <div className="scoreboard-center">
        <span>Primeiro a</span>
        <strong>{pointsToWin}</strong>
        <span>pontos</span>
      </div>
      <PlayerPanel player={right} isMe={mySide === "right"} hasTurn={serving === "right"} isWinner={winner === "right"} />
    </section>
  );
});
