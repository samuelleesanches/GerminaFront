export const RESOURCES = [
  "food",
  "water",
  "wood",
  "oil",
  "gas",
  "coal",
  "iron",
  "copper",
  "uranium",
  "aluminium",
  "rareEarths",
  "fish",
  "energy",
  "steel",
  "fuel",
  "components",
  "vehicles",
  "drones",
  "electronics",
  "processedFood",
  "coffee",
  "rice",
  "wheat",
  "ships",
  "semiconductors",
  "weapons",
  "aircraft",
  "medicine",
  "software",
] as const;
export type Resource = (typeof RESOURCES)[number];
export const POLICIES = [
  "diversified",
  "agriculture",
  "industry",
  "technology",
  "defense",
  "maritime",
  "trade",
  "energy",
] as const;
export type Policy = (typeof POLICIES)[number];
export const RESEARCH = [
  "military",
  "economy",
  "technology",
  "infrastructure",
  "energy",
  "navy",
  "aviation",
  "agriculture",
] as const;
export type Research = (typeof RESEARCH)[number];
export const INFRASTRUCTURE = [
  "roads",
  "rail",
  "factory",
  "port",
  "airport",
  "research",
  "base",
  "silo",
  "bunker",
  "radar",
  "coastalDefense",
  "antiMissile",
  "internet",
  "health",
  "education",
  "coalPower",
  "oilPower",
  "gasPower",
  "nuclear",
  "solar",
  "wind",
  "hydro",
] as const;
export type Infrastructure = (typeof INFRASTRUCTURE)[number];
export const WEATHER = [
  "clear",
  "rain",
  "storm",
  "snow",
  "fog",
  "heat",
  "drought",
  "cyclone",
  "seaStorm",
  "flood",
  "sandstorm",
] as const;
export type Weather = (typeof WEATHER)[number];
export const TERRAINS = [
  "plains",
  "forest",
  "desert",
  "mountain",
  "hill",
  "tundra",
  "coast",
  "river",
  "volcanic",
  "archipelago",
] as const;
export type Terrain = (typeof TERRAINS)[number];
export const MILITARY: Record<
  string,
  {
    materials: Partial<Record<Resource, number>>;
    cost: number;
    research: Research;
    level: number;
    land: number;
    air: number;
    sea: number;
  }
