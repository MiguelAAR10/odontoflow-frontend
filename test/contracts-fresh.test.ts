import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const backendPresent = process.env.OPENAPI_SPEC || ["../odontoflow-backend", "../../odontoflow-backend"].some(path => existsSync(resolve(path, "docs/api/openapi.yaml")));
it.skipIf(!backendPresent)("los tipos REST coinciden con el OpenAPI disponible (define OPENAPI_SPEC fuera del workspace)", () => {
  expect(() => execFileSync(process.execPath, ["scripts/openapi-check.mjs"], { stdio: "pipe" })).not.toThrow();
}, 15_000);
