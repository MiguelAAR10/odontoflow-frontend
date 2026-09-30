/** Guard: the server-only demo credential is read by the Route Handler only, never under src/. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("BFF secret guard", () => {
  it("no file under src/ references BACKEND_DEMO_TOKEN", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) => readFileSync(file, "utf8").includes("BACKEND_DEMO_TOKEN"));
    expect(offenders).toEqual([]);
  });

  it("the browser env module exposes no server-only variable", () => {
    const env = readFileSync(join(process.cwd(), "src", "env.ts"), "utf8");
    expect(env).not.toMatch(/process\.env\.BACKEND_URL\b/);
    expect(env).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_)\w+/);
  });
});
