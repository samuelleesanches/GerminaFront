import type { Service } from "../src/cloudflare/runtime";
interface PagesEnv {
  ASSETS: Service;
  BACKEND: Service;
}
export default {
  async fetch(request: Request, env: PagesEnv): Promise<Response> {
    const url = new URL(request.url);
    const backend =
      url.pathname.startsWith("/api/") ||
      url.pathname === "/lobbies" ||
      /^\/w\d+(?:\/api\/|\/lobbies$|\/?$)/.test(url.pathname);
    if (backend) {
      if (!env.BACKEND)
        return Response.json(
          { error: "missing_BACKEND_binding" },
          { status: 503 },
        );
      return env.BACKEND.fetch(request);
    }
    if (/^\/(?:w\d+\/)?game\/[A-Za-z0-9]{8,10}\/?$/.test(url.pathname)) {
      // Request the canonical root asset, avoiding Pages' pretty-URL redirect
      // for /index.html, which would discard the invite URL in the browser.
      url.pathname = "/";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
