import { parse, printParseErrorCode } from "jsonc-parser";
import fs from "node:fs";

export function readCloudflareConfig(file) {
  const errors = [];
  const config = parse(fs.readFileSync(file, "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length)
    throw new Error(
      `${file}: ${errors.map((e) => `${printParseErrorCode(e.error)} at ${e.offset}`).join(", ")}`,
    );
  return config;
}