> = {
  infantry: {
    cost: 1200,
    materials: { weapons: 2, food: 4 },
    research: "military",
    level: 0,
    land: 5,
    air: 0,
    sea: 0,
  },
  mechanized: {
    cost: 2500,
    materials: { vehicles: 2, fuel: 3 },
    research: "military",
    level: 1,
    land: 10,
    air: 0,
    sea: 0,
  },
  tanks: {
    cost: 4000,
    materials: { steel: 4, vehicles: 2, fuel: 4 },
    research: "military",
    level: 1,
    land: 15,
    air: 0,
    sea: 0,
  },
  artillery: {
    cost: 3000,
    materials: { steel: 3, weapons: 3 },
    research: "military",
    level: 1,
    land: 12,
    air: 0,
    sea: 0,
  },
  heavyArtillery: {
    cost: 5500,
    materials: { steel: 6, weapons: 5 },
    research: "military",
    level: 2,
    land: 18,
    air: 0,
    sea: 0,
  },
  specialForces: {
    cost: 4500,
    materials: { weapons: 4, electronics: 2 },
    research: "military",
    level: 2,
    land: 16,
    air: 0,
    sea: 0,
  },
  airDefense: {
    cost: 3000,
    materials: { weapons: 3, electronics: 2 },
    research: "military",
    level: 1,
    land: 4,
    air: 8,
    sea: 0,
  },
  scouts: {
    cost: 1200,
    materials: { vehicles: 1 },
    research: "military",
    level: 0,
    land: 4,
    air: 0,
    sea: 0,
  },
  fighters: {
    cost: 5500,
    materials: { aircraft: 2, fuel: 5 },
    research: "aviation",
    level: 1,
    land: 4,
    air: 18,
    sea: 3,
  },
  bombers: {
    cost: 7000,
    materials: { aircraft: 3, weapons: 3, fuel: 5 },
    research: "aviation",
    level: 2,
    land: 14,
    air: 14,
    sea: 0,
  },
  transports: {
    cost: 3500,
    materials: { aircraft: 1, fuel: 2 },
    research: "aviation",
    level: 1,
    land: 8,
    air: 4,
    sea: 0,
  },
  reconAircraft: {
    cost: 4000,
    materials: { aircraft: 1, electronics: 3 },
    research: "aviation",
    level: 1,
    land: 3,
    air: 10,
    sea: 1,
  },
  reconDrone: {
    cost: 1000,
    materials: { drones: 1 },
    research: "technology",
    level: 1,
    land: 4,
    air: 3,
    sea: 0,
  },
  attackDrone: {
    cost: 1800,
    materials: { drones: 2, weapons: 1 },
    research: "technology",
    level: 1,
    land: 7,
    air: 5,
    sea: 0,
  },
  surveillanceDrone: {
    cost: 1400,
    materials: { drones: 1, electronics: 1 },
    research: "technology",
    level: 1,
    land: 3,
    air: 4,
    sea: 0,
  },
  navalDrone: {
    cost: 2000,
    materials: { drones: 2, fuel: 1 },
    research: "navy",
    level: 1,
    land: 0,
    air: 1,
    sea: 7,
  },
  loiteringDrone: {
    cost: 1300,
    materials: { drones: 1, weapons: 1 },
    research: "technology",
    level: 1,
    land: 6,
    air: 4,
    sea: 0,
  },
  logisticsDrone: {
    cost: 1000,
    materials: { drones: 1 },
    research: "technology",
    level: 1,
    land: 4,
    air: 2,
    sea: 0,
  },
  frigates: {
    cost: 5000,
    materials: { ships: 2, fuel: 4 },
    research: "navy",
    level: 1,
    land: 0,
    air: 4,
    sea: 15,
  },
  destroyers: {
    cost: 7500,
    materials: { ships: 3, weapons: 4, fuel: 5 },
    research: "navy",
    level: 2,
    land: 0,
    air: 8,
    sea: 20,
  },
  submarines: {
    cost: 6500,
    materials: { ships: 2, electronics: 3, fuel: 3 },
    research: "navy",
    level: 2,
    land: 0,
    air: 0,
    sea: 22,
  },
  carriers: {
    cost: 18000,
    materials: { ships: 6, aircraft: 6, steel: 10, fuel: 8 },
    research: "navy",
    level: 3,
    land: 8,
    air: 26,
    sea: 30,
  },
  navalTransports: {
    cost: 3500,
    materials: { ships: 1, fuel: 2 },
    research: "navy",
    level: 0,
    land: 3,
    air: 0,
    sea: 8,
  },
  supportShips: {
    cost: 4000,
    materials: { ships: 1, fuel: 2, medicine: 2 },
    research: "navy",
    level: 1,
    land: 4,
    air: 0,
    sea: 10,
  },
};
export const RECIPES: {
  output: Resource;
  inputs: Partial<Record<Resource, number>>;
  sector: Policy;
  research?: Research;
  level?: number;
}[] = [
  {
    output: "steel",
    inputs: { iron: 2, coal: 1, energy: 1 },
    sector: "industry",
  },
  { output: "fuel", inputs: { oil: 2, energy: 1 }, sector: "energy" },
  {
    output: "components",
    inputs: { copper: 1, aluminium: 1, energy: 1 },
    sector: "industry",
  },
  {
    output: "vehicles",
    inputs: { steel: 2, components: 1, energy: 1 },
    sector: "industry",
  },
  {
    output: "drones",
    inputs: { components: 2, electronics: 1, energy: 1 },
    sector: "technology",
    research: "technology",
    level: 1,
  },
  {
    output: "electronics",
    inputs: { rareEarths: 1, copper: 1, energy: 2 },
    sector: "technology",
  },
  {
    output: "processedFood",
    inputs: { food: 2, water: 1 },
    sector: "agriculture",
  },
  {
    output: "ships",
    inputs: { steel: 3, components: 1, energy: 2 },
    sector: "maritime",
  },
  {
    output: "semiconductors",
    inputs: { rareEarths: 1, electronics: 2, water: 2, energy: 2 },
    sector: "technology",
    research: "technology",
    level: 2,
  },
  {
    output: "weapons",
    inputs: { steel: 2, components: 1, energy: 1 },
    sector: "defense",
  },
  {
    output: "aircraft",
    inputs: { aluminium: 3, electronics: 2, energy: 2 },
    sector: "defense",
    research: "aviation",
    level: 1,
  },
  {
    output: "medicine",
    inputs: { water: 2, components: 1, energy: 1 },
    sector: "technology",
    research: "technology",
    level: 1,
  },
  {
    output: "software",
    inputs: { electronics: 1, energy: 1 },
    sector: "technology",
    research: "technology",
    level: 1,
  },
];
export interface StrategyAction {
  op:
    | "policy"
    | "workforce"
    | "build"
    | "research"
    | "recruit"
    | "buy"
    | "sell"
    | "invest"
    | "divest"
    | "offer"
    | "accept"
    | "embargo"
    | "tariff"
    | "aid"
    | "resolve"
    | "vote"
    | "peace"
    | "war"
    | "neutral";
  key?: string;
  target?: string;
  amount?: number;
  duration?: number;
}
