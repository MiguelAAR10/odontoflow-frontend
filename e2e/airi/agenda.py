"""D1-AGENDA: run against the mock dev server on :5231 (no production test hooks).

The stale-hash case uses Chromium's debugger to corrupt only the submitted
approval envelope. The actual simulator, error mapper, store and UI handle it.
Use --real-read against a mocks=false server to check the existing HTTP seam
with Playwright transport responses; this is not live-backend integration.
"""
import argparse
import json
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base-url", default="http://127.0.0.1:5231")
parser.add_argument("--output", default=".audit/D1-AGENDA")
parser.add_argument("--mockup-url", default="http://127.0.0.1:8130/agente-v10/")
parser.add_argument("--real-read", action="store_true")
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)


def contrast(fg, bg):
    def luminance(color):
        values = [int(v) / 255 for v in re.findall(r"\d+", color)[:3]]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, [.2126, .7152, .0722]))
    a, b = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (a + .05) / (b + .05)


def stale_hash_once(session, scripts):
    """Inject at the transport boundary, without mutating React or store state."""
    for script in scripts:
        if not script["url"].startswith(args.base_url):
            continue
        code = session.send("Debugger.getScriptSource", {"scriptId": script["scriptId"]})["scriptSource"]
        marker = "async approve(request, idempotencyKey)"
        if marker not in code:
            continue
        line = next(i for i, text in enumerate(code.splitlines()) if marker in text)
        point = session.send("Debugger.setBreakpoint", {"location": {"scriptId": script["scriptId"], "lineNumber": line + 1}})
        statuses = []
        injected = []

        def paused(event):
            if event["reason"] in ["exception", "promiseRejection"]:
                value = session.send("Runtime.callFunctionOn", {
                    "objectId": event["data"]["objectId"],
                    "functionDeclaration": "function(){return this.httpStatus}", "returnByValue": True,
                })["result"].get("value")
                statuses.append(value)
                session.send("Debugger.setPauseOnExceptions", {"state": "none"})
            else:
                session.send("Debugger.removeBreakpoint", {"breakpointId": point["breakpointId"]})
                session.send("Debugger.evaluateOnCallFrame", {
                    "callFrameId": event["callFrames"][0]["callFrameId"],
                    "expression": 'request.payload_hash = "obsolete-hash"',
                })
                injected.append(True)
                session.send("Debugger.setPauseOnExceptions", {"state": "all"})
            session.send("Debugger.resume")

        session.on("Debugger.paused", paused)
        return statuses, injected
    raise AssertionError("No se encontró la frontera de aprobación del simulador (usar next dev)")


def capture(page, prefix, state):
    page.add_style_tag(content="nextjs-portal{display:none!important}")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow {prefix}/{state}"
    assert page.locator(".airi-agenda-view").evaluate("el=>el.scrollWidth<=el.clientWidth+1"), f"Agenda overflow {prefix}/{state}"
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=str(out / f"{prefix}-{state}.png"), full_page=True)


