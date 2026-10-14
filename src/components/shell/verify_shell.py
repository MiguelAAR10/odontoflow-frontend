"""B1 regression: run against Next dev with NEXT_PUBLIC_USE_MOCKS=true.

python3 src/components/shell/verify_shell.py --base-url http://127.0.0.1:5211
"""
import argparse
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

# A cold dev route may compile before the client navigation can complete.
expect.set_options(timeout=30000)


def contrast(foreground, background):
    def luminance(color):
        channels = [int(x) / 255 for x in re.findall(r"\d+", color)[:3]]
        linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in channels]
        return sum(x * weight for x, weight in zip(linear, [.2126, .7152, .0722]))
    high, low = sorted([luminance(foreground), luminance(background)], reverse=True)
    return (high + .05) / (low + .05)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:5211")
parser.add_argument("--output", default=".audit/B1-SHELL-fix-r2")
parser.add_argument("--only", choices=["persona", "routes", "all"], default="all")
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width, height in [(1440, 1000), (390, 844)]:
        for theme in ["light", "dark"]:
            context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(args.base_url + "/agenda", wait_until="networkidle")
            expect(page.locator(".sidebar-profile strong")).to_contain_text("Lucía", timeout=30000)
            page.add_style_tag(content="nextjs-portal {display:none !important}")

            def open_navigation():
                if width == 390:
                    page.get_by_role("button", name="Abrir navegación", exact=True).click()

            def set_role(role):
                if width == 390:
                    page.get_by_role("combobox", name="Ver como", exact=True).select_option(role)
                else:
                    label = {"admin": "Administrativo", "dueno": "Dueño", "doctor": "Doctor"}[role]
                    page.get_by_role("button", name=label, exact=True).click()

            if args.only in ["persona", "all"]:
                open_navigation()
                trigger = page.locator(".persona-switcher__trigger")
                trigger.click()
                menu = page.get_by_role("group", name="Cambiar de persona", exact=True)
                expect(menu).to_be_visible()
                expect(menu.locator(".persona-menu__option").first).to_be_visible()
                for state in ["normal", "hover"]:
                    if state == "hover":
                        menu.locator(".persona-menu__option").first.hover()
                    colors = menu.evaluate("""menu => [...menu.querySelectorAll('.persona-menu__label, .persona-menu__empty, strong, small')].map(el => {
                        let parent = el;
                        let background;
                        while (parent) {
                            background = getComputedStyle(parent).backgroundColor;
                            if (background !== 'rgba(0, 0, 0, 0)') break;
                            parent = parent.parentElement;
                        }
                        return {text: el.textContent, foreground: getComputedStyle(el).color, background};
                    })""")
                    assert colors, "Persona menu must have text"
                    for item in colors:
                        ratio = contrast(item["foreground"], item["background"])
                        assert ratio >= 4.5, f'{width}/{theme}/{state}: {item["text"]} contrast {ratio:.2f}:1'
                        checks.append({"width": width, "theme": theme, "state": state, "text": item["text"], "contrast": ratio})
                page.screenshot(path=str(out / f"persona-{width}-{theme}.png"))
                menu.locator('.persona-menu__option[aria-pressed="false"]').first.click()
                expect(menu).to_have_count(0)
                expect(trigger).to_be_focused()
                checks.append({"width": width, "theme": theme, "persona_switch": True})
                if width == 390:
                    page.keyboard.press("Escape")

            if args.only in ["routes", "all"]:
                for role, route, label in [
                    ("admin", "/mi-turno", "Mi turno"),
                    ("dueno", "/direccion", "Dirección"),
                    ("doctor", "/jornada", "Mi jornada"),
                    ("doctor", "/atencion", "Atención"),
                    ("admin", "/lienzo", "Lienzo"),
                ]:
                    set_role(role)
                    if route == "/lienzo":
                        page.get_by_role("button", name="Abrir asistente", exact=True).click()
                        expect(page.locator("#agent-panel")).to_be_visible()
                    open_navigation()
                    page.locator(".sidebar-nav").get_by_role("link", name=label, exact=True).click()
                    expect(page).to_have_url(args.base_url + route)
                    expect(page.locator("#main-content").get_by_role("heading", name=label, exact=True)).to_be_visible()
                    if route == "/lienzo":
                        expect(page.locator("#agent-panel")).to_have_count(0)
                        expect(page.locator(".interaction-bar")).to_have_count(0)
                    page.reload(wait_until="networkidle")
                    expect(page).to_have_url(args.base_url + route)
                    expect(page.locator("#main-content").get_by_role("heading", name=label, exact=True)).to_be_visible()
                    set_role(role)
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), route + " overflow"
                    if route == "/lienzo":
                        expect(page.locator("#agent-panel")).to_have_count(0)
                        expect(page.locator(".interaction-bar")).to_have_count(0)
                        expect(page.get_by_role("button", name="Abrir asistente", exact=True)).to_have_count(0)
                        page.screenshot(path=str(out / f"lienzo-{width}-{theme}.png"))
                    else:
                        page.get_by_role("button", name="Abrir asistente", exact=True).click()
                        expect(page.locator("#agent-panel")).to_contain_text("Viendo: " + label)
                        page.keyboard.press("Escape")
                    checks.append({"width": width, "theme": theme, "route": route})
                open_navigation()
                page.locator(".sidebar-nav").get_by_role("link", name="Agenda", exact=True).click()
                expect(page.locator(".interaction-bar")).to_be_visible()
            assert not errors, errors
            context.close()
    browser.close()

(out / (args.only + "-checks.json")).write_text(json.dumps(checks, ensure_ascii=False, indent=2))
print(f"{len(checks)} checks passed")
