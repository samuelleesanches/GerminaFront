import { GameType } from "../core/game/Game";
import {
  GameConfigSchema,
  GameInfo,
  PublicLobbyMessage,
} from "../core/Schemas";
import { encodeLobbyMessage } from "../core/ZbinWire";
import { DEFAULT_CONFIG, Env, json, newId, room } from "./common";
import { type DurableState, type Socket, socketPair, upgrade } from "./runtime";

interface Listing {
  info: GameInfo;
  expires: number;
}
export class LobbyDirectory {
  private listings = new Map<string, Listing>();
  constructor(
    private ctx: DurableState,
    private env: Env,
  ) {
    ctx.blockConcurrencyWhile(async () => {
      this.listings =
        (await ctx.storage.get<Map<string, Listing>>("listings")) ?? new Map();
    });
  }

  private message(): PublicLobbyMessage {
    const games = [...this.listings.values()]
      .filter((l) => l.expires > Date.now() && l.info.listed)
      .map(({ info }) => ({
        gameID: info.gameID,
        numClients: (info.clients ?? []).filter((c) => !c.spectator).length,
        startsAt: info.startsAt ?? info.autoStartAt,
        gameConfig: info.gameConfig,
        publicGameType: "special" as const,
        custom: true,
      }));
    return {
      type: "full",
      serverTime: Date.now(),
      games: { ["special"]: games },
      gitCommit: this.env.BUILD_ID,
      active: true,
    };
  }
  private broadcast() {
    const bytes = encodeLobbyMessage(this.message());
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(bytes);
      } catch {
        ws.close();
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/create") {
      const { owner, input } = (await request.json()) as {
        owner: string;
        input: unknown;
      };
      const last = (await this.ctx.storage.get<number>(`rate:${owner}`)) ?? 0;
      if (Date.now() - last < 10000)
        return json({ error: "wait_10_seconds" }, 429);
      for (const [id, l] of this.listings)
        if (l.expires <= Date.now()) this.listings.delete(id);
      if (this.listings.size >= 100)
        return json({ error: "server_capacity" }, 503);
      const parsed = GameConfigSchema.safeParse({
        ...DEFAULT_CONFIG,
        ...(input as object),
      });
      if (!parsed.success || parsed.data.gameType !== GameType.Private)
        return json({ error: "invalid_game_config" }, 400);
      let id = newId();
      while (this.listings.has(id)) id = newId();
      const result = await room(this.env, id).fetch(
        new Request("https://room/init", {
          method: "POST",
          body: JSON.stringify({ id, owner, config: parsed.data }),
        }),
      );
      if (!result.ok) return result;
      const info = (await result.json()) as GameInfo;
      this.listings.set(id, { info, expires: Date.now() + 7200000 });
      await this.ctx.storage.put({
        listings: this.listings,
        [`rate:${owner}`]: Date.now(),
      });
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      this.broadcast();
      return json(info);
    }
    if (path === "/update") {
      const info = (await request.json()) as GameInfo;
      const old = this.listings.get(info.gameID);
      if (old) old.info = info;
      await this.ctx.storage.put("listings", this.listings);
      this.broadcast();
      return json({ ok: true });
    }
    if (path === "/remove") {
      this.listings.delete(await request.text());
      await this.ctx.storage.put("listings", this.listings);
      this.broadcast();
      return json({ ok: true });
    }
    if (path === "/lobbies") {
      if (this.ctx.getWebSockets().length >= 512)
        return json({ error: "capacity" }, 503);
      const pair = socketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(encodeLobbyMessage(this.message()));
      return upgrade(pair[0]);
    }
    return json({ error: "not_found" }, 404);
  }
  async alarm() {
    for (const [id, listing] of this.listings)
      if (listing.expires <= Date.now()) this.listings.delete(id);
    // Guest creation rate records expire as well, keeping storage bounded.
    const rates = await this.ctx.storage.list<number>({ prefix: "rate:" });
    for (const [key, at] of rates)
      if (Date.now() - at > 60000) await this.ctx.storage.delete(key);
    await this.ctx.storage.put("listings", this.listings);
    this.broadcast();
    if (this.listings.size || this.ctx.getWebSockets().length)
      await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
  webSocketMessage(ws: Socket) {
    ws.close(1008, "broadcast_only");
  }
  webSocketClose() {}
  webSocketError(ws: Socket) {
    try {
      ws.close();
    } catch {
      /* The peer may already have closed. */
    }
  }
}
