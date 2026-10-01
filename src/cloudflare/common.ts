import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../core/game/Game";
import { GameConfig } from "../core/Schemas";
import type { DurableNamespace, Service } from "./runtime";

export interface Env {
  ROOMS: DurableNamespace;
  DIRECTORY: DurableNamespace;
  BUILD_ID: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_SECRET?: string;
}

export const DEFAULT_CONFIG: GameConfig = {
  donateGold: true,
  donateTroops: true,
  gameMap: GameMapType.World,
  gameMapSize: GameMapSize.Normal,
  gameType: GameType.Private,
  gameMode: GameMode.FFA,
  difficulty: Difficulty.Easy,
  nations: "default",
  bots: 80,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  strategy: {
    enabled: true,
    preset: "normal",
    victory: "balanced",
    durationTicks: 12000,
  },
  randomSpawn: false,
  disabledUnits: [],
  maxPlayers: 32,
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function identity(token: string): Promise<string | null> {
  // Standalone mode supports guest UUIDs only. Never decode an unverified JWT.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token,
    )
  )
    return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function newId(length = 8): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789";
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte >= Math.floor(256 / alphabet.length) * alphabet.length) continue;
      out.push(alphabet[byte % alphabet.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin)
    return request.headers.get("Upgrade")?.toLowerCase() !== "websocket";
  return (env.ALLOWED_ORIGINS ?? "http://localhost:8788,http://127.0.0.1:8788")
    .split(",")
    .map((o) => o.trim())
    .includes(origin);
}

export function directory(env: Env): Service {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName("lobby-directory"));
}

export function room(env: Env, id: string): Service {
  return env.ROOMS.get(env.ROOMS.idFromName(id));
}
