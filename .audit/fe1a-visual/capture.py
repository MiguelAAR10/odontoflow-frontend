import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("FE1A_BASE_URL", "http://127.0.0.1:5189")
EVIDENCE_DIR = Path(os.environ.get("FE1A_EVIDENCE_DIR", ".audit/fe1a-visual/after"))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    checks: dict[str, object] = {"screenshots": [], "console_errors": [], "page_errors": []}
    with sync_playwright() as playwright:
        executable = os.environ.get("VISUAL_BROWSER_PATH")
        browser = playwright.chromium.launch(headless=True, executable_path=executable)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = context.new_page()
        page.on("console", lambda message: checks["console_errors"].append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: checks["page_errors"].append(str(error)))

        def capture(route: str, filename: str, width: int, height: int, heading: str) -> None:
            page.set_viewport_size({"width": width, "height": height})
            page.goto(f"{BASE_URL}{route}", wait_until="networkidle")
            page.get_by_role("heading", name=heading, exact=True).wait_for()
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(EVIDENCE_DIR / filename), full_page=False)
            checks["screenshots"].append({"file": filename, "route": route, "width": width, "height": height})

        capture("/agenda", "agenda-1440.png", 1440, 900, "Agenda de citas")
        capture("/agenda", "agenda-1024.png", 1024, 900, "Agenda de citas")
        capture("/agenda", "agenda-390.png", 390, 844, "Agenda de citas")
        page.get_by_role("button", name="Abrir navegación").click()
        page.get_by_role("link", name="Inventario", exact=True).wait_for()
        page.wait_for_timeout(300)
        page.screenshot(path=str(EVIDENCE_DIR / "shell-mobile-drawer-390.png"), full_page=False)
        checks["screenshots"].append({"file": "shell-mobile-drawer-390.png", "route": "/agenda", "width": 390, "height": 844})

        capture("/inventario", "inventory-1440.png", 1440, 900, "Gestión de inventario")

        # Search is the shared topbar patient lookup and must still deep-link to Patients.
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(f"{BASE_URL}/agenda", wait_until="networkidle")
        page.get_by_role("textbox", name="Buscar paciente por DNI, nombre o teléfono").fill("Ana")
        page.locator(".global-search__results button").first.wait_for()
        page.locator(".global-search__results button").first.click()
        page.wait_for_url("**/pacientes?patient=ana")
        checks["search_route"] = page.url

        page.goto(f"{BASE_URL}/agenda", wait_until="networkidle")
        page.get_by_role("button", name="Nueva cita", exact=True).click()
        checks["new_appointment_open"] = page.get_by_role("heading", name="Nueva cita", exact=True).is_visible()
        page.get_by_role("button", name="Cerrar modal").click()

        page.get_by_role("link", name="Inventario", exact=True).click()
        page.get_by_role("heading", name="Gestión de inventario", exact=True).wait_for()
        checks["navigation_route"] = page.url

        logos = page.locator('img[alt="Odonto Smart"]')
        checks["official_logo_count"] = logos.count()
        checks["official_logo_sources"] = [logos.nth(index).get_attribute("src") for index in range(logos.count())]
        checks["fake_logo_mark_count"] = page.locator(".brand__mark").count()
        checks["leonardo_in_ui"] = "Leonardo Panduro" in page.locator("body").inner_text()
        checks["voice_link_count"] = page.get_by_role("link", name="Asistente", exact=True).count()
        checks["heading_font"] = page.locator("h1").first.evaluate("node => getComputedStyle(node).fontFamily")
        checks["body_font"] = page.locator("body").evaluate("node => getComputedStyle(node).fontFamily")
        checks["fontshare_clash_ready"] = page.evaluate("document.fonts.check('32px Clash Display')")
        checks["fontshare_satoshi_ready"] = page.evaluate("document.fonts.check('16px Satoshi')")
        checks["brand_tokens"] = page.evaluate("""() => {
          const style = getComputedStyle(document.documentElement);
          return {
            cyan: style.getPropertyValue('--brand-cyan').trim(),
            magenta: style.getPropertyValue('--brand-magenta').trim(),
            deep: style.getPropertyValue('--brand-deep').trim(),
            canvas: style.getPropertyValue('--canvas').trim(),
          };
        }""")

        checks["unexpected_errors"] = bool(checks["console_errors"] or checks["page_errors"])
        (EVIDENCE_DIR.parent.parent / "fe1a-browser-verification.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n")
        browser.close()


if __name__ == "__main__":
    main()
