import type { GameConfig, GameSnapshot, Side } from "../../../server/src/protocol";

interface CourtProps {
  config: GameConfig;
  snapshot: GameSnapshot;
  mySide: Side;
  onFocusGame(): void;
}

/*
 * Mesa desenhada de forma declarativa em SVG: a cada estado recebido do servidor o React
 * redesenha os elementos (sem canvas, sem document.getElementById, sem manipular o DOM manualmente).
 */
export function Court({ config, snapshot, mySide, onFocusGame }: CourtProps) {
  const { width, height, paddleWidth, paddleHeight, paddleMargin, ballRadius } = config;
  const { ball, paddles, serving, phase } = snapshot;

  const paddleClass = (side: Side) =>
    ["paddle", side === mySide ? "mine" : "", serving === side ? "has-turn" : ""].filter(Boolean).join(" ");

  return (
    <svg className={`court phase-${phase}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mesa de pong" onClick={onFocusGame}>
      <rect className="court-stripe" x={0} y={height / 2 - 8} width={width} height={16} />
      <line className="net-outline" x1={width / 2} y1={0} x2={width / 2} y2={height} />
      <line className="net" x1={width / 2} y1={0} x2={width / 2} y2={height} />

      {(["left", "right"] as const).map((side) => {
        const face = side === "left" ? paddleMargin + paddleWidth : width - paddleMargin - paddleWidth;
        const centerX = side === "left" ? face - paddleWidth / 2 : face + paddleWidth / 2;
        const centerY = paddles[side] + paddleHeight / 2;
        const faceWidth = paddleWidth + 8;
        return (
          <g key={side} className={paddleClass(side)}>
            <rect className="paddle-handle" x={side === "left" ? centerX - 25 : centerX + 9} y={centerY - 5} width={16} height={10} rx={3} />
            <rect
              className={`paddle-face ${side}`}
              x={centerX - faceWidth / 2}
              y={centerY - paddleHeight / 2}
              width={faceWidth}
              height={paddleHeight}
              rx={faceWidth / 2}
            />
            <line className="paddle-shine" x1={centerX - 6} y1={centerY - paddleHeight / 2 + 14} x2={centerX - 6} y2={centerY - paddleHeight / 2 + 28} />
          </g>
        );
      })}
      <circle className={`ball ${phase === "serving" ? "waiting" : ""}`} cx={ball.x} cy={ball.y} r={ballRadius} />
    </svg>
  );
}
