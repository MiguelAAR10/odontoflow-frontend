import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentCrew } from "../src/crew/AgentCrew";
import { Intro } from "../src/crew/Intro";
import { useReducedMotionPreference } from "../src/crew/useReducedMotionPreference";
import { Layers, Layer } from "../src/catalog/Layers";
import { createInitialState, type RunState } from "../src/agui/reducer";
import type { AgentStore } from "../src/agui/store";
import type { AgentId } from "../src/agui/card";

const motionMock = vi.hoisted(() => ({ scope: { current: null as unknown }, animate: vi.fn(), reduced: false }));
vi.mock("motion/react", () => ({
  MotionConfig: ({ children }: { children: unknown }) => children,
  AnimatePresence: ({ children }: { children: unknown }) => children,
  motion: { span: "span", div: "div", section: "section", article: "article" },
  useAnimate: () => [motionMock.scope, motionMock.animate],
  useReducedMotion: () => motionMock.reduced,
}));
vi.mock("../src/crew/characters/Character", () => ({ Character: () => null }));
vi.mock("../src/crew/AgentCursor", () => ({ AgentCursor: () => null }));

class Media extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(matches: boolean) { this.matches = matches; this.dispatchEvent(new Event("change")); }
}
const agents: AgentId[] = ["airi", "cepillo", "pasta", "hilo", "enjuague", "espejo", "escudo"];
const views: ReactTestRenderer[] = [];
let frames: Map<number, FrameRequestCallback>;
function browser(reduced = false) {
  vi.useFakeTimers();
  const media = new Media(reduced);
  let frame = 0;
  frames = new Map();
  const request = (cb: FrameRequestCallback) => { frames.set(++frame, cb); return frame; };
  const cancel = (id: number) => frames.delete(id);
  const win = new EventTarget();
  let introOpen = false;
  const matchMedia = (query: string) => query.includes("reduced") ? media : new Media(false);
  vi.stubGlobal("window", Object.assign(win, { matchMedia, requestAnimationFrame: request, cancelAnimationFrame: cancel }));
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false, querySelector: () => introOpen ? {} : null }));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  motionMock.reduced = reduced;
  motionMock.animate.mockReset().mockImplementation(() => ({ state: "running", stop: vi.fn(), then: vi.fn() }));
  const faces = agents.map(id => ({ dataset: { face: id }, style: { transform: "none" } }));
  motionMock.scope.current = { querySelectorAll: () => faces, querySelector: (selector: string) => faces.find(f => selector.includes(`"${f.dataset.face}"`)) };
  return { media, faces, intro(open: boolean) { introOpen = open; win.dispatchEvent(new Event("airi:intro-visibility")); } };
}
function flushFrame() {
  act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0)); });
}
function mountCrew() {
  let state = createInitialState();
  const listeners = new Set<() => void>();
  const store: AgentStore = {
    getSnapshot: () => state, getServerSnapshot: () => state,
    subscribe: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    configure() {}, async send() {}, stop() {}, async approve() {}, setDocked() {}, setPanelOpen() {}, clear() {},
  };
  let view!: ReactTestRenderer;
  act(() => { view = create(createElement(AgentCrew, { store }), { createNodeMock: el => el.props.className === "airi-crew" ? motionMock.scope.current : null }); });
  views.push(view);
  const publish = (agent: AgentId, pending?: AgentId) => {
    state = { ...createInitialState(), threadId: "thread", run: { ...state.run, id: "run", agent, status: "working" },
      agents: { ...createInitialState().agents, [agent]: "working", ...(pending ? { [pending]: "needs-you" } : {}) } };
    act(() => listeners.forEach(cb => cb()));
  };
  const active = () => view.root.findAll(node => node.type === "button" && node.props["data-motion"] === "active").map(node => node.props["data-agent"]);
  return { view, publish, active };
}
afterEach(() => {
  act(() => views.splice(0).forEach(view => view.unmount()));
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("crew · presupuesto global", () => {
  it("settles the outgoing pair before admitting a third agent, preserving its real status", () => {
    browser(); const crew = mountCrew();
    crew.publish("cepillo", "airi"); flushFrame(); flushFrame();
    expect(crew.active()).toEqual(["airi", "cepillo"]);
    motionMock.animate.mockClear();
    crew.publish("hilo", "airi");
    expect(crew.active()).toEqual([]);
    expect(motionMock.animate).not.toHaveBeenCalled();
    expect(crew.view.root.findAllByType("button").find(node => node.props["data-agent"] === "hilo")?.props["data-state"]).toBe("working");
    flushFrame(); expect(crew.active()).toEqual([]);
    flushFrame(); expect(crew.active()).toEqual(["airi", "hilo"]);
    expect(motionMock.animate.mock.calls.map(([face]) => face.dataset.face)).toEqual(["airi", "hilo"]);
  });

  it("cancels stale admissions during rapid handoffs and releases animation controls", () => {
    browser(); const crew = mountCrew();
    crew.publish("airi"); flushFrame(); flushFrame();
    const controls = motionMock.animate.mock.results.map(result => result.value);
    crew.publish("cepillo"); flushFrame(); crew.publish("hilo");
    flushFrame(); expect(crew.active()).toEqual([]);
    flushFrame(); expect(crew.active()).toEqual(["hilo"]);
    expect(controls.every(control => control.stop.mock.calls.length > 0)).toBe(true);
  });

  it("starts quiet in reduce and cancels queued/active springs when preferences change", () => {
    const b = browser(true); const crew = mountCrew(); crew.publish("cepillo", "airi");
    flushFrame(); flushFrame(); expect(crew.active()).toEqual([]); expect(motionMock.animate).not.toHaveBeenCalled();
    act(() => b.media.change(false)); flushFrame(); flushFrame(); expect(crew.active()).toHaveLength(2);
    act(() => b.media.change(true)); expect(crew.active()).toEqual([]);
    expect(b.faces.every(face => face.style.transform === "none")).toBe(true);
    expect(motionMock.animate.mock.results.every(result => result.value.stop.mock.calls.length > 0)).toBe(true);
    flushFrame(); flushFrame(); expect(crew.active()).toEqual([]);
  });

  it("pauses the crew while the presentation uses the shared motion budget", () => {
    const b = browser(); const crew = mountCrew(); crew.publish("cepillo", "airi");
    flushFrame(); flushFrame(); expect(crew.active()).toHaveLength(2);
    act(() => b.intro(true)); expect(crew.active()).toEqual([]);
    flushFrame(); flushFrame(); expect(crew.active()).toEqual([]);
    act(() => b.intro(false)); flushFrame(); flushFrame(); expect(crew.active()).toHaveLength(2);
  });

  it("does not leave admissions queued after unmount", () => {
    browser(); const crew = mountCrew(); crew.publish("hilo");
    act(() => crew.view.unmount()); expect(frames.size).toBe(0);
  });
});

describe("catalog · movimiento reducido", () => {
  it("uses opacity-only reveals no longer than 150 ms, including after a preference change", () => {
    const b = browser(); let view!: ReactTestRenderer;
    act(() => { view = create(createElement(Layers, { children: createElement(Layer, { stage: "title", children: "Título" }) })); });
    views.push(view);
    act(() => b.media.change(true));
    for (const type of ["section", "div"] as const) {
      const variants = view.root.findByType(type).props.variants;
      expect(variants.hidden).not.toHaveProperty("y");
      expect(variants.visible).not.toHaveProperty("y");
      expect(variants.visible.transition.duration).toBeLessThanOrEqual(.15);
    }
  });
});


describe("preferencia de movimiento · render sin navegador", () => {
  const Preference = () => createElement("span", null, String(useReducedMotionPreference()));
  it("starts quiet in SSR and can render without a browser API", () => {
    expect(renderToStaticMarkup(createElement(Preference))).toContain("true");
    let view!: ReactTestRenderer;
    act(() => { view = create(createElement(Preference)); }); views.push(view);
    expect(view.root.findByType("span").children).toEqual(["true"]);
  });
});


describe("intro · relevos bajo carga", () => {
  it("schedules the next character after the previous render instead of batching overdue timers", async () => {
    browser(); Object.assign(window, { location: { search: "" } });
    Object.assign(document, { body: { style: { overflow: "" } } });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn() });
    const dialog = { showModal: vi.fn(), close: vi.fn(), querySelector: () => ({ focus: vi.fn() }) };
    let view!: ReactTestRenderer;
    act(() => { view = create(createElement(Intro), { createNodeMock: node => node.type === "dialog" ? dialog : null }); });
    views.push(view);
    const presented = () => view.root.findAll(node => node.props["data-presenting"] === true).map(node => node.props["data-intro-agent"]);
    const paintRest = async () => { flushFrame(); flushFrame(); await act(async () => {}); flushFrame(); flushFrame(); };
    // Simulate a busy renderer: several original deadlines elapsed before React committed.
    act(() => { vi.advanceTimersByTime(350 + 3 * 380); });
    expect(presented()).toEqual([]);
    await paintRest();
    act(() => { vi.advanceTimersByTime(350); });
    expect(presented()).toEqual(["airi"]);
    await paintRest();
    act(() => { vi.advanceTimersByTime(380); }); expect(presented()).toEqual(["cepillo"]);
  });
});
