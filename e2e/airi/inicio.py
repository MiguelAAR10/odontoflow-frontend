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
                screenshots = []

                def capture(state):
                    # Capture completed reveals, including the no-preference
                    # path used to exercise View Transition below.
                    page.wait_for_function("""() => [...document.querySelectorAll('.airi-catalog, .airi-catalog [data-layer]')].filter(el=>el.checkVisibility()).every(el=>Number(getComputedStyle(el).opacity)>=.99)""")
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
                    screenshots.append(state)
                    page.screenshot(path=str(out / f"{width}-{theme}-{state}.png"), full_page=state in ["inicio", "anclado-cerrado", "centro"])

                capture("inicio")
                panel = page.locator("#agent-panel")
                topbar_toggle = page.locator(".shell-assistant")

                def closed():
                    expect(panel).to_be_hidden()
                    expect(topbar_toggle).to_have_attribute("aria-expanded", "false")
                    # Allow the old competing effects to reopen, if still present.
                    page.wait_for_timeout(350)
                    expect(panel).to_be_hidden()

                # Empty panel: each explicit close must remain closed.
                topbar_toggle.click()
                expect(panel).to_be_visible()
                topbar_toggle.click()
                closed()
                page.keyboard.press("Control+k")
                expect(panel).to_be_visible()
                page.keyboard.press("Control+k")
                closed()
                topbar_toggle.click()
                panel.get_by_role("button", name="Cerrar asistente", exact=True).click()
                closed()
                capture("cierres-sin-consultas")
                entry = page.locator("[data-airi-input]:visible")
                entry.fill("¿Quién toma el hueco de la tarde?")
                page.evaluate("""() => {
                    window.__airiAckStart=null;window.__airiAck=null;
                    // Measure from the actual user event, excluding Python/CDP latency.
                    const start=event=>{
                        if(event.key==='Enter' && event.target.matches('[data-airi-input]')){
                            window.__airiAckStart=performance.now();document.removeEventListener('keydown',start,true);
                        }
                    };document.addEventListener('keydown',start,true);
                    const observer=new MutationObserver(()=>{
                        if(window.__airiAckStart!==null && document.querySelector('#agent-panel .airi-turn--user') && window.__airiAck===null){window.__airiAck=performance.now()-window.__airiAckStart;observer.disconnect();}
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
                # Repeat topbar and shortcut closing with an existing conversation.
                topbar_toggle.click()
                expect(panel.locator(".airi-turn--user")).to_have_count(1)
                topbar_toggle.click()
                closed()
                page.keyboard.press("Control+k")
                expect(panel).to_be_visible()
                page.keyboard.press("Control+k")
                closed()
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
                # Inicio must keep progress and cancellation next to its large input.
                page.get_by_role("link", name="AIRI, inicio", exact=True).click()
                expect(page).to_have_url(args.base_url + "/home")
                if panel.is_visible():
                    topbar_toggle.click()
                closed()
                page.locator("[data-airi-input]:visible").fill("Confirma las citas de mañana")
                page.locator("[data-airi-input]:visible").press("Enter")
                expect(panel.get_by_role("button", name="Detener", exact=True)).to_be_visible()
                topbar_toggle.click()
                closed()
                expect(page.get_by_role("button", name="Detener", exact=True)).to_have_count(1)
                progress = page.locator(".airi-home-progress [role=status]")
                expect(progress).to_be_visible()
                expect(progress).to_have_attribute("aria-live", "polite")
                expect(page.locator('[data-thread-location="center"] [data-turn]')).to_have_count(0)
                capture("inicio-cerrado-trabajando")
                page.get_by_role("button", name="Detener", exact=True).click()
                expect(progress).to_contain_text("Detenido")
                expect(page.get_by_role("button", name="Detener", exact=True)).to_have_count(0)
                capture("inicio-cerrado-detenido")

                # Both conversation components unmount on Lienzo. A role change
                # there must not reuse the previous identity when they remount.
                if width == 390:
                    page.get_by_role("button", name="Abrir navegación", exact=True).click()
                page.locator('.sidebar-item[href="/lienzo"]').click()
                expect(page).to_have_url(args.base_url + "/lienzo")
                expect(page.locator("[data-airi-input]:visible")).to_have_count(0)
                if width == 390:
                    page.get_by_role("combobox", name="Ver como", exact=True).select_option("doctor")
                else:
                    page.get_by_role("button", name="Doctor", exact=True).click()
                page.get_by_role("link", name="AIRI, inicio", exact=True).click()
                expect(page).to_have_url(args.base_url + "/home")
                expect(page.locator(".airi-home-summary")).not_to_contain_text("propuesta espera")
                topbar_toggle.click()
                expect(panel).to_be_visible()
                expect(panel.locator(".airi-turn--user")).to_have_count(0)
                expect(panel.locator("[data-card]")).to_have_count(0)
                expect(panel.get_by_role("button", name="Detener", exact=True)).to_have_count(0)
                capture("identidad-limpia")

                # Every offered task must reach its view or its real simulator
                # result. Checking only the submitted text hid review-r2's bug.
                task_results = {
                    "admin": ["/mi-turno", "/aprobaciones", "/agenda", "r-lote", "r-oferta"],
                    "dueno": ["/aprobaciones", "/direccion", "r-compara", "/caja", "/lienzo"],
                    "doctor": ["/jornada", "brief", "evolution", "/agenda", "/lienzo"],
                }
                actions = []

                def fresh_home(role):
                    page.goto(args.base_url + "/home", wait_until="networkidle")
                    page.add_style_tag(content="nextjs-portal{display:none!important}")
                    if width == 390:
                        page.get_by_role("combobox", name="Ver como", exact=True).select_option(role)
                    else:
                        label = {"admin": "Administrativo", "dueno": "Dueño", "doctor": "Doctor"}[role]
                        page.get_by_role("button", name=label, exact=True).click()
                    expect(page.locator(".airi-home-summary")).to_contain_text("3 sedes")
                    expect(page.locator(".airi-home-task")).to_have_count(5)

                for role, outcomes in task_results.items():
                    for index, outcome in enumerate(outcomes):
                        fresh_home(role)
                        task = page.locator(".airi-home-task").nth(index)
                        label = task.inner_text()
                        task.click()
                        if outcome.startswith("/"):
                            expect(page).to_have_url(args.base_url + outcome)
                            if outcome == "/lienzo":
                                expect(panel).to_have_count(0)
                                expect(page.locator("[data-airi-input]:visible")).to_have_count(0)
                            else:
                                expect(panel).to_be_visible()
                                capture(f"tarea-{role}-{index}")
                        else:
                            expect(panel).to_be_visible()
                            expect(panel.locator(".airi-turn--user")).to_have_count(1)
                            if outcome.startswith("r-"):
                                expect(panel.locator(f'[data-card="{outcome}"]')).to_be_visible()
                            elif outcome == "brief":
                                expect(panel.get_by_role("button", name="Abrir Atención →", exact=True)).to_be_visible()
                            else:
                                expect(panel).to_contain_text("Borrador de evolución · requiere revisión humana")
                            expect(panel.get_by_role("button", name="Detener", exact=True)).to_have_count(0)
                            expect(panel).not_to_contain_text("No entendí")
                            expect(panel).not_to_contain_text("No puedo mostrar este contenido")
                            capture(f"tarea-{role}-{index}")
                        actions.append({"role": role, "task": label, "outcome": outcome})

                # Fresh views exercise fixture fallback without a prior run.
                # Unit tests also exercise the snapshot emitted by the source.
                for target, title, expected in [
                    ("/agenda", "Agenda", ["1260 de 1620 minutos ocupados", "2460 minutos libres", "Sin datos de ocupación"]),
                    ("/caja", "Caja", ["Cobrado: S/ 3,120.00", "Por verificar: S/ 420.00", "datos incompletos"]),
                ]:
                    fresh_home("admin")
                    # Same native navigation handler shared by tasks/suggestions.
                    if target == "/agenda":
                        page.locator(".airi-home-suggestions").get_by_role("button", name="Agenda de hoy", exact=True).click()
                    else:
                        page.locator(".airi-home-task").nth(1).click()
                        expect(panel).to_be_visible()
                        if width == 390:
                            panel.get_by_role("button", name="Cerrar asistente", exact=True).click()
                            page.get_by_role("button", name="Abrir navegación", exact=True).click()
                        page.locator('.sidebar-item[href="/caja"]').click()
                    expect(page).to_have_url(args.base_url + target)
                    if not panel.is_visible():
                        topbar_toggle.click()
                    before = panel.locator("[data-card]").count()
                    panel.get_by_role("button", name="Resume esta vista", exact=True).click()
                    answer = panel.locator(".airi-turn--assistant").last
                    expect(answer).to_contain_text("Viendo: " + title)
                    for text in expected:
                        expect(answer).to_contain_text(text)
                    expect(answer).not_to_contain_text("No entendí")
                    expect(answer).not_to_contain_text("No puedo mostrar este contenido")
                    expect(panel.locator("[data-card]")).to_have_count(before)
                    capture("resumen-" + title.lower())
                assert not errors, f"Console errors {width}/{theme}: {errors}"
                result = {"width": width, "theme": theme, "ack_ms": round(ack, 2), "console_errors": len(errors), "contrast_samples": len(samples), "min_contrast": round(min(samples), 2), "screenshots": len(screenshots), "task_results": actions, "regressions": ["topbar_close", "ctrl_k_close", "internal_close", "home_closed_stop", "role_after_canvas", "all_role_tasks", "contextual_summaries"]}
                results.append(result)
                print(json.dumps(result), flush=True)
                context.close()
    finally:
        browser.close()
(out / "results.json").write_text(json.dumps(results, indent=2))
