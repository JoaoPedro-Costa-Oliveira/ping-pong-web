import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIG, PongGame, TICKS_PER_SECOND } from "../src/game.js";

const fixedRandom = () => 0.5; // ângulo de saque 0 (bola reta)

function launch(game: PongGame): void {
  assert.ok(game.serve(game.servingSide));
}

/* Afasta a raquete de quem recebe, para que o saque não seja rebatido */
function launchAndDodge(game: PongGame): void {
  const receiver = game.servingSide === "left" ? game.paddles.right : game.paddles.left;
  launch(game);
  receiver.y = game.ball.y < CONFIG.height / 2 ? CONFIG.height - CONFIG.paddleHeight : 0;
}

describe("PongGame", () => {
  it("começa na fase de saque, com a bola colada na raquete de quem saca", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    assert.equal(game.phase, "serving");
    assert.equal(game.servingSide, "left");
    assert.ok(game.ball.x < CONFIG.width / 2);
    assert.equal(game.ball.vx, 0);
  });

  it("só aceita saque de quem tem a vez", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    assert.equal(game.serve("right"), false);
    assert.equal(game.phase, "serving");
    assert.equal(game.serve("left"), true);
    assert.equal(game.phase, "playing");
    assert.ok(game.ball.vx > 0);
  });

  it("saca sozinho quando o tempo de saque acaba", () => {
    const game = new PongGame(CONFIG, "right", fixedRandom);
    let auto = false;
    for (let i = 0; i < CONFIG.serveTimeoutSeconds * TICKS_PER_SECOND + 1; i++) {
      if (game.tick().some((e) => e.type === "auto-serve")) auto = true;
    }
    assert.ok(auto);
    assert.equal(game.phase, "playing");
    assert.ok(game.ball.vx < 0);
  });

  it("move a raquete conforme a direção e respeita os limites da mesa", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    const start = game.paddles.left.y;
    game.setInput("left", -1);
    game.tick();
    assert.equal(start - game.paddles.left.y, 8.5);
    assert.ok(game.paddles.left.y < start);
    for (let i = 0; i < 500; i++) game.tick();
    assert.equal(game.paddles.left.y, 0);
    game.setInput("left", 1);
    for (let i = 0; i < 500; i++) game.tick();
    assert.equal(game.paddles.left.y, CONFIG.height - CONFIG.paddleHeight);
  });

  it("rebate a bola na raquete e aumenta a velocidade", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    launch(game);
    const initialSpeed = game.ball.speed;
    let bounced = false;
    for (let i = 0; i < 400 && !bounced; i++) {
      game.tick();
      // a raquete direita acompanha a bola
      game.paddles.right.y = game.ball.y - CONFIG.paddleHeight / 2;
      if (game.ball.vx < 0) bounced = true;
    }
    assert.ok(bounced, "bola deveria ter voltado");
    assert.ok(game.ball.speed > initialSpeed);
    assert.equal(game.scores.left + game.scores.right, 0);
  });

  it("rebate também na parte ampliada da raquete", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    launch(game);
    const paddle = game.paddles.right;
    game.ball.x = paddle.x - CONFIG.ballRadius - 1;
    game.ball.y = paddle.y + CONFIG.paddleHeight - CONFIG.ballRadius;
    game.ball.vx = 6;
    game.ball.vy = 0;

    game.tick();

    assert.ok(game.ball.vx < 0);
    assert.equal(game.scores.left + game.scores.right, 0);
  });

  it("acelera durante a jogada até o limite e volta à velocidade inicial no próximo saque", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    launch(game);
    assert.equal(game.ball.speed, 6);
    for (let i = 0; i < 2000; i++) {
      game.ball.x = CONFIG.width / 2;
      game.tick();
    }
    assert.ok(game.ball.speed > 13.99 && game.ball.speed <= 14.000001);
    game.ball.x = CONFIG.width + CONFIG.ballRadius + 1;
    game.tick();
    assert.equal(game.phase, "serving");
    launch(game);
    assert.equal(game.ball.speed, 6);
  });

  it("marca ponto, passa a vez para quem perdeu e reinicia a bola", () => {
    const game = new PongGame(CONFIG, "left", fixedRandom);
    launchAndDodge(game);
    let point = null;
    for (let i = 0; i < 1000 && !point; i++) {
      point = game.tick().find((e) => e.type === "point") ?? null;
    }
    assert.ok(point && point.type === "point");
    assert.equal(point.scorer, "left"); // quem recebe não defendeu
    assert.equal(game.scores.left, 1);
    assert.equal(game.phase, "serving");
    assert.equal(game.servingSide, "right");
    assert.equal(game.ball.vx, 0);
  });

  it("termina a partida ao atingir a pontuação máxima", () => {
    const game = new PongGame({ ...CONFIG, pointsToWin: 2 }, "left", fixedRandom);
    let finished = null;
    for (let round = 0; round < 10 && !finished; round++) {
      if (game.phase === "serving") launchAndDodge(game);
      for (let i = 0; i < 1000 && game.phase === "playing"; i++) {
        finished = game.tick().find((e) => e.type === "finished") ?? finished;
      }
    }
    assert.ok(finished && finished.type === "finished");
    assert.equal(game.phase, "finished");
    assert.equal(game.winner, finished.winner);
    assert.equal(game.serve(game.servingSide), false);
  });
});