def real_read(page, prefix):
    """Stub only the HTTP transport using existing generated read DTO fields."""
    requests = []
    today = datetime.now(ZoneInfo("America/Lima")).strftime("%Y-%m-%d")
    row = {"id": 9001, "lead_id": 1, "patient_id": None, "service_id": 2, "practitioner_id": 3,
           "location_id": 4, "start_utc": f"{today}T14:00:00Z", "end_utc": f"{today}T15:00:00Z",
           "state": "confirmed", "lead_name": "Lectura HTTP D1", "patient_name": None,
           "service_name": "Servicio registrado", "practitioner_name": "Dra. HTTP", "location_name": "Sede HTTP"}
    responses = {
        "/api/session": {"personas": [{"key": "d1", "display_name": "Personal D1", "role": "secretaria"}], "current": "d1", "requires_code": False},
        "/api/backend/me": {"principal": {"id": 1, "type": "human", "display_name": "Personal D1"}, "organization": {"id": 1, "name": "Clínica HTTP"},
                            "roles": [{"code": "secretaria", "name": "Secretaria"}], "permissions": ["appointments.read"]},
        "/api/backend/patients": [],
        "/api/backend/locations": [{"id": 4, "name": "Sede HTTP", "timezone": "America/Lima", "is_active": True}],
        "/api/backend/appointments": [row], "/api/backend/appointments/9001": row,
    }

    def route_api(route):
        from urllib.parse import urlparse, parse_qs
        path = urlparse(route.request.url).path
        requests.append({"path": path, "method": route.request.method, "query": parse_qs(urlparse(route.request.url).query)})
        assert path in responses, f"Endpoint no esperado: {path}"
        route.fulfill(json=responses[path])

    page.route("**/api/**", route_api)
    page.goto(args.base_url + "/agenda", wait_until="networkidle")
    expect(page.locator('[data-appointment="9001"]')).to_be_visible()
    expect(page.locator('[data-gap]')).to_have_count(0)
    expect(page.get_by_role("button", name="Consultar el hueco")).to_have_count(0)
    expect(page.locator("main")).not_to_contain_text("Demostración")
    expect(page.locator("main")).not_to_contain_text("Inés Gómez")
    page.locator('[data-appointment="9001"]').click()
    expect(page.get_by_role("dialog")).to_contain_text("Lectura HTTP D1")
    expect(page.get_by_role("dialog")).to_contain_text("Confirmada")
    page.get_by_role("dialog").get_by_role("button", name="Cerrar detalle").click()
    page.screenshot(path=str(out / f"{prefix}-real.png"), full_page=True)
    reads = [request for request in requests if request["path"] == "/api/backend/appointments"]
    assert reads and all("from_date" in read["query"] and "to_date" in read["query"] for read in reads)
    assert all(request["method"] == "GET" for request in requests)
    loaded_sim = page.evaluate("performance.getEntriesByType('resource').filter(r=>/src_agui_sim/.test(r.name)).map(r=>r.name)")
    # Turbopack eagerly registers the async gaps loader; it contains no fixture
    # payload. The fixture chunks and scenario source must never be requested.
    loaded_data = [name for name in loaded_sim if "src_agui_sim_gaps_ts_" not in name]
    assert not loaded_data, loaded_data
    return {"http_reads": len(requests), "gaps": 0, "mock_data_chunks": len(loaded_data)}


