import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const candidates = process.env.OPENAPI_SPEC ? [resolve(process.env.OPENAPI_SPEC)] : [
  resolve("../odontoflow-backend/docs/api/openapi.yaml"),
  resolve("../../odontoflow-backend/docs/api/openapi.yaml"),
];
const spec = candidates.find(existsSync);
if (!spec) { console.error("No se encuentra el OpenAPI del backend. Define OPENAPI_SPEC."); process.exit(1); }
const temporary = mkdtempSync(join(tmpdir(), "airi-openapi-"));
try {
  const output = join(temporary, "api.ts");
  execFileSync(process.execPath, [resolve("node_modules/openapi-typescript/bin/cli.js"), spec, "-o", output], { stdio: "pipe" });
  if (!readFileSync(output).equals(readFileSync("src/contracts/api.ts"))) {
    console.error("Los tipos REST están desactualizados. Ejecuta npm run openapi:generate con el mismo OPENAPI_SPEC.");
    process.exitCode = 1;
  } else console.log("Los tipos REST coinciden con el OpenAPI del backend.");
} finally { rmSync(temporary, { recursive: true, force: true }); }
