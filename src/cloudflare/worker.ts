import { isValidGameID } from "../core/Schemas";
import { directory, Env, identity, json, originAllowed, room } from "./common";
export { GameRoom } from "./GameRoom";
export { LobbyDirectory } from "./LobbyDirectory";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      if (!originAllowed(request, env))
        return json({ error: "origin_not_allowed" }, 403);
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": request.headers.get("Origin")!,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          Vary: "Origin",
        },
      });
    }
    if (
      (request.method !== "GET" || request.headers.has("Upgrade")) &&
      !originAllowed(request, env)
    ) {
      return json({ error: "origin_not_allowed" }, 403);
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/w\d+(?=\/|$)/, "") || "/";
    let response: Response;
    try {
      if (path === "/api/health") {
        response = json({
          ok: true,
          backend: "Durable Objects",
          build: env.BUILD_ID,
        });
      } else if (path === "/api/create_game" && request.method === "POST") {
        const token =
          request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
        const owner = await identity(token);
        if (!owner) return json({ error: "invalid_guest_token" }, 401);
        const previous = url.searchParams.get("previous");
        if (previous) {
          if (!isValidGameID(previous))
            return json({ error: "invalid_game_id" }, 400);
          response = await room(env, previous).fetch(
            new Request("https://room/successor", {
              method: "POST",
              body: owner,
            }),
          );
        } else {
          const body = await request.text();
          if (body.length > 16384)
            return json({ error: "request_too_large" }, 413);
          response = await directory(env).fetch(
            new Request("https://directory/create", {
              method: "POST",
              body: JSON.stringify({
                owner,
                input: body ? JSON.parse(body) : {},
              }),
            }),
          );
        }
      } else if (
        path === "/lobbies" &&
        request.headers.get("Upgrade")?.toLowerCase() === "websocket"
      ) {
        response = await directory(env).fetch(
          new Request("https://directory/lobbies", request),
        );
      } else if (/^\/api\/game\/[^/]+(?:\/exists)?$/.test(path)) {
        const id = path.split("/")[3];
        if (!isValidGameID(id)) return json({ error: "invalid_game_id" }, 400);
        response = await room(env, id).fetch(
          new Request(
            `https://room${path.endsWith("/exists") ? "/exists" : "/info"}`,
          ),
        );
      } else if (
        /^\/api\/game\/[^/]+\/listing$/.test(path) &&
        request.method === "POST"
      ) {
        const id = path.split("/")[3];
        if (!isValidGameID(id)) return json({ error: "invalid_game_id" }, 400);
        const owner = await identity(
          request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
        );
        if (!owner) return json({ error: "invalid_guest_token" }, 401);
        response = await room(env, id).fetch(
          new Request("https://room/listing", {
            method: "POST",
            body: JSON.stringify({
              ...((await request.json()) as object),
              owner,
            }),
          }),
        );
      } else if (
        path === "/" &&
        request.headers.get("Upgrade")?.toLowerCase() === "websocket"
      ) {
        // Room routing is in the handshake URL, before the first binary join frame.
        const id = url.searchParams.get("gameID") ?? "";
        if (!isValidGameID(id)) return json({ error: "invalid_game_id" }, 400);
        response = await room(env, id).fetch(
          new Request("https://room/socket", request),
        );
      } else if (
        path === "/api/standalone/servers" ||
        path === "/api/standalone/cluster.json"
      ) {
        // Injected same-origin cluster config is authoritative in this build.
        response = json({ servers: {}, latest: env.BUILD_ID });
      } else if (path.startsWith("/api/standalone/")) {
        response = json(
          { error: "official_account_service_not_included" },
          404,
        );
      } else if (path.startsWith("/api/singleplayer/")) {
        response = json({ ok: true });
      } else {
        response = json({ error: "not_found" }, 404);
      }
    } catch (error) {
      console.error(
        "Request failed",
        error instanceof Error ? error.message : "unknown",
      );
      response = json({ error: "request_failed" }, 500);
    }
    // Preserve the actual upgrade response; reconstructing it loses its WebSocket.
    if (response.status === 101) return response;
    if (originAllowed(request, env) && request.headers.has("Origin")) {
      const headers = new Headers(response.headers);
      headers.set(
        "Access-Control-Allow-Origin",
        request.headers.get("Origin")!,
      );
      headers.set("Vary", "Origin");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
