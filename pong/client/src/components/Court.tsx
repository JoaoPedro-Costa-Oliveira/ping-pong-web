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
        const x = side === "left" ? paddleMargin : width - paddleMargin - paddleWidth;
        return (
          <g key={side} className={paddleClass(side)}>
            <rect
              className={`paddle-face ${side}`}
              x={x}
              y={paddles[side]}
              width={paddleWidth}
              height={paddleHeight}
            />
          </g>
        );
      })}
      <circle className={`ball ${phase === "serving" ? "waiting" : ""}`} cx={ball.x} cy={ball.y} r={ballRadius} />
    </svg>
  );
}
