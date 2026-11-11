import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import type {
  Ack,
  ClientToServerEvents,
  GameSnapshot,
  JoinedPayload,
  RoomInfo,
  ServerToClientEvents,
} from "../src/protocol.js";
import { CONFIG } from "../src/game.js";
import { createGameServer, type GameServer } from "../src/server.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & {
  lastInfo?: RoomInfo;
  lastState?: GameSnapshot;
};

let server: GameServer;
let url: string;
const clients: Client[] = [];

function newClient(): Client {
  const client: Client = connect(url, { transports: ["websocket"], forceNew: true });
  client.on("room:info", (info) => (client.lastInfo = info));
  client.on("game:state", (state) => (client.lastState = state));
  clients.push(client);
  return client;
}

function emitAck<T>(fn: (ack: (res: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => fn(resolve));
}

async function waitFor(condition: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout aguardando condição");
    await new Promise((r) => setTimeout(r, 15));
  }
}

before(async () => {
  server = createGameServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  clients.forEach((c) => c.disconnect());
  await server.close();
});

describe("partida multiplayer", () => {
  it("rejeita nome inválido, sala inexistente e sala cheia", async () => {
    const a = newClient();
    const bad = await emitAck<JoinedPayload>((ack) => a.emit("room:create", { name: "   " }, ack));
    assert.deepEqual(bad, { ok: false, error: "INVALID_NAME" });

    const missing = await emitAck<JoinedPayload>((ack) => a.emit("room:join", { name: "Ana", code: "ZZZZ" }, ack));
    assert.deepEqual(missing, { ok: false, error: "ROOM_NOT_FOUND" });
  });

  it("dois clientes jogam: saque, movimento, ponto e passagem de vez controlados pelo servidor", async () => {
    const alice = newClient();
    const bob = newClient();

    const created = await emitAck<JoinedPayload>((ack) => alice.emit("room:create", { name: "Alice" }, ack));
    assert.ok(created.ok);
    const code = created.data.code;
    assert.equal(created.data.side, "left");
    await waitFor(() => alice.lastInfo?.phase === "waiting");

    const joined = await emitAck<JoinedPayload>((ack) => bob.emit("room:join", { name: "Bob", code: code.toLowerCase() }, ack));
    assert.ok(joined.ok);
    assert.equal(joined.data.side, "right");

    const third = newClient();
    const full = await emitAck<JoinedPayload>((ack) => third.emit("room:join", { name: "Eve", code }, ack));
    assert.deepEqual(full, { ok: false, error: "ROOM_FULL" });

    await waitFor(() => alice.lastInfo?.phase === "serving" && bob.lastInfo?.phase === "serving");
    assert.deepEqual(alice.lastInfo?.players.map((p) => p.name), ["Alice", "Bob"]);
    const server1 = alice.lastInfo?.serving;
    assert.ok(server1);

    // quem NÃO tem a vez não consegue sacar
    const [serverClient, receiver] = server1 === "left" ? [alice, bob] : [bob, alice];
    receiver.emit("player:serve");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(alice.lastState?.phase, "serving");

    // movimento enviado por um cliente aparece nos dois
    const before = alice.lastState!.paddles.left;
    alice.emit("player:input", { dir: -1 });
    await waitFor(() => alice.lastState!.paddles.left < before && bob.lastState!.paddles.left < before);
    // raquetes em extremos opostos, para a bola não ser rebatida
    alice.emit("player:input", { dir: -1 });
    bob.emit("player:input", { dir: 1 });
    await waitFor(
      () =>
        alice.lastState!.paddles.left === 0 &&
        bob.lastState!.paddles.right === CONFIG.height - CONFIG.paddleHeight,
    );

    // saque correto muda a fase nos dois clientes
    serverClient.emit("player:serve");
    await waitFor(() => alice.lastState?.phase === "playing" && bob.lastState?.phase === "playing");

    // ninguém defende: o servidor marca o ponto e passa a vez
    await waitFor(() => (alice.lastInfo?.history.length ?? 0) === 1 && alice.lastInfo?.phase === "serving", 30000);
    const info = alice.lastInfo!;
    assert.equal(info.history[0]!.number, 1);
    assert.notEqual(info.serving, null);
    assert.equal(info.serving, info.history[0]!.scorer === "left" ? "right" : "left");
    assert.ok(info.log.some((entry) => entry.text.startsWith("Ponto de")));
  });

  it("pausa na desconexão, permite reconectar e dá vitória por desistência", async () => {
    const carol = newClient();
    const dave = newClient();
    const created = await emitAck<JoinedPayload>((ack) => carol.emit("room:create", { name: "Carol" }, ack));
    assert.ok(created.ok);
    const joined = await emitAck<JoinedPayload>((ack) => dave.emit("room:join", { name: "Dave", code: created.data.code }, ack));
    assert.ok(joined.ok);
    await waitFor(() => carol.lastInfo?.phase === "serving");

    const initialY = carol.lastState!.paddles.right;
    dave.emit("player:input", { dir: -1 });
    await waitFor(() => carol.lastState!.paddles.right < initialY);
    dave.disconnect();
    await waitFor(() => carol.lastInfo?.phase === "paused");
    assert.equal(carol.lastInfo?.players.find((p) => p.name === "Dave")?.connected, false);
    const pausedY = carol.lastState!.paddles.right;

    const daveAgain = newClient();
    const rejoined = await emitAck<JoinedPayload>((ack) =>
      daveAgain.emit("room:rejoin", { code: created.data.code, playerId: joined.data.playerId }, ack),
    );
    assert.ok(rejoined.ok);
    await waitFor(() => carol.lastInfo?.phase === "serving" && daveAgain.lastInfo?.phase === "serving");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(carol.lastState!.paddles.right, pausedY);

    daveAgain.emit("room:leave");
    await waitFor(() => carol.lastInfo?.phase === "finished");
    assert.equal(carol.lastInfo?.winner, "left");
    assert.equal(carol.lastInfo?.players.length, 1);
  });

  it("espera o criador reconectar antes de começar quando ele cai no lobby", async () => {
    const creator = newClient();
    const created = await emitAck<JoinedPayload>((ack) => creator.emit("room:create", { name: "Criador" }, ack));
    assert.ok(created.ok);
    creator.disconnect();
    await waitFor(() => server.manager.get(created.data.code)?.info().players[0]?.connected === false);

    const guest = newClient();
    const joined = await emitAck<JoinedPayload>((ack) =>
      guest.emit("room:join", { name: "Convidado", code: created.data.code }, ack),
    );
    assert.ok(joined.ok);
    await waitFor(() => guest.lastState?.phase === "waiting");
    assert.equal(server.manager.get(created.data.code)?.phase, "waiting");

    const returned = newClient();
    const rejoined = await emitAck<JoinedPayload>((ack) =>
      returned.emit("room:rejoin", { code: created.data.code, playerId: created.data.playerId }, ack),
    );
    assert.ok(rejoined.ok);
    await waitFor(() => guest.lastState?.phase === "serving" && returned.lastState?.phase === "serving");
  });
});
