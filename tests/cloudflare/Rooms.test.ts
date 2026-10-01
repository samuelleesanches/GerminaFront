import { describe, expect, it } from "vitest";
import type { Env } from "../../src/cloudflare/common";
import { GameRoom } from "../../src/cloudflare/GameRoom";
import { LobbyDirectory } from "../../src/cloudflare/LobbyDirectory";
import type { DurableState, Socket } from "../../src/cloudflare/runtime";
import worker from "../../src/cloudflare/worker";
import type { ClientMessage } from "../../src/core/Schemas";
import {
  createGameWireContext,
  decodeServerMessage,
  encodeClientMessage,
} from "../../src/core/ZbinWire";

// In-process storage adapter: exercises the production room logic and protocol
// without requiring a network listener. Runtime WebSocket upgrades are tested
// separately by scripts/test-cloudflare.ts on a machine that can run Wrangler dev.
class TestState {
  values = new Map<string, unknown>();
  turns = new Map<number, string>();
  sockets: Socket[] = [];
  ready: Promise<unknown> = Promise.resolve();
  alarmAt: number | null = null;
  storage = {
    get: async <T>(key: string) =>
      structuredClone(this.values.get(key)) as T | undefined,
    put: async (key: string | Record<string, unknown>, value?: unknown) => {
      if (typeof key === "string") this.values.set(key, structuredClone(value));
      else
        for (const [k, v] of Object.entries(key))
          this.values.set(k, structuredClone(v));
    },
    delete: async (key: string) => this.values.delete(key),
    deleteAll: async () => {
      this.values.clear();
      this.turns.clear();
    },
    list: async <T>(opts: { prefix: string }) =>
      new Map(
        [...this.values].filter(([k]) => k.startsWith(opts.prefix)),
      ) as Map<string, T>,
    getAlarm: async () => this.alarmAt,
    setAlarm: async (n: number) => {
      this.alarmAt = n;
    },
    sql: {
      exec: <T>(query: string, ...params: unknown[]) => {
        let rows: unknown[] = [];
        if (query.startsWith("INSERT INTO turns")) {
          this.turns.set(params[0] as number, params[1] as string);
        }
        if (query.startsWith("SELECT data FROM turns"))
          rows = [...this.turns]
            .filter(([n]) => n >= (params[0] as number))
            .sort((a, b) => a[0] - b[0])
            .map(([, data]) => ({ data }));
        if (query.startsWith("DELETE FROM turns")) this.turns.clear();
        return { toArray: () => rows as T[] };
      },
    },
  };
  blockConcurrencyWhile<T>(callback: () => Promise<T>) {
    this.ready = callback();
    return this.ready as Promise<T>;
  }
  getWebSockets() {
    return this.sockets.filter((s) => s.readyState === 1);
  }
  acceptWebSocket(socket: Socket) {
    this.sockets.push(socket);
  }
  socket() {
    const frames: Uint8Array[] = [];
    let open = true;
    let attachment: unknown = {
      window: Date.now(),
      count: 0,
      connectedAt: Date.now(),
    };
    const socket = {
      get readyState() {
        return open ? 1 : 3;
      },
      send: (bytes: Uint8Array) => frames.push(bytes.slice()),
      close: () => {
        open = false;
      },
      serializeAttachment: (x: unknown) => {
        attachment = structuredClone(x);
      },
      deserializeAttachment: () => structuredClone(attachment),
    } as unknown as Socket;
    this.sockets.push(socket);
    return { socket, frames };
  }
}
async function cluster() {
  const rooms = new Map<string, { logic: GameRoom; state: TestState }>();
  const env = {
    BUILD_ID: "test-build",
    ALLOWED_ORIGINS: "http://localhost:8788",
  } as Env;
  const directoryState = new TestState();
  const directory = new LobbyDirectory(
    directoryState as unknown as DurableState,
    env,
  );
  env.DIRECTORY = {
    idFromName: (name) => name,
    get: () => ({
      fetch: async (req) => {
        await directoryState.ready;
        return directory.fetch(req);
      },
    }),
  };
  env.ROOMS = {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (req) => {
        let entry = rooms.get(String(id));
        if (!entry) {
          const state = new TestState();
          entry = {
            state,
            logic: new GameRoom(state as unknown as DurableState, env),
          };
          rooms.set(String(id), entry);
        }
        await entry.state.ready;
        return entry.logic.fetch(req);
      },
    }),
  };
  const owner = crypto.randomUUID();
  const guest = crypto.randomUUID();
  const request = (path: string, token: string = owner, body?: object) =>
    new Request(`http://localhost:8788${path}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:8788",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const result = await worker.fetch(request("/api/create_game"), env);
  expect(result.status).toBe(200);
  const info = (await result.json()) as { gameID: string };
  const entry = rooms.get(info.gameID)!;
  const clients = [entry.state.socket(), entry.state.socket()];
  for (let i = 0; i < 2; i++)
    await entry.logic.webSocketMessage(
      clients[i].socket,
      encodeClientMessage(
        {
          type: "join",
          gameID: info.gameID,
          token: i ? guest : owner,
          username: i ? "Guest" : "Host",
          clanTag: null,
          turnstileToken: null,
          gitCommit: env.BUILD_ID,
        },
        undefined,
      ).buffer,
    );
  const read = (index: number) =>
    clients[index].frames.map((bytes) => decodeServerMessage(bytes, undefined));
  const send = async (index: number, msg: ClientMessage) =>
    entry.logic.webSocketMessage(
      clients[index].socket,
      encodeClientMessage(msg, undefined).buffer,
    );
  return {
    env,
    rooms,
    entry,
    info,
    clients,
    read,
    send,
    request,
    owner,
    guest,
  };
}
describe("Cloudflare room coordination", () => {
  it("assigns distinct IDs, protects host controls, and never exposes guest tokens", async () => {
    const c = await cluster();
    const messages = c.read(0);
    const lobby = messages
      .slice()
      .reverse()
      .find((m) => m.type === "lobby_info")!;
    expect(lobby.type).toBe("lobby_info");
    if (lobby.type !== "lobby_info") return;
    expect(new Set(lobby.lobby.clients!.map((p) => p.clientID)).size).toBe(2);
    expect(JSON.stringify(messages)).not.toContain(c.owner);
    expect(JSON.stringify(messages)).not.toContain(c.guest);
    await c.send(1, {
      type: "intent",
      intent: { type: "toggle_game_start_timer" },
    });
    expect(
      c.read(1).some((m) => m.type === "error" && m.error.includes("creator")),
    ).toBe(true);
    const meta = c.entry.state.values.get("meta") as { startsAt?: number };
    expect(meta.startsAt).toBeUndefined();
  });
  it("rejects forged tokens, foreign origins, and malformed binary messages", async () => {
    const c = await cluster();
    expect(
      (await worker.fetch(c.request("/api/create_game", "bogus"), c.env))
        .status,
    ).toBe(401);
    const foreign = new Request("https://backend/api/create_game", {
      method: "POST",
      headers: { Origin: "https://foreign.example" },
    });
    expect((await worker.fetch(foreign, c.env)).status).toBe(403);
    const bad = c.entry.state.socket();
    await c.entry.logic.webSocketMessage(
      bad.socket,
      new Uint8Array([255, 255, 255]).buffer,
    );
    expect(bad.socket.readyState).toBe(3);
  });
  it("allows the host to list and unlist the lobby", async () => {
    const c = await cluster();
    const path = `/w0/api/game/${c.info.gameID}/listing`;
    expect(
      (await worker.fetch(c.request(path, c.guest, { listed: true }), c.env))
        .status,
    ).toBe(403);
    const listed = await worker.fetch(
      c.request(path, c.owner, { listed: true, maxPlayers: 500 }),
      c.env,
    );
    const body = (await listed.json()) as {
      listed: boolean;
      gameConfig: { maxPlayers: number };
    };
    expect(body.listed).toBe(true);
    expect(body.gameConfig.maxPlayers).toBe(32);
    const unlisted = await worker.fetch(
      c.request(path, c.owner, { listed: false }),
      c.env,
    );
    expect((await unlisted.json()).listed).toBe(false);
  });
  it("lets the host start early without cancelling the public listing deadline", async () => {
    const c = await cluster();
    await worker.fetch(
      c.request(`/api/game/${c.info.gameID}/listing`, c.owner, {
        listed: true,
        autoStartMs: 300000,
      }),
      c.env,
    );
    await c.send(0, {
      type: "intent",
      intent: { type: "toggle_game_start_timer" },
    });
    const meta = c.entry.state.values.get("meta") as {
      startsAt: number;
      autoStartAt: number;
    };
    expect(meta.startsAt).toBeLessThan(Date.now() + 10000);
    expect(meta.autoStartAt).toBeGreaterThan(Date.now() + 200000);
  });
  it("persists kicks and rejects the same identity on reconnect", async () => {
    const c = await cluster();
    const lobby = c
      .read(1)
      .slice()
      .reverse()
      .find((m) => m.type === "lobby_info");
    if (lobby?.type !== "lobby_info") throw new Error("missing lobby");
    await c.send(0, {
      type: "intent",
      intent: { type: "kick_player", targetClientID: lobby.myClientID },
    });
    const reconnect = c.entry.state.socket();
    const logic = new GameRoom(c.entry.state as unknown as DurableState, c.env);
    await c.entry.state.ready;
    await logic.webSocketMessage(
      reconnect.socket,
      encodeClientMessage(
        {
          type: "join",
          gameID: c.info.gameID,
          token: c.guest,
          username: "Guest",
          clanTag: null,
          turnstileToken: null,
          gitCommit: c.env.BUILD_ID,
        },
        undefined,
      ).buffer,
    );
    expect(reconnect.socket.readyState).toBe(3);
  });
  it("persists starts, ordered turns, stamped identities and rejoin history", async () => {
    const c = await cluster();
    await c.send(0, {
      type: "intent",
      intent: { type: "toggle_game_start_timer" },
    });
    const m = c.entry.state.values.get("meta") as {
      startsAt: number;
      prestartedAt: number;
    };
    m.startsAt = Date.now() - 100;
    await c.entry.state.storage.put("meta", m);
    let logic = new GameRoom(c.entry.state as unknown as DurableState, c.env);
    await c.entry.state.ready;
    await logic.alarm();
    const pre = c.entry.state.values.get("meta") as { prestartedAt: number };
    pre.prestartedAt = Date.now() - 2100;
    await c.entry.state.storage.put("meta", pre);
    logic = new GameRoom(c.entry.state as unknown as DurableState, c.env);
    await c.entry.state.ready;
    await logic.alarm();
    const start = c.clients[0].frames
      .map((b) => decodeServerMessage(b, undefined))
      .slice()
      .reverse()
      .find((m) => m.type === "start")!;
    expect(start.type).toBe("start");
    if (start.type !== "start") return;
    const wire = createGameWireContext(start.gameStartInfo.players);
    await logic.webSocketMessage(
      c.clients[0].socket,
      encodeClientMessage(
        {
          type: "intent",
          intent: { type: "strategy", op: "policy", key: "industry" },
        },
        wire,
      ).buffer,
    );
    await logic.alarm();
    const frames = c.clients[0].frames.map((b) => decodeServerMessage(b, wire));
    const turn = frames
      .slice()
      .reverse()
      .find((m) => m.type === "turn");
    expect(turn?.type).toBe("turn");
    if (turn?.type !== "turn") return;
    expect(turn.turn.turnNumber).toBe(0);
    expect(turn.turn.intents[0].clientID).toBe(start.myClientID);
    expect(c.entry.state.turns.size).toBe(1);
    c.clients[1].socket.close();
    await logic.webSocketClose(c.clients[1].socket);
    const reconnect = c.entry.state.socket();
    logic = new GameRoom(c.entry.state as unknown as DurableState, c.env);
    await c.entry.state.ready;
    await logic.webSocketMessage(
      reconnect.socket,
      encodeClientMessage(
        {
          type: "rejoin",
          gameID: c.info.gameID,
          token: c.guest,
          lastTurn: 0,
          gitCommit: c.env.BUILD_ID,
        },
        wire,
      ).buffer,
    );
    const replay = decodeServerMessage(reconnect.frames[0], undefined);
    expect(replay.type).toBe("start");
    if (replay.type === "start") expect(replay.turns[0]).toEqual(turn.turn);
  });
  it("refuses joining a room created with a different build", async () => {
    const c = await cluster();
    const newer = { ...c.env, BUILD_ID: "new-build" };
    const logic = new GameRoom(c.entry.state as unknown as DurableState, newer);
    await c.entry.state.ready;
    expect((await logic.fetch(new Request("https://room/info"))).status).toBe(
      409,
    );
  });
});
