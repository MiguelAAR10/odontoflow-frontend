"""D5: python3 e2e/airi/rastro.py --base-url http://127.0.0.1:5235"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5235')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/D5-RASTRO-TURNO')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
def contrast(fg, bg):
    def luminance(color):
        values = [int(v) / 255 for v in re.findall(r"\d+", color)[:3]]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, [.2126, .7152, .0722]))
    a, b = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (a + .05) / (b + .05)


def check_view(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    colors = page.locator('.airi-operations').evaluate("""root => [...root.querySelectorAll('h1,h2,p,small,time,strong,button,span')].filter(e => e.checkVisibility() && !e.disabled && e.textContent.trim() && !e.children.length).map(e=>{
        let parent=e, bg;
        while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
        const css=getComputedStyle(e);return {text:e.textContent,fg:css.color,bg,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
    })""")
    ratios = []
    for color in colors:
        ratio = contrast(color['fg'], color['bg'])
        large = color['size'] >= 24 or (color['size'] >= 18.66 and color['weight'] >= 700)
        assert ratio >= (3 if large else 4.5), f"Contrast: {color} {ratio:.2f}"
        ratios.append(ratio)
    return min(ratios)


results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ['light', 'dark']:
                print(f'App {width}/{theme}', flush=True)
                context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                page.goto(args.base_url + '/agente', wait_until='networkidle')
                expect(page.get_by_role('heading', name='Rastro de acciones')).to_be_visible()
                expect(page.locator('[data-trail-row]')).to_have_count(4)
                page.get_by_label('Filtrar por agente').select_option('hilo')
                expect(page.locator('[data-trail-row]')).to_have_count(1)
                expect(page.locator('[data-trail-row]')).to_contain_text('no reversible')
                page.get_by_label('Filtrar por agente').select_option('espejo')
                expect(page.get_by_text('No hay acciones con este filtro.')).to_be_visible()
                page.get_by_label('Filtrar por agente').select_option('')
                page.add_style_tag(content='nextjs-portal{display:none!important}')
                rastro_contrast = check_view(page)
                page.screenshot(path=str(out / f'{width}-{theme}-rastro.png'), full_page=True)
                if width == 390:
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                page.get_by_role('link', name='Mi turno', exact=True).click()
                expect(page.get_by_role('heading', name='Mi turno', exact=True)).to_be_visible()
                expect(page.get_by_role('heading', name=re.compile('^Ahora'))).to_be_visible()
                expect(page.get_by_text('Carlos Rojas', exact=True)).to_be_visible()
                expect(page.get_by_role('region', name='Requiere atención').locator('.operations-appointment')).to_have_count(4)
                expect(page.locator('[data-turn-case]')).to_have_count(0)
                page.get_by_role('button', name='Confirma las citas de mañana', exact=True).click()
                expect(page.locator('[data-turn-case]')).to_have_count(1)
                # Preparing the run never approves the proposal.
                expect(page.locator('[data-turn-case]')).to_contain_text('Requiere tu aprobación')
                expect(page.locator('[data-turn-case]')).not_to_contain_text('Aprobado por ti')
                page.locator('#agent-panel').get_by_role('button', name='Cerrar asistente', exact=True).click()
                turno_contrast = check_view(page)
                page.screenshot(path=str(out / f'{width}-{theme}-turno.png'), full_page=True)
                case = page.locator('[data-turn-case]')
                expect(case).to_contain_text('No se puede deshacer el envío')
                case.get_by_role('button', name='Aprobar y enviar 9', exact=True).click()
                expect(page.locator('[data-turn-case]')).to_have_count(0)
                if width == 390:
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                page.get_by_role('link', name='Rastro', exact=True).click()
                expect(page.get_by_text('9 enviados', exact=False).first).to_be_visible()
                assert not errors, errors
                results.append({'width': width, 'theme': theme, 'errors': errors, 'min_contrast': min(rastro_contrast, turno_contrast)})
                context.close()
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ['light', 'dark']:
                print(f'Mockup {width}/{theme}', flush=True)
                reference = browser.new_page(viewport={'width': width, 'height': height})
                reference.goto(args.mockup_url + f'?rol=admin&tema={theme}', wait_until='networkidle')
                skip = reference.get_by_role('button', name=re.compile('Omitir'))
                if skip.is_visible():
                    skip.click()
                    expect(skip).to_be_hidden()
                reference.evaluate("APP.sec='actividad';render()")
                expect(reference.get_by_role('heading', name='Rastro de acciones', exact=True)).to_be_visible()
                reference.screenshot(path=str(out / f'{width}-{theme}-mockup-rastro.png'), full_page=True)
                reference.evaluate("APP.sec='turno';render()")
                reference.screenshot(path=str(out / f'{width}-{theme}-mockup-turno.png'), full_page=True)
                reference.close()
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
