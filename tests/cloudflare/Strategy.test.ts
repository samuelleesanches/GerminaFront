import { describe, expect, it } from "vitest";
import { identity, originAllowed } from "../../src/cloudflare/common";
import { Config } from "../../src/core/configuration/Config";
import { SpawnExecution } from "../../src/core/execution/SpawnExecution";
import { PlayerInfo, PlayerType } from "../../src/core/game/Game";
import {
  restoreGame,
  snapshotGame,
} from "../../src/core/snapshot/GameSnapshot";
import { RESOURCES } from "../../src/core/strategy/Definitions";
import {
  StrategicWorld,
  strategicWorld,
} from "../../src/core/strategy/StrategicWorld";
import {
  createGameWireContext,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from "../../src/core/ZbinWire";
import { setup } from "../util/Setup";

async function fixture() {
  const game = await setup("ocean_and_land", {
    strategy: { enabled: true, events: false, victory: "balanced" },
    spawnImmunityDuration: 0,
  });
  for (const [index, id] of ["Alpha888", "Bravo888"].entries()) {
    const info = new PlayerInfo(id, PlayerType.Human, id, id);
    game.addPlayer(info);
    game.addExecution(
      new SpawnExecution("Test8888", info, game.ref(1, 10 + index * 5)),
    );
  }
  game.executeNextTick();
  game.executeNextTick();
  const a = game.player("Alpha888"),
    b = game.player("Bravo888");
  a.addGold(100000n);
  b.addGold(100000n);
  const world = new StrategicWorld(game, "Test8888");
  world.ensure(a);
  world.ensure(b);
  return { game, a, b, world };
}

describe("Strategic systems on the existing OpenFront simulation", () => {
  it("repeats identical turns and actions deterministically", async () => {
    const x = await fixture(),
      y = await fixture();
    for (const f of [x, y]) {
      f.world.action(f.a, { op: "policy", key: "technology" });
      f.world.action(f.a, { op: "workforce", key: "science" });
      f.world.action(f.a, { op: "research", key: "technology" });
      for (let t = 0; t < 240; t++) {
        f.game.executeNextTick();
        f.world.step(f.game.ticks());
      }
    }
    expect(x.world.save()).toEqual(y.world.save());
    expect(x.a.gold()).toBe(y.a.gold());
    expect(x.a.troops()).toBe(y.a.troops());
  });
  it("reduces agricultural production during drought", async () => {
    const { a, world } = await fixture();
    const c = world.ensure(a);
    c.weatherUntil = 1000;
    world.step(20);
    const production = c.production.food;
    c.weather = "drought";
    world.step(40);
    expect(c.production.food).toBeLessThan(production);
    expect(c.reasons).toContain("weather");
  });
  it("requires inputs and research for formations and investments", async () => {
    const { a, world } = await fixture();
    const c = world.ensure(a);
    const gold = a.gold();
    expect(world.action(a, { op: "recruit", key: "carriers" })).toBe(false);
    c.stocks.steel = 0;
    expect(world.action(a, { op: "build", key: "factory" })).toBe(false);
    expect(a.gold()).toBe(gold);
    expect(c.infrastructure.factory).toBe(0);
    c.stocks.steel = 30;
    c.stocks.wood = 30;
    expect(world.action(a, { op: "build", key: "factory" })).toBe(true);
    expect(a.gold()).toBe(gold - 2000n);
  });
  it("conserves resources and transfers gold between market participants", async () => {
    const { a, b, world } = await fixture();
    const ca = world.ensure(a),
      cb = world.ensure(b);
    ca.stocks.oil = 4;
    cb.stocks.oil = 100;
    const price = world.market.oil.price;
    const beforeA = a.gold(),
      beforeB = b.gold();
    expect(world.action(a, { op: "buy", key: "oil", amount: 10 })).toBe(true);
    expect(ca.stocks.oil + cb.stocks.oil).toBe(104);
    expect(ca.stocks.oil).toBe(14);
    expect(a.gold()).toBe(beforeA - BigInt(price * 10));
    expect(b.gold()).toBe(beforeB + BigInt(price * 10));
    expect(world.action(a, { op: "buy", key: "oil", amount: 1000 })).toBe(
      false,
    );
  });
  it("stops market trading under an embargo", async () => {
    const { a, b, world } = await fixture();
    world.ensure(b).stocks.oil = 200;
    expect(world.action(a, { op: "embargo", target: b.id() })).toBe(true);
    expect(world.action(a, { op: "buy", key: "oil", amount: 10 })).toBe(false);
  });
  it("requires the buyer to accept a contract and uses actual stocks", async () => {
    const { a, b, world } = await fixture();
    const ca = world.ensure(a),
      cb = world.ensure(b);
    ca.stocks.oil = 200;
    cb.stocks.oil = 10;
    expect(
      world.action(a, {
        op: "offer",
        target: b.id(),
        key: "oil",
        amount: 10,
        duration: 20,
      }),
    ).toBe(true);
    const contract = world.contracts[0];
    expect(contract.accepted).toBe(false);
    expect(world.action(a, { op: "accept", amount: contract.id })).toBe(false);
    expect(world.action(b, { op: "accept", amount: contract.id })).toBe(true);
    world.step(100);
    expect(contract.remaining).toBe(19);
    expect(cb.stocks.oil).toBeGreaterThan(10);
  });
  it("preserves strategic state and random state in the real game snapshot", async () => {
    const { game, a, world } = await fixture();
    world.action(a, { op: "research", key: "energy" });
    world.step(20);
    const bytes = snapshotGame(game, { gameID: "Test8888" });
    const fresh = await setup("ocean_and_land", {
      strategy: { enabled: true },
    });
    const restored = restoreGame(bytes, {
      config: (gc) => new Config(gc, null, false),
      gameMap: fresh.map(),
      miniGameMap: fresh.miniMap(),
    });
    expect(strategicWorld(restored)?.save()).toEqual(world.save());
  });
  it("uses integer, finite, bounded resource stocks over a long sequence", async () => {
    const { game, world } = await fixture();
    for (let i = 0; i < 1500; i++) {
      game.executeNextTick();
      world.step(game.ticks());
    }
    for (const c of world.countries.values())
      for (const r of RESOURCES) {
        expect(Number.isSafeInteger(c.stocks[r])).toBe(true);
        expect(c.stocks[r]).toBeGreaterThanOrEqual(0);
      }
  });
});
describe("Cloudflare wire and guest identity", () => {
  it("roundtrips the additional action through the existing binary protocol", () => {
    const context = createGameWireContext([
      { clientID: "Alpha888" },
      { clientID: "Bravo888" },
    ]);
    const message = {
      type: "intent" as const,
      intent: {
        type: "strategy" as const,
        op: "offer" as const,
        key: "oil",
        target: "Bravo888",
        amount: 10,
        duration: 20,
      },
    };
    expect(
      decodeClientMessage(encodeClientMessage(message, context), context),
    ).toEqual(message);
    const server = {
      type: "turn" as const,
      turn: {
        turnNumber: 0,
        intents: [{ ...message.intent, clientID: "Alpha888" }],
      },
    };
    expect(
      decodeServerMessage(encodeServerMessage(server, context), context),
    ).toEqual(server);
  });
  it("never trusts an unverified JWT or a non-UUID token", async () => {
    expect(
      await identity("eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.fake"),
    ).toBeNull();
    const token = crypto.randomUUID();
    expect(await identity(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(await identity(token)).toBe(await identity(token));
  });
  it("rejects cross-site WebSockets and allows explicit origins", () => {
    const env = { ALLOWED_ORIGINS: "https://example.pages.dev" } as never;
    expect(
      originAllowed(
        new Request("https://backend/", {
          headers: { Upgrade: "websocket", Origin: "https://evil.example" },
        }),
        env,
      ),
    ).toBe(false);
    expect(
      originAllowed(
        new Request("https://backend/", {
          headers: {
            Upgrade: "websocket",
            Origin: "https://example.pages.dev",
          },
        }),
        env,
      ),
    ).toBe(true);
  });
});
