"""D7-DOCTOR: python3 e2e/airi/doctor.py --base-url http://127.0.0.1:5237"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5237')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/D7-DOCTOR')
parser.add_argument('--real-mode', action='store_true', help='Verify a NEXT_PUBLIC_USE_MOCKS=false server with controlled session/read responses')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)


def contrast(fg, bg):
    def luminance(color):
        values = [int(v) / 255 for v in re.findall(r'\d+', color)[:3]]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, [.2126, .7152, .0722]))
    a, b = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (a + .05) / (b + .05)


def role(page, width, value):
    # networkidle and SSR visibility do not guarantee React event handlers.
    # Topbar writes data-theme in its mount effect, after hydration commits.
    expect(page.locator('html')).to_have_attribute('data-theme', re.compile(r'^(light|dark)$'))
    buttons = page.locator('.shell-roles')
    chosen = buttons.get_by_role('button', name={
        'doctor': 'Doctor', 'admin': 'Administrativo', 'dueno': 'Dueño'
    }[value], exact=True, include_hidden=True)
    if width == 390:
        page.locator('.shell-role-select').select_option(value)
    else:
        chosen.click()
    # A native select's value alone can change even before React handles it.
    expect(chosen).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.shell-role-select')).to_have_value(value)
    expect(page.locator('.sidebar-heading > span')).to_have_text({
        'doctor': 'Consulta', 'admin': 'Operación', 'dueno': 'Dirección'
    }[value])


def save_failure(page, width, theme, errors, failure):
    """Keep evidence before closing the browser; never retry a failed journey."""
    stem = out / f'{width}-{theme}-failure'
    evidence = {'width': width, 'theme': theme, 'failure': str(failure), 'errors': errors}
    for name, action in [
        ('state', lambda: page.evaluate("""() => ({
            url: location.href, theme: document.documentElement.dataset.theme,
            role: document.querySelector('.shell-role-select')?.value,
            roles: [...document.querySelectorAll('.shell-roles button')].map(e => ({
                label: e.textContent, pressed: e.getAttribute('aria-pressed')})),
            sede: document.querySelector('.shell-location-select')?.value,
            view: document.querySelector('.airi-doctor-view')?.innerText,
            appointments: document.querySelectorAll('[data-airi-doctor-appointment]').length
        })""")),
        ('dom', lambda: stem.with_suffix('.html').write_text(page.content())),
        ('screenshot', lambda: page.screenshot(path=str(stem.with_suffix('.png')), full_page=True)),
    ]:
        try:
            result = action()
            if name == 'state':
                evidence[name] = result
        except Exception as capture_error:
            evidence[name + '_error'] = str(capture_error)
    stem.with_suffix('.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False))
    (out / 'results.json').write_text(json.dumps(results, indent=2))
    print(f'Failure evidence: {stem}', flush=True)


results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page, width, theme, errors = None, 0, 'unknown', []
    try:
        if args.real_mode:
            for width, height in [(1440, 1000), (390, 844)]:
                for theme in ['light', 'dark']:
                    print(f'Real source mode {width}/{theme}', flush=True)
                    context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme)
                    page = context.new_page()
                    errors, requests = [], []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                    # Transport boundary only: no clinical fixtures or live backend writes.
                    context.route('**/api/session', lambda route: route.fulfill(json={
                        'current': 'clinical-read-test', 'personas': [
                            {'key': 'clinical-read-test', 'display_name': 'Profesional de prueba', 'role': 'doctor'}]}))
                    def backend(route):
                        requests.append({'method': route.request.method, 'url': route.request.url})
                        assert route.request.method == 'GET', requests
                        body = {'principal': {'type': 'human', 'display_name': 'Profesional de prueba'},
                                'organization': {'name': 'Clínica de prueba'}, 'roles': [], 'permissions': []} if route.request.url.endswith('/me') else []
                        route.fulfill(json=body)
                    context.route('**/api/backend/**', backend)
                    for path, expected in [('/jornada', 'Tu jornada clínica todavía no está disponible'),
                                           ('/atencion', 'La ficha clínica y la firma todavía no están disponibles')]:
                        page.goto(args.base_url + path, wait_until='networkidle', timeout=120000)
                        role(page, width, 'doctor')
                        expect(page.get_by_text(expected, exact=False)).to_be_visible()
                        expect(page.locator('[data-brief-block]')).to_have_count(0)
                        expect(page.locator('[data-airi-doctor-appointment]')).to_have_count(0)
                        expect(page.locator('.airi-doctor-view')).not_to_contain_text('Ana Torres')
                        expect(page.locator('.airi-doctor-view textarea')).to_have_count(0)
                        if path == '/atencion':
                            expect(page.get_by_role('button', name='Revisar y firmar', exact=True)).to_be_disabled()
                        page.add_style_tag(content='nextjs-portal{display:none!important}')
                        page.screenshot(path=str(out / f'{width}-{theme}-real{path.replace("/", "-")}.png'), full_page=True)
                    assert not errors, errors
                    assert not any('/agent/' in request['url'] for request in requests), requests
                    results.append({'width': width, 'theme': theme, 'errors': errors, 'backend_reads': len(requests), 'mutations': 0, 'mock_clinical_data': 0})
                    context.close()
            (out / 'real-results.json').write_text(json.dumps(results, indent=2))
            print(json.dumps(results, indent=2))
            raise SystemExit(0)
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ['light', 'dark']:
                print(f'App {width}/{theme}', flush=True)
                context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                page.goto(args.base_url + '/jornada', wait_until='networkidle', timeout=120000)

                ratios = []
                def capture(state):
                    page.add_style_tag(content='nextjs-portal{display:none!important}')
                    page.evaluate('window.scrollTo(0, 0)')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), state
                    assert page.locator('.airi-doctor-view').evaluate('e=>e.scrollWidth<=e.clientWidth+1'), state
                    colors = page.locator('.airi-doctor-view').evaluate("""root => [...root.querySelectorAll('h1,h2,h3,p,small,time,strong,button,a,span,label')].filter(e=>e.checkVisibility() && !e.disabled && e.textContent.trim() && !e.children.length).map(e=>{
                        let parent=e,bg;
                        while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
                        const css=getComputedStyle(e);return {text:e.textContent,fg:css.color,bg,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
                    })""")
                    for color in colors:
                        ratio = contrast(color['fg'], color['bg'])
                        large = color['size'] >= 24 or (color['size'] >= 18.66 and color['weight'] >= 700)
                        assert ratio >= (3 if large else 4.5), f'Contrast {state}: {color} {ratio:.2f}'
                        ratios.append(ratio)
                    page.screenshot(path=str(out / f'{width}-{theme}-{state}.png'), full_page=True)

                expect(page.get_by_text('Mi jornada está disponible para el doctor.', exact=False)).to_be_visible()
                role(page, width, 'doctor')
                expect(page.locator('[data-airi-doctor-appointment]')).to_have_count(6)
                expect(page.get_by_role('region', name='Siguiente paciente')).to_contain_text('Ana Torres')
                expect(page.locator('[data-airi-doctor-appointment]').filter(has_text='Carlos Rojas')).to_contain_text('sin cerrar')
                expect(page.locator('[data-airi-doctor-appointment]').filter(has_text='Sofía Paredes')).to_have_count(0)
                capture('jornada')
                page.get_by_role('link', name='Abrir atención', exact=True).click()
                expect(page.get_by_role('heading', name='Ana Torres', exact=True)).to_be_visible()
                expect(page.locator('[data-brief-block]')).to_have_count(6)
                note = page.get_by_role('textbox', name='Evolución de Ana Torres', exact=True)
                review = page.get_by_role('button', name='Revisar y firmar', exact=True)
                expect(review).to_be_disabled()
                capture('atencion-inicial')
                page.get_by_role('button', name='Preparar brief', exact=True).click()
                expect(page.get_by_text('Automático · solo lee', exact=True)).to_be_visible()
                expect(page.locator('.airi-doctor-source', has_text='Agenda')).to_have_count(2)
                expect(page.locator('[data-brief-block] .airi-doctor-source')).to_have_count(6)
                expect(page.locator('[data-brief-block]').nth(2)).to_contain_text('No consta')
                expect(page.locator('[data-brief-block]').nth(2)).not_to_contain_text('Penicilina')
                expect(page.get_by_role('button', name='Ayúdame con la evolución', exact=True)).to_be_enabled()
                capture('brief')
                page.get_by_role('button', name='Ayúdame con la evolución', exact=True).click()
                expect(note).to_have_value(re.compile(r'Conductometría: \[confirmar longitudes\]'))
                expect(page.locator('#airi-doctor-note-state')).to_contain_text('3 campos por confirmar')
                expect(review).to_be_disabled()
                # A chat reply does not sign the evolution.
                page.locator('.shell-assistant').click()
                entry = page.locator('[data-airi-input]:visible')
                entry.fill('sí')
                entry.press('Enter')
                expect(page.locator('#agent-panel')).to_contain_text('Escribir un asentimiento no aprueba nada')
                page.locator('#agent-panel').get_by_role('button', name='Cerrar asistente', exact=True).click()
                expect(note).to_be_editable()
                expect(page.locator('.airi-doctor-stamp')).to_have_count(0)
                capture('borrador')
                note.fill('Endodoncia 3.6 · sesión 2.\nConductometría y obturación revisadas por la doctora.\nIndicaciones confirmadas con el paciente.')
                expect(review).to_be_enabled()
                # Navigation preserves edits; Carlos never receives Ana's output.
                page.get_by_role('link', name='Volver a Mi jornada', exact=True).click()
                page.get_by_role('link', name='Abrir atención de Carlos Rojas', exact=True).click()
                expect(page.get_by_role('textbox', name='Evolución de Carlos Rojas', exact=True)).to_have_value('')
                expect(page.get_by_role('button', name='Ayúdame con la evolución', exact=True)).to_have_count(0)
                page.get_by_role('link', name='Volver a Mi jornada', exact=True).click()
                page.get_by_role('link', name='Abrir atención', exact=True).click()
                expect(note).to_have_value(re.compile('Indicaciones confirmadas'))
                review.click()
                confirmation = page.get_by_role('group', name='Confirmar firma', exact=True)
                expect(confirmation).to_contain_text('Dra. Valeria Ruiz para Ana Torres')
                expect(note).not_to_be_editable()
                expect(confirmation.get_by_role('button', name='Firmar', exact=True)).to_be_focused()
                capture('revision')
                confirmation.get_by_role('button', name='Volver a editar', exact=True).click()
                expect(note).to_be_editable()
                note.fill('Texto editado [pendiente]')
                expect(review).to_be_disabled()
                note.fill('Nota revisada por la doctora. Conductometría, obturación e indicaciones confirmadas.')
                review.click()
                confirmation.get_by_role('button', name='Firmar', exact=True).click()
                expect(page.get_by_text('Firmada en simulación', exact=True)).to_be_visible()
                expect(note).not_to_be_editable()
                expect(page.locator('.airi-doctor-stamp')).to_contain_text('Dra. Valeria Ruiz')
                expect(page.locator('.airi-doctor-odo')).to_contain_text('permanece «llegó»')
                capture('firmada')
                role(page, width, 'admin')
                expect(page.get_by_role('textbox', name='Evolución de Ana Torres')).to_have_count(0)
                expect(page.get_by_role('button', name='Firmar', exact=True)).to_have_count(0)
                role(page, width, 'doctor')
                expect(page.get_by_text('Firmada en simulación', exact=True)).to_be_visible()
                page.get_by_role('link', name='Volver a Mi jornada', exact=True).click()
                expect(page.locator('[data-airi-doctor-appointment]').filter(has_text='Ana Torres')).to_contain_text('llegó')
                page.get_by_label('Sede', exact=True).select_option('2')
                expect(page.locator('[data-airi-doctor-appointment]')).to_have_count(0)
                page.get_by_label('Sede', exact=True).select_option('1')
                expect(page.locator('[data-airi-doctor-appointment]')).to_have_count(6)
                page.get_by_role('link', name='Abrir atención', exact=True).click()
                expect(page.get_by_text('Firmada en simulación', exact=True)).to_be_visible()
                # Reject forged/foreign visit selection without showing another patient's note.
                page.goto(args.base_url + '/atencion?cita=c1', wait_until='networkidle')
                role(page, width, 'doctor')
                expect(page.get_by_text('No hay una cita disponible para esta atención', exact=False)).to_be_visible()
                expect(page.get_by_role('textbox', name='Evolución', exact=False)).to_have_count(0)
                assert not errors, errors
                results.append({'width': width, 'theme': theme, 'errors': errors, 'min_contrast': round(min(ratios), 2), 'screenshots': 6})
                context.close()
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ['light', 'dark']:
                print(f'Mockup {width}/{theme}', flush=True)
                reference = browser.new_page(viewport={'width': width, 'height': height}, color_scheme=theme)
                page, errors = reference, []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                reference.goto(args.mockup_url + f'?rol=doctor&tema={theme}', wait_until='networkidle')
                skip = reference.get_by_role('button', name=re.compile('Omitir'))
                if skip.is_visible():
                    skip.click()
                    expect(skip).to_be_hidden()
                reference.evaluate("APP.sec='jornada';render()")
                reference.screenshot(path=str(out / f'{width}-{theme}-mockup-jornada.png'), full_page=True)
                reference.evaluate("APP.sec='ficha';APP.briefReady=true;render()")
                reference.screenshot(path=str(out / f'{width}-{theme}-mockup-atencion.png'), full_page=True)
                reference.close()
    except Exception as failure:
        if page is not None:
            save_failure(page, width, theme, errors, failure)
        raise
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
