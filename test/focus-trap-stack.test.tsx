import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * A Modal opened from a Drawer stacks two dialogs, and each listens on
 * `document`. Only the topmost one may react to the keyboard — otherwise their
 * Tab traps fight (focus keeps jumping to the Modal's first control, so its
 * buttons cannot be reached) and a single Escape closes both.
 */
describe("useFocusTrap with stacked dialogs", () => {
  let view: ReactTestRenderer | undefined;
  const listeners = new Set<(event: unknown) => void>();
  const press = (key: string) => {
    for (const listener of [...listeners]) listener({ key, shiftKey: false, preventDefault() {} });
  };

  beforeEach(() => {
    vi.resetModules();
    listeners.clear();
    // No DOM in the node test environment: the smallest `document` the hook touches.
    vi.stubGlobal("HTMLElement", class {});
    vi.stubGlobal("document", {
      activeElement: null,
      addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: unknown) => void) => listeners.delete(listener),
    });
  });
  afterEach(() => { view?.unmount(); view = undefined; vi.unstubAllGlobals(); });

  async function mountStack() {
    const { useFocusTrap } = await import("../src/components/useFocusTrap");
    function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
      const ref = useRef<HTMLElement>(null);
      useFocusTrap(ref, open, onClose);
      return createElement("section", { ref });
    }
    const outer = vi.fn();
    const inner = vi.fn();
    const render = (state: { outer: boolean; inner: boolean }) => createElement("div", null,
      createElement(Dialog, { open: state.outer, onClose: outer }),
      createElement(Dialog, { open: state.inner, onClose: inner }));
    const fakeNode = { contains: () => true, focus() {}, querySelectorAll: () => [] };
    await act(async () => { view = create(render({ outer: true, inner: false }), { createNodeMock: () => fakeNode }); });
    return { outer, inner, show: (state: { outer: boolean; inner: boolean }) => act(async () => { view!.update(render(state)); }) };
  }

  it("a lone dialog still closes on Escape", async () => {
    const { outer, inner } = await mountStack();
    press("Escape");
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it("closes only the dialog on top, then the one underneath", async () => {
    const { outer, inner, show } = await mountStack();
    await show({ outer: true, inner: true });
    press("Escape");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    await show({ outer: true, inner: false });
    press("Escape");
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("the dialog opened last is the one on top, whichever order they appear in the tree", async () => {
    const { outer, inner, show } = await mountStack();
    await show({ outer: false, inner: true });
    await show({ outer: true, inner: true });
    press("Escape");
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it("leaves no listener behind once every dialog is closed", async () => {
    const { show } = await mountStack();
    await show({ outer: true, inner: true });
    await show({ outer: false, inner: false });
    expect(listeners.size).toBe(0);
  });
});
