"""C1-INICIO: NEXT_PUBLIC_USE_MOCKS=true next dev -p 5221 -H 127.0.0.1.
Run: python3 e2e/airi/inicio.py --base-url http://127.0.0.1:5221
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

expect.set_options(timeout=30000)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:5221")
parser.add_argument("--output", default=".audit/C1-INICIO")
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
results = []


def contrast(fg, bg):
    def luminance(color):
        values = [int(v) / 255 for v in re.findall(r"\d+", color)[:3]]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, [.2126, .7152, .0722]))
    a, b = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (a + .05) / (b + .05)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ["light", "dark"]:
                context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme, reduced_motion="reduce")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                page.goto(args.base_url + "/home", wait_until="networkidle", timeout=120000)
                expect(page.locator(".airi-home-summary")).to_contain_text("3 sedes")
                expect(page.locator(".airi-home-task")).to_have_count(5)
                page.add_style_tag(content="nextjs-portal{display:none!important}")
                samples = []

                def capture(state):
                    expect(page.locator("[data-airi-input]:visible")).to_have_count(1)
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow {width}/{theme}/{state}"
                    assert page.evaluate("""() => [...document.querySelectorAll('.airi-home, #agent-panel, .airi-interaction, .airi-thread')].filter(e=>e.checkVisibility()).every(e=>e.scrollWidth<=e.clientWidth+1)"""), f"Internal overflow {width}/{theme}/{state}"
                    colors = page.locator(".airi-home, #agent-panel, .airi-interaction").evaluate_all("""roots => roots.flatMap(root=>[...root.querySelectorAll('h1,h2,p,button,input,span')].filter(el=>el.checkVisibility() && !el.disabled && el.textContent.trim() && !el.querySelector('p,h1,h2,button,input,span') && !el.closest('[inert]')).map(el=>{
                        let parent=el, background;
                        while(parent){background=getComputedStyle(parent).backgroundColor;if(background!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
                        const css=getComputedStyle(el);
                        return {text:el.textContent.slice(0,60),foreground:css.color,background,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
                    }))""")
                    for item in colors:
                        ratio = contrast(item["foreground"], item["background"])
                        large = item["size"] >= 24 or (item["size"] >= 18.66 and item["weight"] >= 700)
                        assert ratio >= (3 if large else 4.5), f"Contrast {width}/{theme}/{state}: {item} {ratio:.2f}"
                        samples.append(ratio)
                    page.screenshot(path=str(out / f"{width}-{theme}-{state}.png"), full_page=state in ["inicio", "anclado-cerrado", "centro"])

                capture("inicio")
                entry = page.locator("[data-airi-input]:visible")
                entry.fill("¿Quién toma el hueco de la tarde?")
                page.evaluate("""() => {
                    window.__airiAckStart=performance.now();window.__airiAck=null;
                    const observer=new MutationObserver(()=>{
                        if(document.querySelector('#agent-panel .airi-turn--user') && window.__airiAck===null){window.__airiAck=performance.now()-window.__airiAckStart;observer.disconnect();}
                    });observer.observe(document.body,{childList:true,subtree:true});
                }""")
                entry.press("Enter")
                panel = page.locator("#agent-panel")
                expect(panel).to_be_visible()
                expect(page.locator('[data-thread-location="center"] [data-turn]')).to_have_count(0)
                expect(panel.locator(".airi-turn--user")).to_have_count(1)
                ack = page.evaluate("window.__airiAck")
                assert ack is not None and ack < 300, f"Acknowledgement {ack} ms"
                bar_entry = page.locator(".airi-interaction input")
                expect(bar_entry).to_be_focused()
                # Focus stays in the composer while the stream adds content.
                expect(panel.get_by_role("button", name="Aprobar y ofrecer", exact=True)).to_be_visible()
                expect(bar_entry).to_be_focused()
                capture("panel")
                panel.get_by_role("button", name="Cerrar asistente", exact=True).click()
                expect(panel).to_be_hidden()
                expect(page.locator(".airi-home")).to_have_attribute("data-docked", "true")
                expect(page.locator('[data-thread-location="center"] [data-turn]')).to_have_count(0)
                capture("anclado-cerrado")
                page.locator("[data-airi-input]:visible").fill("sí")
                page.locator("[data-airi-input]:visible").press("Enter")
                expect(panel).to_be_visible()
                expect(panel.locator(".airi-turn--user")).to_have_count(2)
                expect(panel).to_contain_text("Escribir un asentimiento no aprueba nada")
                expect(panel.get_by_role("button", name="Aprobar y ofrecer", exact=True)).to_be_enabled()
                panel.locator(".airi-panel-center").click()
                expect(panel).to_be_hidden()
                expect(page.locator(".airi-home")).to_have_attribute("data-docked", "false")
                expect(page.locator('[data-thread-location="center"] .airi-turn--user')).to_have_count(2)
                expect(page.locator("[data-airi-input]:visible")).to_be_focused()
                capture("centro")
                page.emulate_media(reduced_motion="no-preference")
                page.locator('[data-thread-location="center"]').get_by_role("button", name="Abrir Bandeja →", exact=True).click()
                expect(page).to_have_url(args.base_url + "/aprobaciones")
                expect(panel).to_be_visible()
                expect(panel.locator(".airi-turn--user")).to_have_count(2)
                expect(panel.locator(".agent-panel__context")).to_contain_text("Viendo: Bandeja")
                expect(page.locator('[data-thread-location="center"] [data-turn]')).to_have_count(0)
                capture("vista")
                # Cancellation keeps the partial thread, including proposals from earlier runs.
                bar_entry.fill("Confirma las citas de mañana")
                bar_entry.press("Enter")
                expect(panel.get_by_role("button", name="Detener", exact=True)).to_be_visible()
                panel.get_by_role("button", name="Cerrar asistente", exact=True).click()
                expect(panel).to_be_hidden()
                expect(page.locator(".airi-bar-label").filter(has_text="Ver hilo 3")).to_be_visible()
                page.locator(".airi-interaction").get_by_role("button", name="Detener", exact=True).click()
                page.locator(".airi-bar-label").filter(has_text="Ver hilo 3").click()
                expect(panel).to_contain_text("Detenido")
                expect(panel.locator(".airi-turn--user")).to_have_count(3)
                capture("detenido")
                # Only a human click confirms the proposal; its source survives view changes.
                offer = panel.locator('[data-card="r-oferta"]')
                offer.get_by_role("button", name="Aprobar y ofrecer", exact=True).click()
                expect(offer.locator(".catalog-stamp")).to_have_text("Aprobado")
                assert not errors, f"Console errors {width}/{theme}: {errors}"
                result = {"width": width, "theme": theme, "ack_ms": round(ack, 2), "console_errors": len(errors), "contrast_samples": len(samples), "min_contrast": round(min(samples), 2), "screenshots": 6}
                results.append(result)
                print(json.dumps(result), flush=True)
                context.close()
    finally:
        browser.close()
(out / "results.json").write_text(json.dumps(results, indent=2))
