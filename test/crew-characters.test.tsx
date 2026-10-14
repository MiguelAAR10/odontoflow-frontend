import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Character } from "../src/crew/characters/Character";
import { Diente } from "../src/crew/characters/Diente";
import { Cepillo } from "../src/crew/characters/Cepillo";
import { Pasta } from "../src/crew/characters/Pasta";
import { Hilo } from "../src/crew/characters/Hilo";
import { Enjuague } from "../src/crew/characters/Enjuague";
import { Espejo } from "../src/crew/characters/Espejo";
import { Escudo } from "../src/crew/characters/Escudo";
import type { Agent, CharacterState } from "../src/crew/characters/types";

const agents: Agent[] = ["airi", "cepillo", "pasta", "hilo", "enjuague", "espejo", "escudo"];
const states: CharacterState[] = ["idle", "thinking", "working", "handoff", "done", "needs-you"];

describe("characters · SVG contract", () => {
  it("renders two of every named component with no repeated IDs or foreign references", () => {
    const components = [Diente, Cepillo, Pasta, Hilo, Enjuague, Espejo, Escudo];
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      ...components.flatMap((Component, i) => [0, 1].map(copy => createElement(Component, { key: `${i}-${copy}` }))),
    ));
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(300);
    expect(new Set(ids).size).toBe(ids.length);
    const svgs = markup.match(/<svg\b[\s\S]*?<\/svg>/g)!;
    expect(svgs).toHaveLength(14);
    for (const svg of svgs) {
      const localIds = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
      const refs = [...svg.matchAll(/url\(#([^)]+)\)|aria-labelledby="([^"]+)"/g)];
      expect(refs.length).toBeGreaterThan(1);
      for (const ref of refs) expect(localIds.has(ref[1] ?? ref[2])).toBe(true);
      for (const part of ["character", "eyes", "eyes-state", "eye-left", "eye-right"])
        expect(svg).toContain(`data-part="${part}"`);
    }
  });

  it.each(states)("selects every agent and exposes state %s as a CSS class", state => {
    for (const agent of agents) {
      const svg = renderToStaticMarkup(createElement(Character, { agent, state, size: 48, gaze: false }));
      expect(svg).toContain(`is-${state}`);
      expect(svg).toContain(`pj-${agent === "airi" ? "diente" : agent}`);
      expect(svg).toContain('width="48"');
      expect(svg).toContain('height="48"');
    }
  });

  it("uses the v10 green and graphite recolors", () => {
    expect(renderToStaticMarkup(createElement(Enjuague))).toContain("#0EA344");
    expect(renderToStaticMarkup(createElement(Escudo))).toContain("#4B5563");
  });

  it("supports a labelled image or a decorative character, and hides grain at small sizes", () => {
    const svg = renderToStaticMarkup(createElement(Diente, { label: "AIRI coordina", className: "crew-avatar" }));
    expect(svg).toContain('role="img"');
    expect(svg).toContain("AIRI coordina");
    expect(svg).toContain("crew-avatar");
    const small = renderToStaticMarkup(createElement(Pasta, { size: 24, decorative: true }));
    expect(small).toContain('aria-hidden="true"');
    expect(small).toContain("no-grain");
    expect(small).not.toContain('role="img"');
  });

  it("keeps IDs stable while React replaces the state class", () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(createElement(Hilo, { state: "thinking" })); });
    const ids = () => view.root.findAll(node => typeof node.type === "string" && node.props.id).map(node => node.props.id);
    const original = ids();
    act(() => view.update(createElement(Hilo, { state: "done" })));
    expect(ids()).toEqual(original);
    const svg = view.root.findByType("svg");
    expect(svg.props.className).toContain("is-done");
    expect(svg.props.className).not.toContain("is-thinking");
    act(() => view.unmount());
  });
});

// Browser APIs at the hook boundary; no jsdom dependency needed.
function browser({ reduced = false, fine = true } = {}) {
  class Media extends EventTarget {
    constructor(public matches: boolean) { super(); }
    change(matches: boolean) { this.matches = matches; this.dispatchEvent(new Event("change")); }
  }
  const reduce = new Media(reduced), pointer = new Media(fine);
  const win = Object.assign(new EventTarget(), {
    matchMedia: vi.fn((query: string) => query.includes("reduced") ? reduce : pointer),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
  });
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const doc = Object.assign(new EventTarget(), { documentElement: new EventTarget(), hidden: false });
  const add = vi.spyOn(win, "addEventListener"), remove = vi.spyOn(win, "removeEventListener");
  vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
  const nodes: ReturnType<typeof node>[] = [];
  function node() {
    const values = new Map<string, string>(), attributes = new Map<string, string>();
    return {
      style: { setProperty: (name: string, value: string) => values.set(name, value) },
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), values, attributes,
    };
  }
  const mount = (count = 1, gaze = true) => {
    let view!: ReactTestRenderer;
    act(() => { view = create(createElement(Fragment, null, ...Array.from({ length: count }, (_, i) =>
      createElement(Character, { agent: "airi", key: i, gaze }),
    )), { createNodeMock: el => { if (el.type === "svg") { const svg = node(); nodes.push(svg); return svg; } return null; } }); });
    views.push(view); return view;
  };
  const move = (pointerType = "mouse", clientX = 1000, clientY = 1000) => {
    win.dispatchEvent(Object.assign(new Event("pointermove"), { pointerType, clientX, clientY }));
  };
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(0)); };
  return { win, doc, reduce, pointer, add, remove, nodes, frames, mount, move, flush };
}
const views: ReactTestRenderer[] = [];
afterEach(() => { act(() => views.splice(0).forEach(view => view.unmount())); vi.unstubAllGlobals(); });

