import { ZbContext } from "../../zbin";
import { CloseCode, CloseReason } from "../core/CloseCodes";
import { GameType } from "../core/game/Game";
import {
  GameConfig,
  GameConfigSchema,
  GameInfo,
  GameStartInfo,
  PlayerSchema,
  ServerMessage,
  StampedIntent,
  Turn,
} from "../core/Schemas";
import {
  createGameWireContext,
  decodeClientMessage,
  encodeServerMessage,
} from "../core/ZbinWire";
import { authorizeIntent } from "../server/IntentAuthorization";
import { directory, Env, identity, json, newId } from "./common";
import { type DurableState, type Socket, socketPair, upgrade } from "./runtime";

interface Member {
  clientID: string;
  identity: string;
  username: string;
  clanTag: string | null;
  spectator: boolean;
  creator: boolean;
}
interface Meta {
  id: string;
  creator: string;
  createdAt: number;
  config: GameConfig;
  build: string;
  lastActiveAt: number;
  stage: "lobby" | "prestart" | "started" | "ended";
  startsAt?: number;
  autoStartAt?: number;
  prestartedAt?: number;
  startedAt?: number;
  groupToken: string;
  startInfo?: GameStartInfo;
  sequence: number;
  listed: boolean;
  successor?: string;
  banned?: string[];
}
interface Attachment {
  clientID?: string;
  window: number;
  count: number;
  connectedAt: number;
}

