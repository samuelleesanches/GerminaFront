import { describe, expect, it, vi } from "vitest";
import pages from "../../cloudflare/pages";

describe("Pages gateway", () => {
  it("forwards API, lobby feed and room handshake with origin and query intact", async () => {
    const backend = vi.fn(async (request: Request) =>
      Response.json({
        url: request.url,
        origin: request.headers.get("Origin"),
      }),
    );
    const assets = vi.fn(async () => new Response("asset"));
    for (const path of [
      "/api/health",
      "/api/standalone/cluster.json",
      "/w0/api/game/Alpha888/exists",
      "/lobbies",
      "/w0/lobbies",
      "/w0?gameID=Alpha888",
    ]) {
      const response = await pages.fetch(
        new Request(`https://example.pages.dev${path}`, {
          headers: { Origin: "https://example.pages.dev" },
        }),
        { BACKEND: { fetch: backend }, ASSETS: { fetch: assets } },
      );
      expect(await response.json()).toEqual({
        url: `https://example.pages.dev${path}`,
        origin: "https://example.pages.dev",
      });
    }
    expect(assets).not.toHaveBeenCalled();
  });
  it("serves the compiled application for both share-link shapes", async () => {
    const assets = vi.fn(
      async (request: Request) => new Response(new URL(request.url).pathname),
    );
    for (const path of ["/game/Alpha888", "/w0/game/Alpha888"]) {
      const response = await pages.fetch(
        new Request(`https://example.pages.dev${path}`),
        { BACKEND: { fetch: vi.fn() }, ASSETS: { fetch: assets } },
      );
      expect(await response.text()).toBe("/");
    }
  });
  it("reports a missing service binding and leaves static files with ASSETS", async () => {
    const response = await pages.fetch(
      new Request("https://example.pages.dev/api/health"),
      { ASSETS: { fetch: vi.fn() } } as never,
    );
    expect(response.status).toBe(503);
    const assets = vi.fn(async () => new Response("map"));
    await pages.fetch(
      new Request("https://example.pages.dev/_assets/map.bin"),
      { BACKEND: { fetch: vi.fn() }, ASSETS: { fetch: assets } },
    );
    expect(assets).toHaveBeenCalledOnce();
  });
});
