"""G1-SHELL: visible controls and zero internal clipping on mobile.

Run against Next dev with NEXT_PUBLIC_USE_MOCKS=true.
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


VIEWS = [
    ("home", "/home", "admin"), ("agenda", "/agenda", "admin"),
    ("bandeja", "/aprobaciones", "admin"), ("caja", "/caja", "admin"),
    ("actividad", "/agente", "admin"), ("turno", "/mi-turno", "admin"),
    ("direccion", "/direccion", "dueno"), ("jornada", "/jornada", "doctor"),
    ("ficha", "/atencion", "doctor"), ("canvas", "/lienzo", "admin"),
]
MEASURE = """() => {
  const header = document.querySelector('.app-topbar');
  const visible = el => el instanceof HTMLElement && el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && el.clientWidth > 1;
  const overflow = [header, ...header.querySelectorAll('*')].filter(el => {
    if (!visible(el) || el.closest('[aria-hidden="true"]') || el.matches('button[data-agent]')) return false;
    const style = getComputedStyle(el);
    return style.clipPath === 'none' && style.textOverflow !== 'ellipsis' &&
      // Match the parity auditor's 1px tolerance for rounded SVG decoration.
      !['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
  }).map(el => ({selector: el.className, pixels: el.scrollWidth - el.clientWidth}));
  const controls = [...header.children].filter(el => visible(el) && el.matches('button, select, a, .topbar-actions'));
  const rects = controls.map(el => ({selector: el.className, ...el.getBoundingClientRect().toJSON()}));
  const outside = rects.filter(rect => rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > header.getBoundingClientRect().bottom);
  const overlaps = rects.flatMap((a, i) => rects.slice(i + 1).filter(b =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
  ).map(b => [a.selector, b.selector]));
  const canvas = document.createElement('canvas').getContext('2d');
  const clippedLabels = controls.filter(el => el.matches('select')).flatMap(el => {
    const style = getComputedStyle(el);
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const needed = canvas.measureText(el.selectedOptions[0].text).width +
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 18;
    return needed > el.clientWidth ? [{selector: el.className, needed, available: el.clientWidth}] : [];
  });
  return {overflow, outside, overlaps, clippedLabels, documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:5261")
    parser.add_argument("--output", default=".audit/G1-SHELL/mobile")
    parser.add_argument("--widths", nargs="+", type=int, default=[360, 390, 430, 1440])
    parser.add_argument("--views", nargs="+", choices=[view[0] for view in VIEWS])
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    results = []
    expect.set_options(timeout=30000)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for width in args.widths:
                for theme in ["light", "dark"]:
                    context = browser.new_context(viewport={"width": width, "height": 1000 if width == 1440 else 844}, color_scheme=theme)
                    context.add_init_script(f"sessionStorage.setItem('airi.intro.v1','1'); localStorage.setItem('airi.shell.theme.v1','{theme}');")
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        for view, route, role in VIEWS:
                            if args.views and view not in args.views:
                                continue
                            page.goto(args.base_url.rstrip("/") + route, wait_until="networkidle")
                            expect(page.locator("html")).to_have_attribute("data-theme", theme)
                            if width <= 760:
                                page.get_by_role("combobox", name="Ver como", exact=True).select_option(role)
                            else:
                                page.get_by_role("button", name={"admin": "Administrativo", "dueno": "Dueño", "doctor": "Doctor"}[role], exact=True).click()
                            expect(page.locator("main h1").first).to_be_visible()
                            page.evaluate("document.fonts.ready")
                            # The longest option must fit too, before the Lince scope used by parity.
                            for location in ["", "1"]:
                                page.get_by_role("combobox", name="Sede", exact=True).select_option(location)
                                metrics = page.evaluate(MEASURE)
                                results.append({"view": view, "width": width, "theme": theme, "location": location, **metrics})
                                (output / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
                                assert not metrics["overflow"], f"{view}/{width}/{theme}: {metrics['overflow']}"
                                assert not metrics["outside"], metrics["outside"]
                                assert not metrics["overlaps"], metrics["overlaps"]
                                assert not metrics["clippedLabels"], metrics["clippedLabels"]
                            page.add_style_tag(content="nextjs-portal {display:none !important}")
                            page.screenshot(path=str(output / f"{view}-{width}-{theme}.png"))
                            if width <= 760:
                                page.get_by_role("button", name="Buscar paciente", exact=True).click()
                                expect(page.get_by_role("textbox", name="Buscar paciente por DNI, nombre o teléfono", exact=True)).to_be_focused()
                                assert not page.evaluate(MEASURE)["overflow"]
                                page.keyboard.press("Escape")
                                expect(page.get_by_role("button", name="Buscar paciente", exact=True)).to_be_focused()
                                page.get_by_role("button", name="Abrir navegación", exact=True).click()
                                expect(page.locator("#app-sidebar")).to_be_visible()
                                page.keyboard.press("Escape")
                                expect(page.locator("#app-sidebar")).not_to_be_visible()
                        assert not errors, errors
                    finally:
                        context.close()
        finally:
            browser.close()
    print(f"{len(results)} geometry checks passed; search and navigation verified on mobile.")


if __name__ == "__main__":
    main()
