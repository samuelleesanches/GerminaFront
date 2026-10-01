import { Game, Player, PlayerType, TerrainType, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash } from "../Util";
import {
  INFRASTRUCTURE,
  Infrastructure,
  MILITARY,
  POLICIES,
  Policy,
  RECIPES,
  RESEARCH,
  Research,
  Resource,
  RESOURCES,
  StrategyAction,
  Terrain,
  Weather,
} from "./Definitions";

const record = <T extends string>(
  keys: readonly T[],
  initial: number,
): Record<T, number> =>
  Object.fromEntries(keys.map((k) => [k, initial])) as Record<T, number>;
const mul = (n: number, p: number) => Math.floor((n * p) / 100);
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export interface Country {
  id: string;
  name: string;
  x: number;
  y: number;
  tiles: number;
  terrain: Terrain;
  policy: Policy;
  personality: number;
  population: number;
  workforce: [number, number, number];
  stocks: Record<Resource, number>;
  production: Record<Resource, number>;
  consumption: Record<Resource, number>;
  deposits: Record<Resource, number>;
  survey: Record<Resource, number>;
  infrastructure: Record<Infrastructure, number>;
  research: Record<Research, number>;
  progress: Record<Research, number>;
  military: Record<string, number>;
  portfolio: Record<Policy, number>;
  stability: number;
  reputation: number;
  influence: number;
  tariff: number;
  sanctionedUntil: number;
  weather: Weather;
  weatherUntil: number;
  modifiers: {
    income: number;
    recruitment: number;
    land: number;
    sea: number;
    air: number;
  };
  reasons: string[];
  specialization: Resource;
  exports: number;
  imports: number;
  score: number;
  neutral: boolean;
}
export interface Contract {
  id: number;
  seller: string;
  buyer: string;
  resource: Resource;
  quantity: number;
  price: number;
  remaining: number;
  accepted: boolean;
  status: string;
  expires: number;
}
export interface Resolution {
  id: number;
  proposer: string;
  target: string;
  votes: Record<string, boolean>;
  expires: number;
}
export interface News {
  tick: number;
  key: string;
  country?: string;
  target?: string;
  resource?: string;
  value?: number;
}
export interface CountrySummary {
  id: string;
  name: string;
  x: number;
  y: number;
  terrain: Terrain;
  policy: Policy;
  weather: Weather;
  tiles: number;
  population: number;
  stability: number;
  reputation: number;
  influence: number;
  score: number;
  ports: number;
  military: number;
  income: number;
  specialization: Resource;
}
export interface StrategySnapshot {
  tick: number;
  me?: Country;
  countries: CountrySummary[];
  market: Record<Resource, { price: number; supply: number; demand: number }>;
  companies: Record<Policy, { price: number; history: number[] }>;
  contracts: Contract[];
  resolutions: Resolution[];
  news: News[];
  victory?: string;
}
export interface StrategySave {
  seed: number[];
  countries: Country[];
  market: StrategySnapshot["market"];
  companies: StrategySnapshot["companies"];
  contracts: Contract[];
  resolutions: Resolution[];
  news: News[];
  embargoes: string[];
  wars: string[];
  peace: [string, number][];
  sequence: number;
  tick: number;
  victory?: string;
}
const registry = new WeakMap<Game, StrategicWorld>();
export const strategicWorld = (game: Game): StrategicWorld | undefined =>
  registry.get(game);

export class StrategicWorld {
  countries = new Map<string, Country>();
  market: StrategySnapshot["market"] = Object.fromEntries(
    RESOURCES.map((r, i) => [
      r,
      { price: i < 13 ? 100 : 200, supply: 0, demand: 0 },
    ]),
  ) as StrategySnapshot["market"];
  companies: StrategySnapshot["companies"] = Object.fromEntries(
    POLICIES.map((p) => [p, { price: 1000, history: [1000] }]),
  ) as StrategySnapshot["companies"];
  contracts: Contract[] = [];
  resolutions: Resolution[] = [];
  news: News[] = [];
  embargoes = new Set<string>();
  wars = new Set<string>();
  peace = new Map<string, number>();
  private sequence = 0;
  private random: PseudoRandom;
  tick = 0;
  victory?: string;

