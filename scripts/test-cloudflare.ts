import { parse } from "jsonc-parser";
import assert from "node:assert/strict";
import fs from "node:fs";
import { WebSocket } from "ws";
import { ClientMessage, ServerMessage } from "../src/core/Schemas";
import {
  createGameWireContext,
  decodeLobbyMessage,
  decodeServerMessage,
  encodeClientMessage,
} from "../src/core/ZbinWire";

const base = process.env.TEST_PAGES_URL ?? "http://localhost:8788";
const build = parse(fs.readFileSync("wrangler.backend.jsonc", "utf8")).vars
  .BUILD_ID as string;
const tokens = [crypto.randomUUID(), crypto.randomUUID()];
const headers = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
  Origin: base,
});
const sockets: WebSocket[] = [];
const http = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(15000) });

async function connect(
  gameID: string,
  token: string,
  username: string,
  lastTurn?: number,
) {
  const ws = new WebSocket(
    base.replace(/^http/, "ws") + `/w0?gameID=${gameID}`,
    { headers: { Origin: base } },
  );
  sockets.push(ws);
  let ctx: ReturnType<typeof createGameWireContext> | undefined;
  const messages: ServerMessage[] = [];
  const checks = new Set<() => void>();
  const errors: unknown[] = [];
  ws.on("message", (data) => {
    try {
      const message = decodeServerMessage(new Uint8Array(data as Buffer), ctx);
      if (message.type === "start")
        ctx = createGameWireContext(message.gameStartInfo.players);
      messages.push(message);
      for (const check of checks) check();
    } catch (error) {
      errors.push(error);
      for (const check of checks) check();
    }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout opening room WebSocket")),
      15000,
    );
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    ws.once("close", () => {
      clearTimeout(timer);
      reject(new Error("Room connection closed before opening"));
    });
  });
  const send = (message: ClientMessage) =>
    ws.send(encodeClientMessage(message, ctx));
  const wait = (
    predicate: (message: ServerMessage) => boolean,
    timeout = 15000,
  ) =>
    new Promise<ServerMessage>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const check = () => {
        if (errors.length) {
          checks.delete(check);
          clearTimeout(timer);
          reject(errors[0]);
          return;
        }
        const index = messages.findIndex(predicate);
        if (index < 0) return;
        const [message] = messages.splice(index, 1);
        checks.delete(check);
        clearTimeout(timer);
        resolve(message);
      };
      checks.add(check);
      timer = setTimeout(() => {
        checks.delete(check);
        reject(new Error("Timeout waiting for game message"));
      }, timeout);
      check();
    });
  if (lastTurn !== undefined)
    send({ type: "rejoin", gameID, token, gitCommit: build, lastTurn });
  else
    send({
      type: "join",
      gameID,
      token,
      username,
      clanTag: null,
      turnstileToken: null,
      gitCommit: build,
    });
  return { ws, send, wait, messages };
}
try {
  const health = await http(base + "/api/health");
  assert.equal(
    health.status,
    200,
    "Start the backend and Pages dev processes first",
  );
  assert.equal((await health.json()).ok, true);
  const html = await (await http(base)).text();
  assert.ok(!html.includes("<%"));
  assert.ok(html.includes("BOOTSTRAP_CONFIG"));
  const bad = await http(base + "/api/create_game", {
    method: "POST",
    headers: headers("forged-token"),
  });
  assert.equal(bad.status, 401);
  const created = await http(base + "/api/create_game", {
    method: "POST",
    headers: headers(tokens[0]),
  });
  assert.equal(created.status, 200);
  const lobby = (await created.json()) as { gameID: string };
  assert.match(lobby.gameID, /^[A-Za-z0-9]{8}$/);
  assert.equal(
    (await http(base + `/w0/api/game/${lobby.gameID}/exists`)).status,
    200,
  );
  const gamePage = await (await http(base + `/w0/game/${lobby.gameID}`)).text();
  assert.ok(gamePage.includes("BOOTSTRAP_CONFIG"));
  const a = await connect(lobby.gameID, tokens[0], "Cloudflare Host"),
    b = await connect(lobby.gameID, tokens[1], "Cloudflare Guest");
  await a.wait((m) => m.type === "lobby_info" && m.lobby.clients?.length === 2);
  await b.wait((m) => m.type === "lobby_info" && m.lobby.clients?.length === 2);
  b.send({ type: "intent", intent: { type: "toggle_game_start_timer" } });
  const denied = await b.wait((m) => m.type === "error");
  assert.equal(denied.type, "error");
  const publicList = await http(base + `/w0/api/game/${lobby.gameID}/listing`, {
    method: "POST",
    headers: headers(tokens[0]),
    body: JSON.stringify({ listed: true }),
  });
  assert.equal(publicList.status, 200);
  const feed = new WebSocket(base.replace(/^http/, "ws") + "/w0/lobbies", {
    headers: { Origin: base },
  });
  sockets.push(feed);
  const listed = await new Promise<ReturnType<typeof decodeLobbyMessage>>(
    (resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timeout waiting for lobby directory")),
        15000,
      );
      feed.once("message", (d) => {
        clearTimeout(timer);
        try {
          resolve(decodeLobbyMessage(new Uint8Array(d as Buffer)));
        } catch (error) {
          reject(error);
        }
      });
      feed.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    },
  );
  assert.ok(
    listed.type === "full" &&
      Object.values(listed.games)
        .flat()
        .some((g) => g?.gameID === lobby.gameID),
  );
  a.send({ type: "intent", intent: { type: "toggle_game_start_timer" } });
  await a.wait((m) => m.type === "prestart");
  await b.wait((m) => m.type === "prestart");
  const sa = await a.wait((m) => m.type === "start"),
    sb = await b.wait((m) => m.type === "start");
  assert.ok(sa.type === "start" && sb.type === "start");
  assert.deepEqual(sa.gameStartInfo, sb.gameStartInfo);
  assert.notEqual(sa.myClientID, sb.myClientID);
  a.send({
    type: "intent",
    intent: { type: "strategy", op: "policy", key: "industry" },
  });
  const ta = await a.wait(
    (m) =>
      m.type === "turn" && m.turn.intents.some((i) => i.type === "strategy"),
  );
  const tb = await b.wait(
    (m) =>
      m.type === "turn" && m.turn.intents.some((i) => i.type === "strategy"),
  );
  assert.deepEqual(ta, tb);
  assert.ok(ta.type === "turn");
  const last = ta.turn.turnNumber;
  b.ws.close();
  a.send({
    type: "intent",
    intent: { type: "strategy", op: "workforce", key: "science" },
  });
  await a.wait(
    (m) =>
      m.type === "turn" && m.turn.intents.some((i) => i.type === "strategy"),
  );
  const rejoined = await connect(
    lobby.gameID,
    tokens[1],
    "Cloudflare Guest",
    last,
  );
  const replay = await rejoined.wait((m) => m.type === "start");
  assert.ok(replay.type === "start");
  assert.equal(replay.myClientID, sb.myClientID);
  assert.ok(
    replay.turns.some((t) =>
      t.intents.some((i) => i.type === "strategy" && i.op === "workforce"),
    ),
  );
  console.log(
    "Cloudflare integration passed: Pages proxy, guest auth, lobby, listing, host guards, start, binary turns, strategic intents, reconnection and replay.",
  );
} finally {
  for (const ws of sockets) {
    ws.terminate();
  }
}
