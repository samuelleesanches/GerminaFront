import fs from "node:fs";
import { readCloudflareConfig } from "./cloudflare-config.mjs";
const args = process.argv.slice(2);
const name = args[0] ?? "openfront-strategy";
if (!/^[a-z][a-z0-9-]{1,45}[a-z0-9]$/.test(name))
  throw new Error(
    "Use um nome com 3 a 47 letras minúsculas, números ou hífens.",
  );
const domains = args.slice(1).map((value) => {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("Domínios de produção devem usar https://.");
  return url.origin;
});
const pages = readCloudflareConfig("wrangler.jsonc");
const backend = readCloudflareConfig("wrangler.backend.jsonc");
pages.name = name;
pages.services[0].service = `${name}-backend`;
backend.name = `${name}-backend`;
backend.vars.ALLOWED_ORIGINS = [
  `https://${name}.pages.dev`,
  ...domains,
  "http://localhost:8788",
  "http://127.0.0.1:8788",
].join(",");
fs.writeFileSync("wrangler.jsonc", JSON.stringify(pages, null, 2) + "\n");
fs.writeFileSync(
  "wrangler.backend.jsonc",
  JSON.stringify(backend, null, 2) + "\n",
);
console.log(
  `Pages: ${name}\nWorker: ${name}-backend\nOrigens: ${backend.vars.ALLOWED_ORIGINS}`,
);