export class GameRoom {
  private meta: Meta | undefined;
  private members: Member[] = [];
  private pending: StampedIntent[] = [];
  private wire: ZbContext | undefined;
  private hashes = new Map<number, Map<string, number>>();
  constructor(
    private ctx: DurableState,
    private env: Env,
  ) {
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS turns (seq INTEGER PRIMARY KEY, data TEXT NOT NULL)",
    );
    ctx.blockConcurrencyWhile(async () => {
      this.meta = await ctx.storage.get<Meta>("meta");
      this.members = (await ctx.storage.get<Member[]>("members")) ?? [];
      this.pending = (await ctx.storage.get<StampedIntent[]>("pending")) ?? [];
      if (this.meta?.startInfo)
        this.wire = createGameWireContext(this.meta.startInfo.players);
    });
  }
  private sockets(id?: string): Socket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      if (ws.readyState !== 1) return false;
      const a = ws.deserializeAttachment() as Attachment;
      return (
        a.clientID !== undefined && (id === undefined || a.clientID === id)
      );
    });
  }
  private send(ws: Socket, msg: ServerMessage) {
    try {
      ws.send(encodeServerMessage(msg, this.wire));
    } catch {
      try {
        ws.close();
      } catch {
        /* The peer may already have closed. */
      }
    }
  }
  private broadcast(msg: ServerMessage) {
    for (const ws of this.sockets()) this.send(ws, msg);
  }
  private incompatibleBuild(): boolean {
    if (!this.meta || this.meta.build === this.env.BUILD_ID) return false;
    for (const ws of this.ctx.getWebSockets())
      ws.close(CloseCode.BadRequest, CloseReason.Forbidden);
    return true;
  }
  private info(): GameInfo {
    const m = this.meta!;
    const active = new Set(
      this.sockets().map(
        (ws) => (ws.deserializeAttachment() as Attachment).clientID,
      ),
    );
    return {
      gameID: m.id,
      serverTime: Date.now(),
      startsAt: m.startsAt,
      gameConfig: m.config,
      clients: this.members
        .filter((p) => active.has(p.clientID))
        .map((p) => ({
          clientID: p.clientID,
          username: p.username,
          clanTag: p.clanTag,
          spectator: p.spectator,
        })),
      lobbyCreatorClientID: this.members.find((p) => p.creator)?.clientID,
      listed: m.listed,
      autoStartAt: m.autoStartAt,
    };
  }
  private async save() {
    await this.ctx.storage.put({
      meta: this.meta!,
      members: this.members,
      pending: this.pending,
    });
  }
  private lobby() {
    for (const ws of this.sockets())
      this.send(ws, {
        type: "lobby_info",
        lobby: this.info(),
        myClientID: (ws.deserializeAttachment() as Attachment).clientID!,
        groupToken: this.meta!.groupToken,
      });
  }
  private async updateListing() {
    await directory(this.env).fetch(
      new Request("https://directory/update", {
        method: "POST",
        body: JSON.stringify(this.info()),
      }),
    );
  }
  private startFor(ws: Socket, lastTurn: number) {
    const meta = this.meta!;
    const from = Math.max(0, Math.min(meta.sequence, lastTurn));
    const turns = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM turns WHERE seq >= ? ORDER BY seq",
        from,
      )
      .toArray()
      .map((t) => JSON.parse(t.data) as Turn);
    this.send(ws, {
      type: "start",
      turns,
      gameStartInfo: meta.startInfo!,
      lobbyCreatedAt: meta.createdAt,
      myClientID: (ws.deserializeAttachment() as Attachment).clientID,
      groupToken: meta.groupToken,
    });
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/init") {
      if (this.meta) return json({ error: "already_exists" }, 409);
      const { id, owner, config } = (await request.json()) as {
        id: string;
        owner: string;
        config: GameConfig;
      };
      this.meta = {
        id,
        creator: owner,
        config,
        build: this.env.BUILD_ID,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        stage: "lobby",
        groupToken: crypto.randomUUID(),
        sequence: 0,
        listed: false,
      };
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return json(this.info());
    }
    if (this.incompatibleBuild()) {
      return json({ error: "version_mismatch", build: this.env.BUILD_ID }, 409);
    }
    if (!this.meta || this.meta.stage === "ended")
      return json({ error: "game_not_found" }, 404);
    if (path === "/info") return json(this.info());
    if (path === "/exists") return json({ exists: true, gameID: this.meta.id });
    if (path === "/listing") {
      const { owner, listed, autoStartMs, maxPlayers } =
        (await request.json()) as {
          owner: string;
          listed?: boolean;
          autoStartMs?: number;
          maxPlayers?: number;
        };
      if (owner !== this.meta.creator || this.meta.stage !== "lobby")
        return json({ error: "host_required" }, 403);
      this.meta.listed = listed === true;
      if (this.meta.listed) {
        this.meta.autoStartAt =
          Date.now() +
          Math.max(60000, Math.min(600000, Number(autoStartMs) || 300000));
        this.meta.config.maxPlayers = Math.max(
          2,
          Math.min(32, Math.floor(Number(maxPlayers) || 32)),
        );
      } else this.meta.autoStartAt = undefined;
      await this.save();
      await this.updateListing();
      this.lobby();
      return json(this.info());
    }
    if (path === "/successor") {
      const owner = await request.text();
      if (owner !== this.meta.creator || this.meta.stage !== "started")
        return json({ error: "host_required" }, 403);
      // A live private host can move the group into a fresh lobby; no identity is exposed.
      let result: Response;
      if (this.meta.successor) {
        const { room } = await import("./common");
        result = await room(this.env, this.meta.successor).fetch(
          new Request("https://room/info"),
        );
      } else {
        result = await directory(this.env).fetch(
          new Request("https://directory/create", {
            method: "POST",
            body: JSON.stringify({ owner, input: {} }),
          }),
        );
        if (result.ok) {
          const info = (await result.clone().json()) as GameInfo;
          this.meta.successor = info.gameID;
          await this.save();
        }
      }
      if (result.ok && this.meta.successor)
        this.broadcast({ type: "new_lobby", gameID: this.meta.successor });
      return result;
    }
    if (path === "/socket") {
      if (this.ctx.getWebSockets().length >= 48)
        return json({ error: "room_capacity" }, 503);
      const pair = socketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({
        window: Date.now(),
        count: 0,
        connectedAt: Date.now(),
      } satisfies Attachment);
      // An unauthenticated socket cannot keep the room alive indefinitely.
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      return upgrade(pair[0]);
    }
    return json({ error: "not_found" }, 404);
  }
  async webSocketMessage(ws: Socket, data: string | ArrayBuffer) {
    if (this.incompatibleBuild()) return;
    if (!this.meta || this.meta.stage === "ended") {
      ws.close(CloseCode.GameNotFound, CloseReason.GameNotFound);
      return;
    }
    const a = ws.deserializeAttachment() as Attachment;
    this.meta.lastActiveAt = Date.now();
    if (Date.now() - a.window > 1000) {
      a.window = Date.now();
      a.count = 0;
    }
    if (++a.count > 50 || typeof data === "string" || data.byteLength > 32768) {
      ws.close(CloseCode.BadRequest, CloseReason.InvalidMessage);
      return;
    }
    ws.serializeAttachment(a);
    let msg: ReturnType<typeof decodeClientMessage>;
    try {
      msg = decodeClientMessage(new Uint8Array(data), this.wire);
    } catch {
      ws.close(CloseCode.BadRequest, CloseReason.InvalidMessage);
      return;
    }
    if (msg.type === "join" || msg.type === "rejoin") {
      if (a.clientID !== undefined || msg.gameID !== this.meta.id) {
        ws.close(CloseCode.BadRequest, CloseReason.CannotJoin);
        return;
      }
      if (msg.gitCommit !== this.meta.build) {
        this.send(ws, {
          type: "error",
          error: "version_mismatch",
          gitCommit: this.env.BUILD_ID,
        });
        ws.close(CloseCode.BadRequest, CloseReason.Forbidden);
        return;
      }
      const account = await identity(msg.token);
      if (!account) {
        ws.close(CloseCode.Unauthorized, CloseReason.InvalidToken);
        return;
      }
      if (this.meta.banned?.includes(account)) {
        ws.close(CloseCode.Banned, CloseReason.Banned);
        return;
      }
      if (msg.type === "join" && this.env.TURNSTILE_SECRET) {
        if (!msg.turnstileToken) {
          ws.close(CloseCode.Unauthorized, CloseReason.TurnstileFailed);
          return;
        }
        const r = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: new URLSearchParams({
              secret: this.env.TURNSTILE_SECRET,
              response: msg.turnstileToken,
            }),
          },
        );
        if (!((await r.json()) as { success?: boolean }).success) {
          ws.close(CloseCode.Unauthorized, CloseReason.TurnstileFailed);
          return;
        }
      }
      let member = this.members.find((p) => p.identity === account);
      if (!member) {
        if (msg.type !== "join" || this.meta.stage !== "lobby") {
          ws.close(CloseCode.GameStarted, CloseReason.GameStarted);
          return;
        }
        const spectator = msg.spectator ?? false;
        if (
          !spectator &&
          this.members.filter((p) => !p.spectator).length >=
            Math.min(32, this.meta.config.maxPlayers ?? 32)
        ) {
          ws.close(CloseCode.LobbyFull, CloseReason.LobbyFull);
          return;
        }
        if (this.members.length >= 48) {
          ws.close(CloseCode.LobbyFull, CloseReason.LobbyFull);
          return;
        }
        member = {
          identity: account,
          clientID: newId(),
          username: msg.username,
          clanTag: msg.clanTag,
          spectator,
          creator: account === this.meta.creator,
        };
        this.members.push(member);
      }
      for (const old of this.sockets(member.clientID))
        old.close(1000, "replaced");
      a.clientID = member.clientID;
      ws.serializeAttachment(a);
      if (this.meta.stage === "started")
        this.startFor(ws, msg.type === "rejoin" ? msg.lastTurn : 0);
      else {
        this.lobby();
        await this.updateListing();
      }
      if (this.meta.stage === "started")
        this.pending.push({
          type: "mark_disconnected",
          clientID: member.clientID,
          isDisconnected: false,
        });
      await this.save();
      await this.ctx.storage.setAlarm(
        Date.now() + (this.meta.stage === "started" ? 100 : 1000),
      );
      return;
    }
    const member = this.members.find((p) => p.clientID === a.clientID);
    if (!member) {
      ws.close(CloseCode.Forbidden, CloseReason.CannotJoin);
      return;
    }
    if (msg.type === "ping") {
      this.send(ws, { type: "pong", sentAt: msg.sentAt });
      return;
    }
    if (msg.type === "spectate" && this.meta.stage === "lobby") {
      if (
        !msg.spectator &&
        this.members.filter((p) => !p.spectator).length >=
          (this.meta.config.maxPlayers ?? 32)
      )
        return;
      member.spectator = msg.spectator;
      await this.save();
      this.lobby();
      await this.updateListing();
      return;
    }
    if (
      msg.type === "hash" &&
      this.meta.stage === "started" &&
      !member.spectator
    ) {
      if (
        msg.turnNumber < Math.max(0, this.meta.sequence - 100) ||
        msg.turnNumber > this.meta.sequence
      )
        return;
      let votes = this.hashes.get(msg.turnNumber);
      if (!votes) {
        votes = new Map();
        this.hashes.set(msg.turnNumber, votes);
      }
      votes.set(member.clientID, msg.hash);
      if (votes.size >= 2) {
        const counts = new Map<number, number>();
        for (const value of votes.values())
          counts.set(value, (counts.get(value) ?? 0) + 1);
        const consensus = [...counts].sort((a, b) => b[1] - a[1])[0];
        if (counts.size > 1 && consensus[1] > votes.size / 2)
          for (const [id, hash] of votes)
            if (hash !== consensus[0])
              for (const target of this.sockets(id))
                this.send(target, {
                  type: "desync",
                  turn: msg.turnNumber,
                  correctHash: consensus[0],
                  clientsWithCorrectHash: consensus[1],
                  totalActiveClients: votes.size,
                  yourHash: hash,
                });
      }
      for (const turn of this.hashes.keys())
        if (turn < msg.turnNumber - 100) this.hashes.delete(turn);
      return;
    }
    if (msg.type !== "intent") return;
    const intent = msg.intent;
    const denied = authorizeIntent(
      intent,
      {
        clientID: member.clientID,
        isLobbyCreator: member.creator,
        isAdmin: false,
        isAdminBot: false,
      },
      {
        isPublic: false,
        isListed: this.meta.listed,
        isQueued: false,
        hasStarted: this.meta.stage !== "lobby",
      },
    );
    if (denied) {
      this.send(ws, { type: "error", error: denied.error ?? "forbidden" });
      return;
    }
    if (intent.type === "update_game_config") {
      const config = GameConfigSchema.safeParse({
        ...this.meta.config,
        ...intent.config,
      });
      if (!config.success || config.data.gameType !== GameType.Private) return;
      const safe = { ...config.data };
      delete safe.pool;
      delete safe.allowedPublicIds;
      delete safe.trusted;
      this.meta.config = {
        ...safe,
        maxPlayers: Math.min(32, safe.maxPlayers ?? 32),
      };
      await this.save();
      this.lobby();
      await this.updateListing();
      return;
    }
    if (intent.type === "toggle_game_start_timer") {
      if (
        !this.members.some(
          (p) => !p.spectator && this.sockets(p.clientID).length,
        )
      )
        return;
      this.meta.startsAt = this.meta.startsAt
        ? undefined
        : Date.now() + Math.max(2, this.meta.config.startDelay ?? 2) * 1000;
      await this.save();
      this.lobby();
      await this.updateListing();
      return;
    }
    if (intent.type === "kick_player") {
      if (intent.targetClientID === member.clientID) return;
      const target = this.members.find(
        (p) => p.clientID === intent.targetClientID,
      );
      if (!target) return;
      this.meta.banned ??= [];
      if (!this.meta.banned.includes(target.identity))
        this.meta.banned.push(target.identity);
      for (const old of this.sockets(target.clientID))
        old.close(CloseCode.Banned, CloseReason.Banned);
      if (this.meta.stage === "lobby")
        this.members = this.members.filter(
          (p) => p.clientID !== intent.targetClientID,
        );
      else
        this.pending.push({
          type: "mark_disconnected",
          clientID: target.clientID,
          isDisconnected: true,
        });
      await this.save();
      if (this.meta.stage === "lobby") {
        this.lobby();
        await this.updateListing();
      }
      return;
    }
    if (this.meta.stage !== "started" || member.spectator) return;
    if (this.pending.length >= 256) return;
    this.pending.push({ ...intent, clientID: member.clientID });
    await this.ctx.storage.put("pending", this.pending);
  }
  async alarm() {
    if (!this.meta) return;
    const now = Date.now();
    const incompatible = this.incompatibleBuild();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (!a.clientID && now - a.connectedAt > 10000)
        ws.close(CloseCode.BadRequest, CloseReason.CannotJoin);
    }
    if (
      incompatible ||
      now - this.meta.createdAt > 7200000 ||
      (this.meta.stage === "started" &&
        !this.sockets().length &&
        now - this.meta.lastActiveAt > 300000)
    ) {
      this.meta.stage = "ended";
      for (const ws of this.ctx.getWebSockets())
        ws.close(CloseCode.Normal, CloseReason.GameEnded);
      await directory(this.env).fetch(
        new Request("https://directory/remove", {
          method: "POST",
          body: this.meta.id,
        }),
      );
      this.ctx.storage.sql.exec("DELETE FROM turns");
      await this.ctx.storage.deleteAll();
      return;
    }
    let saved = false;
    const deadline = this.meta.startsAt ?? this.meta.autoStartAt;
    const full =
      this.meta.listed &&
      this.sockets().filter(
        (ws) =>
          !this.members.find(
            (m) =>
              m.clientID ===
              (ws.deserializeAttachment() as Attachment).clientID,
          )?.spectator,
      ).length >= (this.meta.config.maxPlayers ?? 32);
    if (
      this.meta.stage === "lobby" &&
      ((deadline !== undefined && now >= deadline) || full)
    ) {
      this.meta.stage = "prestart";
      this.meta.prestartedAt = now;
      this.broadcast({
        type: "prestart",
        gameMap: this.meta.config.gameMap,
        gameMapSize: this.meta.config.gameMapSize,
      });
    } else if (
      this.meta.stage === "prestart" &&
      now - this.meta.prestartedAt! >= 2000
    ) {
      this.members = this.members.filter(
        (m) => this.sockets(m.clientID).length,
      );
      this.meta.startInfo = {
        gameID: this.meta.id,
        lobbyCreatedAt: this.meta.createdAt,
        config: this.meta.config,
        listed: this.meta.listed,
        players: this.members
          .filter((p) => !p.spectator)
          .map((p) =>
            PlayerSchema.parse({
              clientID: p.clientID,
              username: p.username,
              clanTag: p.clanTag,
              isLobbyCreator: p.creator,
            }),
          ),
      };
      this.meta.stage = "started";
      this.meta.startedAt = now;
      this.wire = createGameWireContext(this.meta.startInfo.players);
      for (const ws of this.sockets()) this.startFor(ws, 0);
      await directory(this.env).fetch(
        new Request("https://directory/remove", {
          method: "POST",
          body: this.meta.id,
        }),
      );
    } else if (this.meta.stage === "started" && this.sockets().length) {
      const turn: Turn = {
        turnNumber: this.meta.sequence++,
        intents: this.pending,
      };
      this.pending = [];
      this.ctx.storage.sql.exec(
        "INSERT INTO turns(seq,data) VALUES (?,?)",
        turn.turnNumber,
        JSON.stringify(turn),
      );
      await this.save();
      saved = true;
      this.broadcast({ type: "turn", turn });
    } else if (this.meta.stage !== "started") this.lobby();
    if (!saved) await this.save();
    await this.ctx.storage.setAlarm(
      Date.now() +
        (this.meta.stage === "started" && this.sockets().length ? 100 : 1000),
    );
  }
  async webSocketClose(ws: Socket) {
    const a = ws.deserializeAttachment() as Attachment;
    if (
      this.meta?.stage === "started" &&
      a.clientID &&
      !this.sockets(a.clientID).length
    ) {
      this.pending.push({
        type: "mark_disconnected",
        clientID: a.clientID,
        isDisconnected: true,
      });
      await this.ctx.storage.put("pending", this.pending);
    } else if (this.meta?.stage === "lobby") {
      if (a.clientID && !this.sockets(a.clientID).length) {
        this.members = this.members.filter((p) => p.clientID !== a.clientID);
        await this.save();
      }
      this.lobby();
      await this.updateListing();
    }
  }
  async webSocketError(ws: Socket) {
    try {
      ws.close();
    } catch {
      /* The peer may already have closed. */
    }
    await this.webSocketClose(ws);
  }
}
