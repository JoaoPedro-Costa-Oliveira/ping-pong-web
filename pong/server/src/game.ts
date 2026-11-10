import type { Direction, GameConfig, GameSnapshot, Side } from "./protocol.js";

export const TICKS_PER_SECOND = 60;

export const CONFIG: GameConfig = {
  width: 800,
  height: 450,
  paddleWidth: 12,
  paddleHeight: 90,
  paddleMargin: 50,
  ballRadius: 8,
  pointsToWin: 5,
  serveTimeoutSeconds: 8,
};

const PADDLE_SPEED = 6;
const BALL_INITIAL_SPEED = 6;
const BALL_MAX_SPEED = 14;
const BALL_SPEEDUP = 1.05;
const BALL_TIME_SPEEDUP = 1.0008;
const MAX_BOUNCE_ANGLE = 0.35 * Math.PI;
const MAX_SERVE_ANGLE = 0.2 * Math.PI;

export type GamePhase = "serving" | "playing" | "finished";

export type GameEvent =
  | { type: "point"; scorer: Side; scores: { left: number; right: number } }
  | { type: "finished"; winner: Side }
  | { type: "auto-serve"; side: Side };

const opposite = (side: Side): Side => (side === "left" ? "right" : "left");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class Paddle {
  y: number;
  dir: Direction = 0;
  score = 0;

  constructor(
    readonly side: Side,
    readonly x: number,
    private readonly config: GameConfig,
  ) {
    this.y = config.height / 2 - config.paddleHeight / 2;
  }

  get centerY(): number {
    return this.y + this.config.paddleHeight / 2;
  }

  update(): void {
    this.y = clamp(this.y + this.dir * PADDLE_SPEED, 0, this.config.height - this.config.paddleHeight);
  }
}

export class Ball {
  x: number;
  y: number;
  vx = 0;
  vy = 0;

  constructor(
    x: number,
    y: number,
    readonly radius: number,
  ) {
    this.x = x;
    this.y = y;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  move(): void {
    this.x += this.vx;
    this.y += this.vy;
  }
}

/*
 * Regras completas do Pong. O servidor é a única fonte de verdade:
 * quem saca ("a vez"), colisões, pontuação e fim de partida são decididos aqui.
 */
export class PongGame {
  readonly paddles: Record<Side, Paddle>;
  readonly ball: Ball;
  phase: GamePhase = "serving";
  servingSide: Side;
  winner: Side | null = null;
  lastScorer: Side | null = null;
  private serveTicksLeft: number;

  constructor(
    private readonly config: GameConfig = CONFIG,
    firstServer: Side = Math.random() < 0.5 ? "left" : "right",
    private readonly random: () => number = Math.random,
  ) {
    const { width, paddleMargin, paddleWidth } = config;
    this.paddles = {
      left: new Paddle("left", paddleMargin, config),
      right: new Paddle("right", width - paddleMargin - paddleWidth, config),
    };
    this.ball = new Ball(width / 2, config.height / 2, config.ballRadius);
    this.servingSide = firstServer;
    this.serveTicksLeft = config.serveTimeoutSeconds * TICKS_PER_SECOND;
    this.attachBallToServer();
  }

  get scores(): { left: number; right: number } {
    return { left: this.paddles.left.score, right: this.paddles.right.score };
  }

  setInput(side: Side, dir: Direction): void {
    this.paddles[side].dir = dir;
  }

  /* Só quem tem a vez pode sacar. Retorna true se o saque foi aceito. */
  serve(side: Side): boolean {
    if (this.phase !== "serving" || side !== this.servingSide) {
      return false;
    }
    const direction = side === "left" ? 1 : -1;
    const angle = (this.random() * 2 - 1) * MAX_SERVE_ANGLE;
    this.ball.vx = direction * BALL_INITIAL_SPEED * Math.cos(angle);
    this.ball.vy = BALL_INITIAL_SPEED * Math.sin(angle);
    this.phase = "playing";
    return true;
  }

