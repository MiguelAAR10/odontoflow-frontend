"""Keyboard regressions from B1 review r2; requires a mock-mode dev server."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:5211")
parser.add_argument("--output", default=".audit/B1-SHELL-fix-r2")
parser.add_argument("--only", choices=["panel", "persona", "all"], default="all")
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks = []


def check(label, value):
    assert value, label
    checks.append(label)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width, height in [(390, 844), (1440, 1000)]:
        for theme in ["light", "dark"]:
            context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme, reduced_motion="reduce")
            page = context.new_page()
            page.set_default_navigation_timeout(120000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(args.base_url + "/agenda", wait_until="networkidle")
            expect(page.locator(".sidebar-profile strong")).to_contain_text("Lucía", timeout=30000)
            page.add_style_tag(content="nextjs-portal {display:none !important}")
            label = f"{width}/{theme}"
            main = page.locator("#main-content")
            panel = page.locator("#agent-panel")
            opener = page.get_by_role("button", name="Abrir asistente", exact=True)
            closer = panel.get_by_role("button", name="Cerrar asistente", exact=True)

            if args.only in ["panel", "all"]:
                opener.click()
                expect(closer).to_be_focused()
                # Reproduce the review's exact Shift+Tab path before broader checks.
                page.keyboard.press("Shift+Tab")
                if width == 390:
                    check(label + ": reverse Tab skips covered view", not main.evaluate("el => el.contains(document.activeElement)"))
                check(label + ": main inert matches overlay", main.evaluate("el => el.inert") == (width == 390))
                # Enter text so Send joins the real tab order too.
                page.get_by_role("textbox", name="Pregúntale a AIRI").fill("Revisar agenda")
                for key in ["Tab", "Shift+Tab"]:
                    closer.focus()
                    visited = set()
                    for _ in range(24 if width == 390 else 0):
                        page.keyboard.press(key)
                        state = page.evaluate("""() => {
                            const el = document.activeElement;
                            const r = el.getBoundingClientRect();
                            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                            return { name: el.getAttribute('aria-label') || el.textContent || el.tagName, tag: el.tagName, rect: r.toJSON(), top: top?.outerHTML,
                                main: !!el.closest('#main-content'),
                                visible: el === top || el.contains(top),
                                outline: getComputedStyle(el).outlineStyle,
                                bar: !!el.closest('.interaction-bar'), panel: !!el.closest('#agent-panel') };
                        }""")
                        if state["tag"] != "BODY" and not state["visible"]:
                            # The skip link slides into view on focus; wait for its real hit target.
                            page.wait_for_function("""() => {
                                const el = document.activeElement;
                                const r = el.getBoundingClientRect();
                                const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                                return el === top || el.contains(top);
                            }""", timeout=1500)
                            state["visible"] = True
                        # Chromium exposes BODY when Tab leaves the document for browser chrome.
                        if width == 390 and state["tag"] != "BODY":
                            check(label + f": {key} uncovered focus {state}", not state["main"] and state["visible"])
                            check(label + f": {key} visible outline", state["outline"] != "none")
                        if state["bar"]:
                            visited.add("bar")
                        if state["panel"]:
                            visited.add("panel")
                    if width == 390:
                        check(label + f": {key} reaches panel and bar", visited == {"panel", "bar"})
                closer.focus()
                page.screenshot(path=str(out / f"keyboard-panel-{width}-{theme}.png"))
                if width == 390:
                    for resized in [1180, 1181, 1440, 390]:
                        page.set_viewport_size({"width": resized, "height": height})
                        expect(main).to_have_js_property("inert", resized <= 1180)
                        check(label + f": resize {resized} restores traversal", True)
                    # A focused view control must move into the panel on desktop -> overlay.
                    page.set_viewport_size({"width": 1440, "height": height})
                    expect(main).to_have_js_property("inert", False)
                    main.get_by_role("button", name="Agregar usuario", exact=True).focus()
                    page.set_viewport_size({"width": 390, "height": height})
                    expect(closer).to_be_focused()
                    check(label + ": resize moves covered focus into panel", True)
                if width == 390:
                    page.get_by_role("button", name="Abrir navegación", exact=True).click()
                    page.locator(".persona-switcher__trigger").click()
                    page.locator('.persona-menu__option[aria-pressed="false"]').first.click()
                    expect(main).to_have_js_property("inert", True)
                    page.keyboard.press("Escape")
                    expect(panel).to_be_visible()
                    check(label + ": persona change keeps view excluded", True)
                closer.focus()
                page.keyboard.press("Escape")
                expect(panel).to_be_hidden()
                expect(opener).to_be_focused()
                expect(main).to_have_js_property("inert", False)
                main.get_by_role("button", name="Agregar usuario", exact=True).focus()
                expect(main.get_by_role("button", name="Agregar usuario", exact=True)).to_be_focused()
                check(label + ": close restores view traversal and trigger", True)
                opener.click()
                # Client-side navigation unmounts the panel on Lienzo.
                if width == 390:
                    page.get_by_role("button", name="Abrir navegación", exact=True).click()
                page.locator(".sidebar-nav").get_by_role("link", name="Lienzo", exact=True).click()
                expect(page).to_have_url(args.base_url + "/lienzo")
                expect(panel).to_have_count(0)
                expect(page.locator("#main-content")).to_have_js_property("inert", False)
                check(label + ": canvas unmount restores view", True)
                page.goto(args.base_url + "/agenda", wait_until="networkidle")

            if args.only in ["persona", "all"]:
                if width == 390:
                    page.get_by_role("button", name="Abrir navegación", exact=True).click()
                trigger = page.locator(".persona-switcher__trigger")
                trigger.click()
                expect(page.locator(".persona-menu")).to_be_visible()
                page.keyboard.press("Escape")
                expect(page.locator(".persona-menu")).to_have_count(0)
                expect(trigger).to_be_focused()
                if width == 390:
                    expect(page.locator(".app-sidebar--open")).to_be_visible()
                    check(label + ": first Escape closes only persona", True)
                    page.screenshot(path=str(out / f"keyboard-persona-{width}-{theme}.png"))
                    page.keyboard.press("Escape")
                    expect(page.locator(".app-sidebar--open")).to_have_count(0)
                    expect(page.get_by_role("button", name="Abrir navegación", exact=True)).to_be_focused()
                    check(label + ": second Escape closes navigation", True)
                else:
                    check(label + ": persona Escape restores trigger", True)
            check(label + ": no overflow", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            check(label + ": no JS errors", not errors)
            print(label + ": keyboard verified", flush=True)
            context.close()
    browser.close()

(out / f"keyboard-{args.only}-checks.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2))
print(f"{len(checks)} keyboard checks passed")
