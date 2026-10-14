"""D6-DIRECCION: NEXT_PUBLIC_USE_MOCKS=true next dev -p 5236 -H 127.0.0.1.
python3 e2e/airi/direccion.py
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5236')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/D6-DIRECCION')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
results = []


def contrast(fg, bg):
    def luminance(color):
        values = [int(v) / 255 for v in re.findall(r'\d+', color)[:3]]
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(linear, [.2126, .7152, .0722]))
    a, b = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (a + .05) / (b + .05)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width, height in [(1440, 1000), (390, 844)]:
            for theme in ['light', 'dark']:
                context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                page.goto(args.base_url + '/direccion', wait_until='networkidle', timeout=120000)
                expect(page.locator('.direction-decisions li')).to_have_count(3)
                if width < 700:
                    page.get_by_role('combobox', name='Ver como', exact=True).select_option('dueno')
                else:
                    page.get_by_role('button', name='Dueño', exact=True).click()
                expect(page.locator('.shell-role-select')).to_have_value('dueno')
                page.add_style_tag(content='nextjs-portal{display:none!important}')
                root = page.locator('.direction-page')
                expect(root.get_by_role('heading', name='Dirección · todas las sedes')).to_be_visible()
                expect(root.locator('.direction-decisions li')).to_have_count(3)
                figures = root.locator('.direction-figures')
                expect(figures).to_contain_text('S/ 6,240.00')
                expect(figures).to_contain_text('S/ 1,180.00')
                expect(figures).to_contain_text('S/ 9,860.00')
                expect(figures).to_contain_text('41 h')
                table = root.locator('table')
                expect(table.locator('[data-sede="Lince"]')).to_contain_text('78 %')
                expect(table.locator('[data-sede="Miraflores"]')).to_contain_text('68 %')
                borja = table.locator('[data-sede="San Borja"]')
                expect(borja).to_contain_text('Sin capacidad publicada')
                expect(borja).to_contain_text('Sin datos de caja desde 12:40')
                expect(borja).not_to_contain_text('0 %')
                expect(table.locator('.direction-total')).to_contain_text('73 % · 2 sedes')
                expect(root.locator('time')).to_have_attribute('datetime', '2026-10-13T14:00:00-05:00')
                expect(root.locator('.direction-conclusion')).to_contain_text('Miraflores tiene S/ 640.00 por verificar')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow {width}/{theme}'
                colors = root.locator('h1,h2,h3,p,a,button,span,small,strong,th,td').evaluate_all("""es => es.filter(el=>el.checkVisibility() && el.textContent.trim() && !el.querySelector('h1,h2,h3,p,a,button,span,small,strong,th,td')).map(el=>{
                  let parent=el,bg;while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
                  let css=getComputedStyle(el);return {text:el.textContent.slice(0,60),fg:css.color,bg,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
                })""")
                ratios = []
                for item in colors:
                    ratio = contrast(item['fg'], item['bg'])
                    large = item['size'] >= 24 or (item['size'] >= 18.66 and item['weight'] >= 700)
                    assert ratio >= (3 if large else 4.5), f'Contrast {width}/{theme}: {item} {ratio:.2f}'
                    ratios.append(ratio)
                page.screenshot(path=str(out / f'{width}-{theme}-direccion.png'), full_page=True)
                question = root.get_by_role('button', name='Preguntar sobre esta vista')
                question.focus()
                question.press('Enter')
                expect(page.locator('#agent-panel')).to_contain_text('Delegar a Administración Miraflores', timeout=60000)
                expect(root.get_by_role('button', name='Comparar con AIRI')).to_be_enabled(timeout=60000)
                page.screenshot(path=str(out / f'{width}-{theme}-dueno-compara.png'), full_page=True)
                if width < 700:
                    page.locator('#agent-panel').get_by_role('button', name='Cerrar asistente').click()
                root.get_by_role('button', name='Comparar con AIRI').click()
                expect(page.locator('#agent-panel')).to_contain_text('Ocupación reservada hoy', timeout=60000)
                expect(root.get_by_role('button', name='Comparar con AIRI')).to_be_enabled(timeout=60000)
                expect(root.locator('.direction-heading')).to_contain_text('Datos de demostración')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path=str(out / f'{width}-{theme}-cv-sedes.png'), full_page=True)
                assert not errors, f'Console errors: {errors}'
                results.append({'width': width, 'theme': theme, 'console_errors': len(errors), 'contrast_samples': len(ratios), 'min_contrast': round(min(ratios), 2), 'checks': ['figures', 'separate-verification', 'null-occupancy', 'partial', 'dated-cut', 'weighted-occupancy', 'keyboard', 'dueno-compara', 'cv-sedes', 'no-overflow']})
                print(json.dumps(results[-1]), flush=True)
                context.close()
                reference = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                mock = reference.new_page()
                mock.goto(args.mockup_url, wait_until='networkidle')
                mock.evaluate("""theme => {APP.role='dueno';APP.sec='direccion';APP.theme=theme;render();}""", theme)
                expect(mock.locator('html')).to_have_attribute('data-theme', theme)
                mock.screenshot(path=str(out / f'{width}-{theme}-mockup.png'), full_page=True)
                reference.close()
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2))