  /* Avança a simulação em 1 tick (1/60 s) e devolve os eventos ocorridos. */
  tick(): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase === "finished") {
      return events;
    }

    this.paddles.left.update();
    this.paddles.right.update();

    if (this.phase === "serving") {
      this.attachBallToServer();
      this.serveTicksLeft--;
      if (this.serveTicksLeft <= 0) {
        const side = this.servingSide;
        this.serve(side);
        events.push({ type: "auto-serve", side });
      }
      return events;
    }

    const speed = this.ball.speed;
    if (speed > 0) {
      const factor = Math.min(BALL_TIME_SPEEDUP, BALL_MAX_SPEED / speed);
      this.ball.vx *= factor;
      this.ball.vy *= factor;
    }
    this.ball.move();
    this.bounceOnWalls();
    this.bounceOnPaddle(this.paddles.left);
    this.bounceOnPaddle(this.paddles.right);

    if (this.ball.x + this.ball.radius < 0) {
      this.scorePoint("right", events);
    } else if (this.ball.x - this.ball.radius > this.config.width) {
      this.scorePoint("left", events);
    }
    return events;
  }

  snapshot(): Omit<GameSnapshot, "phase"> {
    return {
      ball: { x: this.ball.x, y: this.ball.y },
      paddles: { left: this.paddles.left.y, right: this.paddles.right.y },
      scores: this.scores,
      serving: this.phase === "serving" ? this.servingSide : null,
      serveSecondsLeft: this.phase === "serving" ? Math.ceil(this.serveTicksLeft / TICKS_PER_SECOND) : null,
      lastScorer: this.lastScorer,
    };
  }

  private attachBallToServer(): void {
    const paddle = this.paddles[this.servingSide];
    const offset = this.config.paddleWidth + this.ball.radius + 2;
    this.ball.x = this.servingSide === "left" ? paddle.x + offset : paddle.x - this.ball.radius - 2;
    this.ball.y = paddle.centerY;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  private bounceOnWalls(): void {
    const { radius } = this.ball;
    if (this.ball.y - radius <= 0) {
      this.ball.y = radius;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + radius >= this.config.height) {
      this.ball.y = this.config.height - radius;
      this.ball.vy = -Math.abs(this.ball.vy);
    }
  }

  private bounceOnPaddle(paddle: Paddle): void {
    const { ball } = this;
    const { paddleWidth, paddleHeight } = this.config;
    const isLeft = paddle.side === "left";

    const movingTowards = isLeft ? ball.vx < 0 : ball.vx > 0;
    if (!movingTowards) return;

    const face = isLeft ? paddle.x + paddleWidth : paddle.x;
    const touching = isLeft
      ? ball.x - ball.radius <= face && ball.x > paddle.x
      : ball.x + ball.radius >= face && ball.x < paddle.x + paddleWidth;
    const alignedVertically = ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddleHeight;

    if (!touching || !alignedVertically) return;

    const impact = clamp((ball.y - paddle.centerY) / (paddleHeight / 2), -1, 1);
    const speed = Math.min(ball.speed * BALL_SPEEDUP, BALL_MAX_SPEED);
    const angle = impact * MAX_BOUNCE_ANGLE;
    const direction = isLeft ? 1 : -1;

    ball.vx = direction * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    ball.x = isLeft ? face + ball.radius : face - ball.radius;
  }

  private scorePoint(scorer: Side, events: GameEvent[]): void {
    this.paddles[scorer].score++;
    this.lastScorer = scorer;
    events.push({ type: "point", scorer, scores: this.scores });

    if (this.paddles[scorer].score >= this.config.pointsToWin) {
      this.phase = "finished";
      this.winner = scorer;
      this.ball.vx = 0;
      this.ball.vy = 0;
      events.push({ type: "finished", winner: scorer });
      return;
    }

    // Passa a vez: quem sofreu o ponto saca a próxima bola
    this.servingSide = opposite(scorer);
    this.phase = "serving";
    this.serveTicksLeft = this.config.serveTimeoutSeconds * TICKS_PER_SECOND;
    this.attachBallToServer();
  }
}