results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ["light", "dark"]:
                prefix = f"{width}-{theme}"
                context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme, reduced_motion="reduce")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                if args.real_read:
                    result = real_read(page, prefix)
                else:
                    session = context.new_cdp_session(page)
                    scripts = []
                    session.on("Debugger.scriptParsed", lambda event: scripts.append(event))
                    session.send("Debugger.enable")
                    page.goto(args.base_url + "/agenda", wait_until="networkidle")
                    expect(page.locator(".airi-agenda-note")).to_contain_text("13 oct.")
                    expect(page.locator(".airi-agenda-now").first).to_have_attribute("aria-label", "Hora Lima 14:00")
                    expect(page.locator('.airi-agenda-appointment.airi-appointment-past').first).to_contain_text("cerrada")
                    expect(page.locator('[data-gap="leon"]')).to_have_count(0)
                    capture(page, prefix, "agenda")
                    # Measure all visible appointment color pairs, including muted history.
                    colors = page.locator(".airi-agenda-appointment").evaluate_all("els=>els.filter(e=>e.checkVisibility()&&!e.disabled).map(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}))")
                    ratios = [contrast(item["fg"], item["bg"]) for item in colors if item["bg"] != "rgba(0, 0, 0, 0)"]
                    assert min(ratios) >= 4.5, f"Contraste {prefix}: {min(ratios)}"
                    page.locator('.airi-doctor-select select').select_option("leon")
                    expect(page.locator('.airi-doctor-column')).to_have_count(1)
                    expect(page.locator('[data-appointment="c11"]')).to_be_visible()
                    page.locator('.airi-doctor-select select').select_option("ruiz")
                    page.locator('[data-appointment="c0"]').click()
                    expect(page.get_by_role("dialog")).to_contain_text("cerrada")
                    page.get_by_role("dialog").get_by_role("button", name="Cerrar detalle").click()
                    page.locator('[data-gap="ruiz"]').click()
                    panel = page.locator('#agent-panel')
                    offer = panel.locator('[data-card="r-oferta"]')
                    approve = offer.get_by_role('button', name='Aprobar y ofrecer', exact=True)
                    expect(approve).to_be_enabled()
                    expect(offer.locator('.catalog-stamp')).to_have_count(0)
                    capture(page, prefix, "pending")
                    page.locator('[data-airi-input]:visible').fill('sí')
                    page.locator('[data-airi-input]:visible').press('Enter')
                    expect(panel).to_contain_text('Escribir un asentimiento no aprueba nada')
                    expect(approve).to_be_enabled()
                    statuses, injected = stale_hash_once(session, scripts)
                    approve.click()
                    expect(offer.locator('[role="alert"]')).to_have_text('La propuesta cambió. Revisa la tarjeta actual antes de aprobar.')
                    assert injected == [True] and statuses == [409], f"Fallo hash: {injected}/{statuses}"
                    capture(page, prefix, "409")
                    session.send('Debugger.disable')
                    panel.get_by_role('button', name='Cerrar asistente', exact=True).click()
                    main_offer = page.locator('.airi-agenda-decisions [data-card="r-oferta"]')
                    main_offer.get_by_role('button', name='Aprobar y ofrecer', exact=True).click()
                    expect(main_offer.locator('.catalog-stamp')).to_have_text('Aprobado')
                    expect(page.locator('.airi-agenda-receipt time')).to_have_text(re.compile(r'^\d{2}:\d{2}$'))
                    expect(page.locator('[data-gap="ruiz"]')).to_be_visible()
                    expect(page.locator('.airi-agenda-receipt')).to_contain_text('hueco sigue libre')
                    capture(page, prefix, "aprobado")
                    # The same gap reopens its existing card without a second intent.
                    page.locator('[data-gap="ruiz"]').click()
                    expect(panel.locator('.airi-turn--user')).to_have_count(2)
                    expect(offer.locator('.catalog-stamp')).to_have_text('Aprobado')
                    # A fresh conversation can also prepare and approve entirely from the thread.
                    page.goto(args.base_url + '/agenda', wait_until='networkidle')
                    page.locator('[data-airi-input]:visible').fill('¿Quién toma el hueco de la tarde?')
                    page.locator('[data-airi-input]:visible').press('Enter')
                    expect(approve).to_be_enabled()
                    approve.click()
                    expect(offer.locator('.catalog-stamp')).to_have_text('Aprobado')
                    panel.get_by_role('button', name='Cerrar asistente', exact=True).click()
                    expect(page.locator('.airi-agenda-receipt time')).to_be_visible()
                    capture(page, prefix, "hilo-aprobado")
                    result = {"hash_status": statuses[0], "min_contrast": round(min(ratios), 2), "screenshots": 5, "entry_points": ["gap", "thread"], "approval_points": ["view", "thread"]}
                    if args.mockup_url:
                        reference = context.new_page()
                        reference.goto(args.mockup_url + f'?rol=admin&p=agenda&tema={theme}', wait_until='networkidle')
                        expect(reference.locator('.cal')).to_be_visible()
                        reference.screenshot(path=str(out / f'{prefix}-mockup.png'), full_page=True)
                        reference.close()
                assert not errors, f"Errores {prefix}: {errors}"
                result.update({"width": width, "theme": theme, "console_errors": len(errors)})
                results.append(result)
                print(json.dumps(result), flush=True)
                context.close()
    finally:
        browser.close()
(out / ('real-results.json' if args.real_read else 'results.json')).write_text(json.dumps(results, indent=2))
