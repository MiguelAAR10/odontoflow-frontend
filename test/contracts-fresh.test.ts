import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("los tipos REST coinciden con el snapshot público o con OPENAPI_SPEC", () => {
  expect(() => execFileSync(process.execPath, ["scripts/openapi-check.mjs"], { stdio: "pipe" })).not.toThrow();
}, 15_000);