  constructor(
    private game: Game,
    gameID: string,
  ) {
    this.random = new PseudoRandom(simpleHash(gameID) ^ 0x35f261a7);
    registry.set(game, this);
  }
  private pair(a: string, b: string) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }
  private notice(
    key: string,
    country?: string,
    target?: string,
    resource?: string,
    value?: number,
  ) {
    this.news.unshift({
      tick: this.tick,
      key,
      country,
      target,
      resource,
      value,
    });
    if (this.news.length > 40) this.news.length = 40;
  }
  private terrain(p: Player): Terrain {
    const ref = p.spawnTile();
    if (ref === undefined) return "plains";
    const type = this.game.terrainType(ref);
    if (type === TerrainType.Mountain) return "mountain";
    if (type === TerrainType.Highland) return "hill";
    if (this.game.isShoreline(ref)) return "coast";
    const band = Math.floor((this.game.y(ref) * 100) / this.game.height());
    const hash = simpleHash(`${ref}:${this.game.width()}`);
    if (band < 12 || band > 88) return "tundra";
    if (hash % 17 === 0) return "volcanic";
    if (band > 25 && band < 45 && hash % 3 === 0) return "desert";
    return hash % 4 === 0 ? "river" : hash % 3 === 0 ? "forest" : "plains";
  }
  ensure(p: Player): Country {
    const existing = this.countries.get(p.id());
    if (existing) return existing;
    const ref = p.spawnTile() ?? 0;
    const terrain = this.terrain(p);
    const h = simpleHash(`${p.id()}:${ref}`) >>> 0;
    const stocks = record(RESOURCES, 24);
    stocks.food = 140;
    stocks.water = 140;
    stocks.energy = 80;
    const deposits = record(RESOURCES, 0);
    for (const r of RESOURCES.slice(0, 12))
      deposits[r] = 1 + ((simpleHash(`${h}:${r}`) >>> 0) % 7);
    deposits.food += terrain === "plains" || terrain === "river" ? 6 : 0;
    deposits.iron += terrain === "mountain" || terrain === "hill" ? 6 : 0;
    deposits.rareEarths +=
      terrain === "mountain" || terrain === "volcanic" ? 5 : 0;
    deposits.oil += terrain === "desert" || terrain === "coast" ? 5 : 0;
    deposits.wood += terrain === "forest" ? 7 : 0;
    deposits.fish += terrain === "coast" || terrain === "archipelago" ? 7 : 0;
    const specialization: Resource =
      terrain === "desert"
        ? "oil"
        : terrain === "mountain"
          ? "rareEarths"
          : terrain === "tundra"
            ? "gas"
            : terrain === "river"
              ? "rice"
              : terrain === "forest"
                ? "coffee"
                : "wheat";
    const c: Country = {
      id: p.id(),
      name: p.name(),
      x: this.game.x(ref),
      y: this.game.y(ref),
      terrain,
      tiles: p.numTilesOwned(),
      policy: "diversified",
      personality: h % 7,
      population: 10000,
      workforce: [70, 20, 10],
      stocks,
      survey: record(RESOURCES, 0),
      production: record(RESOURCES, 0),
      consumption: record(RESOURCES, 0),
      deposits,
      infrastructure: record(INFRASTRUCTURE, 0),
      research: record(RESEARCH, 0),
      progress: record(RESEARCH, 0),
      military: record(Object.keys(MILITARY), 0),
      portfolio: record(POLICIES, 0),
      stability: 80,
      reputation: 60,
      influence: 0,
      tariff: 0,
      sanctionedUntil: 0,
      weather: "clear",
      weatherUntil: 0,
      neutral: false,
      modifiers: {
        income: 100,
        recruitment: 100,
        land: 100,
        sea: 100,
        air: 100,
      },
      reasons: [],
      specialization,
      exports: 0,
      imports: 0,
      score: 0,
    };
    this.countries.set(c.id, c);
    return c;
  }
  step(tick: number) {
    this.tick = tick;
    if (this.game.inSpawnPhase() || tick % 20 !== 0 || this.game.isPaused())
      return;
    const alive = this.game
      .players()
      .filter((p) => p.hasSpawned())
      .sort((a, b) => (a.id() < b.id() ? -1 : a.id() > b.id() ? 1 : 0));
    for (const p of alive) this.ensure(p);
    const current = new Set(alive.map((p) => p.id()));
    for (const [id] of this.countries)
      if (!current.has(id)) this.countries.delete(id);
    for (const r of RESOURCES) {
      this.market[r].supply = 0;
      this.market[r].demand = 0;
    }
    for (const p of alive) {
      const c = this.countries.get(p.id())!;
      this.climate(c);
      this.economy(p, c);
      if (p.type() !== PlayerType.Human && tick % 100 === 0) this.ai(p, c);
    }
    for (const key of this.wars) {
      const [a, b] = key.split(":");
      if (!current.has(a) || !current.has(b)) this.wars.delete(key);
    }
    this.trade();
    for (const r of RESOURCES) {
      const m = this.market[r];
      const base = RESOURCES.indexOf(r) < 13 ? 100 : 200;
      const target = clamp(
        Math.floor((base * (m.demand + 20)) / (m.supply + 20)),
        Math.floor(base / 2),
        base * 4,
      );
      m.price = Math.floor((m.price * 9 + target) / 10);
    }
    if (tick % 100 === 0) {
      this.stocks();
      this.events();
      this.assembly();
    }
    this.contracts = this.contracts
      .filter(
        (c) =>
          c.remaining > 0 &&
          c.expires >= tick &&
          this.countries.has(c.seller) &&
          this.countries.has(c.buyer),
      )
      .slice(-128);
    for (const [key, expires] of this.peace)
      if (expires <= tick) this.peace.delete(key);
    this.checkVictory();
  }
  private climate(c: Country) {
    if (this.tick < c.weatherUntil) return;
    const settings = this.game.config().gameConfig().strategy;
    const chance =
      settings?.preset === "chaotic"
        ? 55
        : settings?.preset === "casual"
          ? 15
          : 30;
    let weather: Weather = "clear";
    if (this.random.nextInt(0, 100) < chance) {
      const options: Weather[] =
        c.terrain === "desert"
          ? ["heat", "drought", "sandstorm"]
          : c.terrain === "tundra"
            ? ["snow", "fog", "storm"]
            : c.terrain === "coast" || c.infrastructure.port > 0
              ? ["rain", "seaStorm", "cyclone", "fog"]
              : ["rain", "storm", "snow", "fog", "heat", "drought", "flood"];
      weather = options[this.random.nextInt(0, options.length)];
    }
    if (
      weather !== c.weather &&
      weather !== "clear" &&
      this.game.player(c.id).type() !== PlayerType.Bot
    )
      this.notice("weather", c.id, undefined, weather);
    c.weather = weather;
    c.weatherUntil = this.tick + this.random.nextInt(12, 25) * 20;
  }
  private economy(p: Player, c: Country) {
    const settings = this.game.config().gameConfig().strategy;
    c.tiles = p.numTilesOwned();
    if (this.tick % 100 === 0 || !Object.values(c.survey).some(Boolean)) {
      let count = 0,
        mountains = 0,
        hills = 0,
        shores = 0;
      for (const tile of p.tiles()) {
        if (++count > 64) break;
        const terrain = this.game.terrainType(tile);
        if (terrain === TerrainType.Mountain) mountains++;
        if (terrain === TerrainType.Highland) hills++;
        if (this.game.isShoreline(tile)) shores++;
      }
      const total = Math.min(64, count) || 1;
      c.survey.iron = Math.floor(((mountains + hills) * 8) / total);
      c.survey.rareEarths = Math.floor((mountains * 7) / total);
      c.survey.food = Math.floor(((total - mountains - hills) * 5) / total);
      c.survey.fish = Math.floor((shores * 8) / total);
      if (shores > total / 3) c.terrain = "coast";
    }
    const scale = Math.min(50, 3 + Math.floor(c.tiles / 600));
    const workforce = c.workforce[0];
    const factories = c.infrastructure.factory + p.unitCount(UnitType.Factory);
    const ports = c.infrastructure.port + p.unitCount(UnitType.Port);
    const workers = clamp(50 + workforce, 70, 130);
    const agriculture =
      c.weather === "drought" || c.weather === "heat"
        ? 65
        : c.weather === "flood" || c.weather === "snow"
          ? 75
          : c.weather === "rain"
            ? 110
            : 100;
    c.production = record(RESOURCES, 0);
    c.consumption = record(RESOURCES, 0);
    c.reasons = [];
    if (agriculture < 100) c.reasons.push("weather");
    for (const r of RESOURCES.slice(0, 12)) {
      let n = Math.floor(
        ((c.deposits[r] + c.survey[r] + scale) * (settings?.resources ?? 100)) /
          100,
      );
      n = mul(n, workers);
      if (["food", "water", "wood"].includes(r))
        n = mul(n, agriculture + c.research.agriculture * 8);
      if (["food", "fish"].includes(r) && c.policy === "agriculture")
        n = mul(n, 150);
      if (
        ["oil", "gas", "coal", "uranium"].includes(r) &&
        c.policy === "energy"
      )
        n = mul(n, 150);
      if (r === "fish") n += ports * 3;
      if (r === "oil" || r === "gas") n += ports * 2;
      c.production[r] = n;
      c.stocks[r] += n;
    }
    const regional = c.specialization;
    if (["coffee", "rice", "wheat"].includes(regional)) {
      c.production[regional] = mul(
        scale * 2 + c.research.agriculture,
        agriculture,
      );
      c.stocks[regional] += c.production[regional];
    }
    // Energy plants draw actual fuel from the same stocks industry and trade use.
    let energy = 14 + c.research.energy * 4;
    for (const [plant, resource] of [
      ["coalPower", "coal"],
      ["oilPower", "oil"],
      ["gasPower", "gas"],
      ["nuclear", "uranium"],
    ] as const) {
      const count = Math.min(
        c.infrastructure[plant],
        Math.floor(c.stocks[resource] / 2),
      );
      c.stocks[resource] -= count * 2;
      c.consumption[resource] += count * 2;
      energy += count * (plant === "nuclear" ? 35 : 14);
    }
    energy +=
      c.infrastructure.solar *
      (c.weather === "storm" || c.weather === "snow" ? 5 : 12);
    energy += c.infrastructure.wind * (c.weather === "storm" ? 16 : 10);
    energy += c.infrastructure.hydro * (c.weather === "drought" ? 4 : 16);
    c.production.energy = energy;
    c.stocks.energy += energy;
    const foodNeed =
      6 + Math.floor(c.population / 4000) + Math.floor(c.workforce[1] / 10);
    const food = Math.min(c.stocks.food, foodNeed);
    c.stocks.food -= food;
    c.consumption.food = foodNeed;
    const waterNeed = 4 + Math.floor(c.population / 6000);
    c.stocks.water -= Math.min(c.stocks.water, waterNeed);
    c.consumption.water = waterNeed;
    if (food < foodNeed) {
      c.stability = Math.max(30, c.stability - 3);
      c.population = Math.max(1000, mul(c.population, 99));
      c.reasons.push("food");
    } else {
      c.stability = Math.min(100, c.stability + 1);
      c.population += 15 + c.infrastructure.health * 10;
    }
    c.population = Math.min(
      c.population,
      20000 + c.tiles * 5 + c.infrastructure.health * 3000,
    );
    if (c.policy === "technology")
      c.specialization =
        c.research.technology >= 2 ? "semiconductors" : "electronics";
    else if (c.policy === "industry") c.specialization = "vehicles";
    else if (c.policy === "defense") c.specialization = "weapons";
    else if (c.policy === "maritime") c.specialization = "ships";
    for (const recipe of RECIPES) {
      if (recipe.research && c.research[recipe.research] < (recipe.level ?? 1))
        continue;
      const requested =
        c.policy === recipe.sector
          ? 3 + factories
          : 1 + Math.floor(factories / 2);
      let amount = requested;
      for (const [r, needed] of Object.entries(recipe.inputs))
        amount = Math.min(
          amount,
          Math.floor(c.stocks[r as Resource] / needed!),
        );
      if (amount < requested && recipe.sector === c.policy)
        c.reasons.push("materials");
      for (const [r, n] of Object.entries(recipe.inputs)) {
        c.stocks[r as Resource] -= amount * n!;
        c.consumption[r as Resource] += requested * n!;
      }
      c.stocks[recipe.output] += amount;
      c.production[recipe.output] += amount;
    }
    const upkeep =
      Math.floor(
        Object.entries(c.military).reduce(
          (total, [key, count]) => total + count * MILITARY[key].cost,
          0,
        ) / 150,
      ) +
      c.workforce[1] * 2;
    p.removeGold(BigInt(Math.min(Number(p.gold()), upkeep)));
    const energyShort = c.stocks.energy < 5;
    if (energyShort) c.reasons.push("energy");
    const income = clamp(
      70 +
        Math.floor(workforce / 2) +
        c.research.economy * 3 +
        c.infrastructure.roads * 2 +
        c.infrastructure.rail * 3 +
        c.infrastructure.internet * 2 +
        c.infrastructure.airport +
        Math.floor(c.stability / 10) -
        (food < foodNeed ? 20 : 0) -
        (energyShort ? 15 : 0),
      60,
      145,
    );
    const recruitment = clamp(
      65 +
        c.workforce[1] * 2 +
        c.research.military * 4 +
        c.infrastructure.base * 2 -
        (food < foodNeed ? 20 : 0),
      70,
      165,
    );
    const power = { land: 0, air: 0, sea: 0 };
    for (const [key, count] of Object.entries(c.military))
      for (const kind of ["land", "air", "sea"] as const)
        power[kind] += MILITARY[key][kind] * count;
    c.modifiers = {
      income,
      recruitment,
      land: clamp(
        100 + Math.floor(power.land / 10) + c.research.military * 3,
        100,
        130,
      ),
      air: clamp(
        100 + Math.floor(power.air / 10) + c.research.aviation * 3,
        100,
        140,
      ),
      sea: clamp(
        100 + Math.floor(power.sea / 10) + c.research.navy * 3,
        100,
        145,
      ),
    };
    for (const key of RESEARCH)
      if (c.progress[key] > 0) {
        c.progress[key] +=
          c.infrastructure.internet +
          Math.max(1, Math.floor(c.workforce[2] / 5)) +
          c.infrastructure.research * 2 +
          c.infrastructure.education;
        if (c.progress[key] >= 70 + c.research[key] * 50) {
          c.progress[key] = 0;
          c.research[key]++;
          this.notice("research", c.id, undefined, key, c.research[key]);
        }
      }
    c.influence +=
      (c.policy === "trade" || c.policy === "technology" ? 2 : 1) +
      Math.floor(c.reputation / 80);
    c.score +=
      Math.floor(c.population / 10000) +
      Math.floor(c.stability / 40) +
      Math.floor(income / 40) +
      Math.floor(c.influence / 100) +
      RESEARCH.reduce((s, k) => s + c.research[k], 0);
    for (const r of RESOURCES) {
      this.market[r].supply += c.production[r];
      this.market[r].demand += c.consumption[r];
      c.stocks[r] = Math.min(
        50000 + c.infrastructure.silo * 5000,
        Math.max(0, c.stocks[r]),
      );
    }
  }
  private consume(
    c: Country,
    costs: Partial<Record<Resource, number>>,
  ): boolean {
    for (const [r, n] of Object.entries(costs))
      if (c.stocks[r as Resource] < n!) return false;
    for (const [r, n] of Object.entries(costs)) c.stocks[r as Resource] -= n!;
    return true;
  }
  private pay(p: Player, amount: number) {
    if (p.gold() < BigInt(amount)) return false;
    p.removeGold(BigInt(amount));
    return true;
  }
  action(player: Player, action: StrategyAction): boolean {
    if (
      !player.isAlive() ||
      this.game.inSpawnPhase() ||
      !this.game.config().gameConfig().strategy?.enabled
    )
      return false;
    const c = this.ensure(player);
    const key = action.key ?? "";
    const amount = clamp(Math.floor(action.amount ?? 1), 1, 1000);
    const target = action.target
      ? this.countries.get(action.target)
      : undefined;
    let success = false;
    switch (action.op) {
      case "policy":
        if ((POLICIES as readonly string[]).includes(key)) {
          c.policy = key as Policy;
          success = true;
        }
        break;
      case "workforce": {
        if (key === "civil") c.workforce = [80, 10, 10];
        else if (key === "balanced") c.workforce = [70, 20, 10];
        else if (key === "military") c.workforce = [40, 50, 10];
        else if (key === "science") c.workforce = [50, 10, 40];
        else break;
        success = true;
        break;
      }
      case "build": {
        if (!(INFRASTRUCTURE as readonly string[]).includes(key)) break;
        const k = key as Infrastructure;
        const level = c.infrastructure[k];
        if (level >= 8) break;
        if (k === "nuclear" && c.research.energy < 2) break;
        const cost = (k === "nuclear" ? 12000 : 2000) * (level + 1);
        const inputs = { steel: 3 + level, wood: 3 + level };
        if (player.gold() < BigInt(cost) || !this.consume(c, inputs)) break;
        this.pay(player, cost);
        c.infrastructure[k]++;
        success = true;
        break;
      }
      case "research": {
        if (!(RESEARCH as readonly string[]).includes(key)) break;
        const k = key as Research;
        if (c.research[k] >= 4 || c.progress[k] > 0) break;
        if (!this.pay(player, 2500 * (c.research[k] + 1))) break;
        c.progress[k] = 1;
        success = true;
        break;
      }
      case "recruit": {
        const spec = MILITARY[key];
        if (
          !spec ||
          c.research[spec.research] < spec.level ||
          c.military[key] >= 20
        )
          break;
        const cost = spec.cost;
        if (
          player.gold() < BigInt(cost) ||
          c.population < 1100 ||
          !this.consume(c, spec.materials)
        )
          break;
        this.pay(player, cost);
        c.population -= 100;
        c.military[key]++;
        success = true;
        break;
      }
      case "buy":
      case "sell": {
        if (!(RESOURCES as readonly string[]).includes(key)) break;
        if (c.sanctionedUntil > this.tick) break;
        const r = key as Resource,
          m = this.market[r];
        if (action.op === "buy") {
          // Imports come from other living countries' surplus, so shortages cannot be bypassed with an infinite bank.
          const suppliers = [...this.countries.values()].filter(
            (s) => s.id !== c.id && s.stocks[r] > 50 && this.canTrade(s, c),
          );
          if (
            suppliers.reduce((n, s) => n + Math.max(0, s.stocks[r] - 50), 0) <
              amount ||
            player.gold() < BigInt(amount * m.price)
          )
            break;
          this.pay(player, amount * m.price);
          let left = amount;
          for (const s of suppliers) {
            const n = Math.min(left, s.stocks[r] - 50);
            s.stocks[r] -= n;
            c.stocks[r] += n;
            left -= n;
            this.game.player(s.id).addGold(BigInt(n * m.price));
            s.exports += n;
            if (!left) break;
          }
          c.imports += amount;
          m.demand += amount;
        } else {
          if (c.stocks[r] < amount) break;
          const buyers = [...this.countries.values()].filter(
            (b) => b.id !== c.id && b.stocks[r] < 150 && this.canTrade(c, b),
          );
          let left = amount;
          for (const b of buyers) {
            const buyer = this.game.player(b.id),
              n = Math.min(
                left,
                150 - b.stocks[r],
                Math.floor(Number(buyer.gold()) / m.price),
              );
            if (n <= 0) continue;
            buyer.removeGold(BigInt(n * m.price));
            player.addGold(BigInt(n * m.price));
            c.stocks[r] -= n;
            b.stocks[r] += n;
            b.imports += n;
            left -= n;
            if (!left) break;
          }
          if (left === amount) break;
          c.exports += amount - left;
          m.supply += amount - left;
        }
        success = true;
        break;
      }
      case "invest":
      case "divest": {
        if (!(POLICIES as readonly string[]).includes(key)) break;
        const k = key as Policy,
          price = this.companies[k].price;
        if (action.op === "invest") {
          if (!this.pay(player, price * amount)) break;
          c.portfolio[k] += amount;
        } else {
          if (c.portfolio[k] < amount) break;
          c.portfolio[k] -= amount;
          player.addGold(BigInt(price * amount));
        }
        success = true;
        break;
      }
      case "offer": {
        if (
          !target ||
          target.id === c.id ||
          !(RESOURCES as readonly string[]).includes(key) ||
          this.contracts.length >= 128
        )
          break;
        this.contracts.push({
          id: ++this.sequence,
          seller: c.id,
          buyer: target.id,
          resource: key as Resource,
          quantity: amount,
          price: this.market[key as Resource].price,
          remaining: clamp(action.duration ?? 20, 1, 60),
          accepted: false,
          status: "offered",
          expires: this.tick + 1200,
        });
        success = true;
        break;
      }
      case "accept": {
        const contract = this.contracts.find(
          (t) => t.id === action.amount && t.buyer === c.id && !t.accepted,
        );
        if (contract) {
          contract.accepted = true;
          contract.status = "active";
          contract.expires = this.tick + contract.remaining * 100 + 1200;
          success = true;
        }
        break;
      }
      case "tariff":
        c.tariff = clamp(action.amount ?? 0, 0, 30);
        success = true;
        break;
      case "embargo":
        if (target && target.id !== c.id) {
          const pair = `${c.id}:${target.id}`;
          if (this.embargoes.has(pair)) this.embargoes.delete(pair);
          else this.embargoes.add(pair);
          success = true;
        }
        break;
      case "aid":
        if (target && target.id !== c.id && c.stocks.food >= amount) {
          c.stocks.food -= amount;
          target.stocks.food += amount;
          c.reputation = Math.min(100, c.reputation + 3);
          c.influence += amount;
          success = true;
        }
        break;
      case "resolve":
        if (
          target &&
          target.id !== c.id &&
          c.influence >= 20 &&
          this.resolutions.length < 16
        ) {
          c.influence -= 20;
          this.resolutions.push({
            id: ++this.sequence,
            proposer: c.id,
            target: target.id,
            votes: { [c.id]: true },
            expires: this.tick + 200,
          });
          success = true;
        }
        break;
      case "vote": {
        const resolution = this.resolutions.find((r) => r.id === action.amount);
        if (resolution && this.game.player(c.id).type() !== PlayerType.Bot) {
          resolution.votes[c.id] = key === "yes";
          success = true;
        }
        break;
      }
      case "war":
        if (target && !c.neutral && target.id !== c.id) {
          this.wars.add(this.pair(c.id, target.id));
          c.reputation = Math.max(0, c.reputation - 6);
          this.notice("war", c.id, target.id);
          success = true;
        }
        break;
      case "peace":
        if (
          target &&
          target.id !== c.id &&
          this.game.player(c.id).isAlliedWith(this.game.player(target.id))
        ) {
          this.wars.delete(this.pair(c.id, target.id));
          this.peace.set(this.pair(c.id, target.id), this.tick + 300);
          c.reputation = Math.min(100, c.reputation + 4);
          this.notice("peace", c.id, target.id);
          success = true;
        }
        break;
      case "neutral":
        c.neutral = !c.neutral;
        success = true;
        break;
    }
    if (!success && player.type() === PlayerType.Human)
      this.notice("rejected", c.id, undefined, key);
    return success;
  }
  private canTrade(seller: Country, buyer: Country): boolean {
    return (
      seller.sanctionedUntil <= this.tick &&
      buyer.sanctionedUntil <= this.tick &&
      !this.embargoes.has(`${seller.id}:${buyer.id}`) &&
      !this.embargoes.has(`${buyer.id}:${seller.id}`) &&
      !this.wars.has(this.pair(seller.id, buyer.id)) &&
      this.game.player(seller.id).canTrade(this.game.player(buyer.id))
    );
  }
  private trade() {
    if (this.tick % 100 !== 0) return;
    for (const t of this.contracts) {
      const s = this.countries.get(t.seller),
        b = this.countries.get(t.buyer);
      if (!s || !b || !t.accepted) continue;
      const pa = this.game.player(s.id),
        pb = this.game.player(b.id);
      const ports = Math.min(
        s.infrastructure.port + pa.unitCount(UnitType.Port),
        b.infrastructure.port + pb.unitCount(UnitType.Port),
      );
      const overseas = Math.abs(s.x - b.x) + Math.abs(s.y - b.y) > 300;
      const weatherBlocked =
        ["cyclone", "seaStorm"].includes(s.weather) ||
        ["cyclone", "seaStorm"].includes(b.weather);
      if (!this.canTrade(s, b) || (overseas && (!ports || weatherBlocked))) {
        t.status = "blocked";
        continue;
      }
      const limit = (ports ? 20 + ports * 30 : 20) + s.infrastructure.rail * 10;
      const n = Math.min(t.quantity, s.stocks[t.resource], limit);
      const cost = n * t.price,
        tariff = mul(cost, b.tariff);
      if (!n || pb.gold() < BigInt(cost + tariff)) {
        t.status = "shortage";
        continue;
      }
      pb.removeGold(BigInt(cost + tariff));
      pa.addGold(BigInt(cost));
      s.stocks[t.resource] -= n;
      b.stocks[t.resource] += n;
      s.exports += n;
      b.imports += n;
      s.influence++;
      b.influence++;
      s.reputation = Math.min(100, s.reputation + 1);
      t.remaining--;
      t.status = n < t.quantity ? "partial" : "active";
    }
  }
  private ai(p: Player, c: Country) {
    if (c.policy === "diversified")
      c.policy = POLICIES[1 + (c.personality % 7)];
    if (c.stocks.food < 15)
      this.action(p, { op: "buy", key: "food", amount: 15 });
    else if (c.stocks[c.specialization] > 100)
      this.action(p, { op: "sell", key: c.specialization, amount: 10 });
    const key = RESEARCH[c.personality % RESEARCH.length];
    if (!c.progress[key]) this.action(p, { op: "research", key });
    if (c.infrastructure.factory < 3)
      this.action(p, {
        op: "build",
        key: c.policy === "technology" ? "research" : "factory",
      });
    if (c.personality === 0 || c.personality === 4) {
      c.workforce = [40, 50, 10];
      this.action(p, { op: "recruit", key: "infantry" });
    }
    if (c.personality === 3 || c.personality === 5) c.workforce = [50, 10, 40];
    for (const r of this.resolutions)
      if (
        c.id !== r.target &&
        c.id !== r.proposer &&
        !(c.id in r.votes) &&
        p.type() !== PlayerType.Bot
      )
        r.votes[c.id] = (this.countries.get(r.target)?.reputation ?? 60) < 45;
  }
  private stocks() {
    for (const policy of POLICIES) {
      const producers = [...this.countries.values()].filter(
        (c) => c.policy === policy,
      );
      const volume = producers.reduce(
        (n, c) => n + Object.values(c.production).reduce((s, x) => s + x, 0),
        0,
      );
      const crisis = producers.reduce((n, c) => n + c.reasons.length, 0);
      const warPremium =
        policy === "defense" ? this.wars.size * 60 : -this.wars.size * 10;
      const target = clamp(
        1000 + volume * 2 - crisis * 25 + warPremium,
        300,
        5000,
      );
      const company = this.companies[policy];
      company.price = Math.floor((company.price * 9 + target) / 10);
      company.history.push(company.price);
      if (company.history.length > 30) company.history.shift();
      for (const c of this.countries.values())
        if (c.portfolio[policy])
          this.game
            .player(c.id)
            .addGold(
              BigInt(c.portfolio[policy] * Math.floor(company.price / 100)),
            );
    }
  }
  private events() {
    if (this.game.config().gameConfig().strategy?.events === false) return;
    const countries = [...this.countries.values()].filter(
      (c) => this.game.player(c.id).type() !== PlayerType.Bot,
    );
    if (!countries.length || this.random.nextInt(0, 100) > 18) return;
    const c = countries[this.random.nextInt(0, countries.length)],
      event = this.random.nextInt(0, 8);
    if (event === 0) {
      c.deposits.oil += 4;
      this.notice("oil_discovery", c.id);
    } else if (event === 1) {
      c.deposits.rareEarths += 4;
      this.notice("mineral_discovery", c.id);
    } else if (event === 2) {
      c.progress.technology = Math.max(1, c.progress.technology) + 30;
      this.notice("science", c.id);
    } else if (event === 3) {
      c.population = mul(c.population, 97);
      c.stability = Math.max(30, c.stability - 5);
      this.notice("health", c.id);
    } else if (event === 4) {
      this.game.player(c.id).addGold(3000n);
      c.influence += 10;
      this.notice("boom", c.id);
    } else if (event === 5) {
      c.stability = Math.max(30, c.stability - 8);
      this.notice("civil_crisis", c.id);
    } else if (event === 6) {
      if (c.infrastructure.port > 0) c.infrastructure.port--;
      c.weather = "cyclone";
      c.weatherUntil = this.tick + 200;
      this.notice("disaster", c.id);
    } else {
      const co =
        this.companies[POLICIES[this.random.nextInt(0, POLICIES.length)]];
      co.price = mul(co.price, 70);
      this.notice("company_crisis", c.id);
    }
  }
  private assembly() {
    const voters = [...this.countries.values()].filter(
      (c) => this.game.player(c.id).type() !== PlayerType.Bot,
    ).length;
    for (const r of this.resolutions.filter((r) => r.expires <= this.tick)) {
      if (Object.values(r.votes).filter(Boolean).length > voters / 2) {
        const target = this.countries.get(r.target);
        if (target) {
          target.sanctionedUntil = this.tick + 600;
          this.notice("sanctions", r.proposer, r.target);
        }
      } else this.notice("resolution_failed", r.proposer, r.target);
    }
    this.resolutions = this.resolutions.filter(
      (r) => r.expires > this.tick && this.countries.has(r.target),
    );
  }
  canAttack(attacker: Player, defender?: Player): boolean {
    const c = this.countries.get(attacker.id());
    if (c?.neutral && defender) return false;
    if (!defender) return true;
    return !this.peace.has(this.pair(attacker.id(), defender.id()));
  }
  combatPercent(attacker: Player, tile: number): number {
    const c = this.countries.get(attacker.id());
    if (!c) return 100;
    let percent = c.modifiers.land;
    if (["storm", "snow", "flood", "sandstorm"].includes(c.weather))
      percent -= 10;
    if (c.stocks.fuel <= 2) percent -= 8;
    const owner = this.game.owner(tile);
    if (owner.isPlayer()) {
      const defense = this.countries.get(owner.id());
      if (defense)
        percent -= Math.min(
          18,
          defense.infrastructure.bunker * 3 +
            defense.infrastructure.radar +
            defense.infrastructure.antiMissile +
            defense.infrastructure.coastalDefense +
            defense.infrastructure.base,
        );
    }
    percent += Math.min(
      6,
      Math.floor(c.modifiers.air / 20) - 5 + c.infrastructure.airport,
    );
    return clamp(percent, 75, 130);
  }
  navalPercent(player: Player): number {
    const c = this.countries.get(player.id());
    if (!c) return 100;
    const storm = ["seaStorm", "cyclone", "storm"].includes(c.weather);
    return clamp(
      c.modifiers.sea -
        (storm ? 20 : 0) +
        (storm && c.military.submarines ? 8 : 0) -
        (c.stocks.fuel <= 2 ? 10 : 0),
      70,
      145,
    );
  }
  onAttack(attacker: Player, defender?: Player) {
    const c = this.countries.get(attacker.id());
    if (!c || !defender) return;
    c.stocks.fuel = Math.max(0, c.stocks.fuel - 2);
    const key = this.pair(attacker.id(), defender.id());
    if (!this.wars.has(key)) {
      this.wars.add(key);
      c.reputation = Math.max(0, c.reputation - 3);
    }
  }
  private checkVictory() {
    const cfg = this.game.config().gameConfig().strategy;
    if (
      !cfg ||
      cfg.victory === "territory" ||
      this.victory ||
      this.game.getWinner() ||
      this.tick < (cfg.durationTicks ?? 12000)
    )
      return;
    const countries = [...this.countries.values()].filter(
      (c) => this.game.player(c.id).type() !== PlayerType.Bot,
    );
    const score = (c: Country) =>
      cfg.victory === "diplomacy"
        ? c.influence + c.reputation * 10
        : cfg.victory === "technology"
          ? RESEARCH.reduce((s, r) => s + c.research[r], 0) * 1000 + c.influence
          : c.score + c.exports * 2 + Math.floor(c.population / 100);
    countries.sort(
      (a, b) => score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    if (
      countries.length &&
      this.game.config().gameConfig().gameMode === "Free For All"
    ) {
      this.victory = countries[0].id;
      this.game.setWinner(
        this.game.player(this.victory),
        this.game.stats().stats(),
      );
    }
  }
  snapshot(clientID?: string): StrategySnapshot {
    const me = clientID ? this.game.playerByClientID(clientID) : undefined;
    return {
      tick: this.tick,
      me: me ? this.countries.get(me.id()) : undefined,
      countries: [...this.countries.values()].map((c) => ({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        terrain: c.terrain,
        policy: c.policy,
        weather: c.weather,
        tiles: c.tiles,
        population: c.population,
        stability: c.stability,
        reputation: c.reputation,
        influence: c.influence,
        score: c.score,
        ports: c.infrastructure.port,
        military: Object.values(c.military).reduce((n, x) => n + x, 0),
        income: c.modifiers.income,
        specialization: c.specialization,
      })),
      market: this.market,
      companies: this.companies,
      contracts: this.contracts,
      resolutions: this.resolutions,
      news: this.news,
      victory: this.victory,
    };
  }
  save(): StrategySave {
    return {
      seed: this.random.getState(),
      countries: [...this.countries.values()],
      market: this.market,
      companies: this.companies,
      contracts: this.contracts,
      resolutions: this.resolutions,
      news: this.news,
      embargoes: [...this.embargoes],
      wars: [...this.wars],
      peace: [...this.peace],
      sequence: this.sequence,
      tick: this.tick,
      victory: this.victory,
    };
  }
  restore(data: StrategySave) {
    this.random = PseudoRandom.fromState(data.seed);
    this.countries = new Map(data.countries.map((c) => [c.id, c]));
    this.market = data.market;
    this.companies = data.companies;
    this.contracts = data.contracts;
    this.resolutions = data.resolutions;
    this.news = data.news;
    this.embargoes = new Set(data.embargoes);
    this.wars = new Set(data.wars);
    this.peace = new Map(data.peace);
    this.sequence = data.sequence;
    this.tick = data.tick;
    this.victory = data.victory;
  }
  hash(): number {
    return simpleHash(JSON.stringify(this.save()));
  }
}
