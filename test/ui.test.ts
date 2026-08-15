import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { inboxHtml } from "../src/ui.js";

describe("simulation panel", () => {
  it("ships syntactically valid browser JavaScript", () => {
    const script = inboxHtml.split("<script>")[1]?.split("</script>")[0];
    if (!script) throw new Error("Simulation panel script was not found");
    expect(() => new vm.Script(script, { filename: "simulation-panel.js" })).not.toThrow();
  });
});