describe("useGaze", () => {
  it("installs no pointer listeners or rAF for reduced motion", () => {
    const b = browser({ reduced: true }); b.mount(2);
    expect(b.add.mock.calls.filter(([name]) => name.startsWith("pointer"))).toHaveLength(0);
    b.move(); expect(b.win.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("installs no pointer listeners for coarse pointers or gaze=false", () => {
    const b = browser({ fine: false }); b.mount();
    expect(b.add.mock.calls.filter(([name]) => name.startsWith("pointer"))).toHaveLength(0);
    b.pointer.change(true); b.mount(1, false);
    expect(b.add.mock.calls.filter(([name]) => name === "pointermove")).toHaveLength(1);
  });

  it("shares one listener and one frame, clamps the gaze to 12 viewBox units and resets on leave", () => {
    const b = browser(); b.mount(2); b.move(); b.move();
    expect(b.add.mock.calls.filter(([name]) => name === "pointermove")).toHaveLength(1);
    expect(b.frames.size).toBe(1); b.flush();
    for (const node of b.nodes) {
      const x = parseFloat(node.values.get("--look-x")!), y = parseFloat(node.values.get("--look-y")!);
      expect(x).toBeGreaterThan(0); expect(Math.hypot(x, y)).toBeLessThanOrEqual(12.1);
    }
    b.doc.documentElement.dispatchEvent(new Event("pointerleave")); b.flush();
    for (const node of b.nodes) expect(node.values.get("--look-x")).toBe("0px");
  });

  it("ignores touch, pauses hidden tabs and cancels pending frames when reduced motion changes", () => {
    const b = browser(); b.mount(); b.move("touch"); expect(b.frames.size).toBe(0);
    b.move(); b.reduce.change(true);
    expect(b.frames.size).toBe(0); expect(b.win.cancelAnimationFrame).toHaveBeenCalled();
    expect(b.nodes[0].values.get("--look-x")).toBe("0px");
    b.doc.hidden = true; b.doc.dispatchEvent(new Event("visibilitychange"));
    expect(b.nodes[0].attributes.get("data-offscreen")).toBe("true");
    b.reduce.change(false); b.move(); expect(b.frames.size).toBe(0);
    b.doc.hidden = false; b.doc.dispatchEvent(new Event("visibilitychange"));
    expect(b.nodes[0].attributes.get("data-offscreen")).toBe("false");
  });

  it("removes shared listeners and cancels a queued frame after the last unmount", () => {
    const b = browser(); const first = b.mount(), second = b.mount(); b.move();
    act(() => first.unmount()); expect(b.remove.mock.calls.filter(([name]) => name === "pointermove")).toHaveLength(0);
    act(() => second.unmount());
    expect(b.remove.mock.calls.filter(([name]) => name === "pointermove")).toHaveLength(1);
    expect(b.frames.size).toBe(0);
  });

  it("gaze=false alone never subscribes to pointer events", () => {
    const b = browser(); b.mount(2, false); b.move();
    expect(b.add.mock.calls.filter(([name]) => name.startsWith("pointer"))).toHaveLength(0);
    expect(b.frames.size).toBe(0);
  });

  it("pauses offscreen characters and unobserves every instance on unmount", () => {
    const b = browser();
    let callback!: IntersectionObserverCallback;
    const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
    Object.assign(b.win, { IntersectionObserver: class {
      constructor(fn: IntersectionObserverCallback) { callback = fn; }
      observe = observe; unobserve = unobserve; disconnect = disconnect;
    } });
    const view = b.mount();
    expect(observe).toHaveBeenCalledWith(b.nodes[0]);
    callback([{ target: b.nodes[0], isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    b.move(); b.flush();
    expect(b.nodes[0].attributes.get("data-offscreen")).toBe("true");
    expect(b.nodes[0].values.get("--look-x")).toBe("0px");
    callback([{ target: b.nodes[0], isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    b.flush(); expect(b.nodes[0].attributes.get("data-offscreen")).toBe("false");
    act(() => view.unmount());
    expect(unobserve).toHaveBeenCalledWith(b.nodes[0]); expect(disconnect).toHaveBeenCalledOnce();
  });
});
