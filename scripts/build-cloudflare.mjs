import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readCloudflareConfig } from "./cloudflare-config.mjs";

function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) => !entry.name.startsWith(".") || entry.name === ".well-known",
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const hash = crypto.createHash("sha256");
for (const f of [
  "package-lock.json",
  "vite.config.ts",
  ...files("src"),
  ...files("zbin"),
]) {
  // Windows and the Pages Linux builder must derive the same protocol version.
  hash.update(f.replaceAll("\\", "/"));
  const bytes = fs.readFileSync(f);
  hash.update(
    /\.(ts|tsx|js|mjs|json|html|css|md)$/.test(f)
      ? bytes.toString("utf8").replaceAll("\r\n", "\n")
      : bytes,
  );
}
const build = hash.digest("hex").slice(0, 16);
const backend = readCloudflareConfig("wrangler.backend.jsonc");
backend.vars.BUILD_ID = build;
fs.writeFileSync(
  "wrangler.backend.jsonc",
  JSON.stringify(backend, null, 2) + "\n",
);
const cli = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(cli, ["exec", "--", "vite", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    OPENFRONT_CLOUDFLARE: "true",
    BUILD_ID: build,
    CDN_BASE: "",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);
// Bundle the Pages gateway independently of the game frontend.
const { build: bundle } = await import("esbuild");
await bundle({
  entryPoints: ["cloudflare/pages.ts"],
  outfile: "static/_worker.js",
  bundle: true,
  format: "esm",
  target: "es2022",
});
fs.writeFileSync(
  "static/_routes.json",
  JSON.stringify({
    version: 1,
    include: ["/api/*", "/lobbies", "/w*", "/game/*"],
    exclude: [],
  }),
);
fs.writeFileSync(
  "static/_headers",
  "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/_assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n",
);
const oversized = files("static").filter(
  (f) => fs.statSync(f).size > 25 * 1024 * 1024,
);
if (oversized.length)
  throw new Error(
    `Arquivos maiores que o limite do Pages: ${oversized.join(", ")}`,
  );
if (files("static").length > 20000)
  throw new Error("Build excede 20.000 arquivos.");
if (fs.readFileSync("static/index.html", "utf8").includes("<%"))
  throw new Error("HTML ainda contém templates de servidor.");
console.log(
  `\nCloudflare build ${build}: ${files("static").length} arquivos em static/.`,
);
