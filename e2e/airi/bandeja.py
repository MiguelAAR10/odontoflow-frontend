"""D2-BANDEJA. Run with NEXT_PUBLIC_USE_MOCKS=true next dev on :5232.
python3 e2e/airi/bandeja.py --base-url http://127.0.0.1:5232
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5232')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/D2-BANDEJA')
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
                page.goto(args.base_url + '/aprobaciones', wait_until='networkidle', timeout=120000)
                page.add_style_tag(content='nextjs-portal{display:none!important}')
                inbox = page.locator('.bandeja-inbox')
                cases = inbox.locator('.bandeja-cases > li')
                detail = page.locator('#bandeja-selected')
                expect(cases).to_have_count(5)
                expect(detail).to_contain_text('Daniela Soto')
                screenshots = []
                samples = []

                def capture(state):
                    page.wait_for_function("""() => [...document.querySelectorAll('.catalog-card [data-layer]')].filter(el=>el.checkVisibility()).every(el=>Number(getComputedStyle(el).opacity)>=.99)""")
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow {width}/{theme}/{state}'
                    colors = inbox.locator('h2,h3,p,button,span,label').evaluate_all("""elements => elements.filter(el=>el.checkVisibility() && !el.disabled && el.textContent.trim() && !el.querySelector('h2,h3,p,button,span,label')).map(el=>{
                        let parent=el, background;
                        while(parent){background=getComputedStyle(parent).backgroundColor;if(background!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
                        const css=getComputedStyle(el);return {text:el.textContent.slice(0,60),foreground:css.color,background,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
                    })""")
                    for item in colors:
                        ratio = contrast(item['foreground'], item['background'])
                        large = item['size'] >= 24 or (item['size'] >= 18.66 and item['weight'] >= 700)
                        assert ratio >= (3 if large else 4.5), f'Contrast {width}/{theme}/{state}: {item} {ratio:.2f}'
                        samples.append(ratio)
                    page.screenshot(path=str(out / f'{width}-{theme}-{state}.png'), full_page=True)
                    screenshots.append(state)

                capture('lista-detalle')
                inbox.get_by_role('button', name='Mías').click()
                expect(cases).to_have_count(5)
                inbox.get_by_role('button', name='Todas').click()
                for proposal in ['Reasignar 6 citas', 'Lince: diferencia de caja', '3 descuentos', 'Confirmar ingreso Yape', 'Responder a Daniela']:
                    inbox.locator('.bandeja-cases').get_by_role('button', name=re.compile(proposal)).click()
                    expect(detail.locator('.catalog-why')).to_be_visible()
                    expect(detail.locator('.catalog-sources')).to_be_visible()
                    expect(detail.locator('.catalog-scope')).to_be_visible()
                    capture('detalle-' + str(len(screenshots)))
                inbox.locator('.bandeja-cases').get_by_role('button', name=re.compile('Lince: diferencia')).click()
                detail.get_by_role('button', name='Editar borrador').click()
                editor = detail.get_by_role('textbox', name='Texto del borrador')
                expect(editor).to_be_focused()
                editor.fill('Revisar movimientos Yape con Rosa antes del cierre')
                capture('editar')
                detail.get_by_role('button', name='Cancelar', exact=True).click()
                expect(detail.get_by_role('button', name='Editar borrador')).to_be_focused()
                expect(detail).to_contain_text('Versión 1')
                detail.get_by_role('button', name='Editar borrador').click()
                editor.fill(' ')
                expect(detail.get_by_role('button', name='Guardar nueva versión')).to_be_disabled()
                editor.fill('Revisar movimientos Yape con Rosa antes del cierre')
                detail.get_by_role('button', name='Guardar nueva versión').click()
                expect(detail).to_contain_text('Versión 2')
                expect(detail).to_contain_text('Revisar movimientos Yape con Rosa antes del cierre')
                expect(detail).to_contain_text('Caja Lince · 13:30')
                expect(detail).to_contain_text('S/ 180.00')
                capture('nueva-version')
                detail.get_by_role('button', name='Delegar a Caja', exact=True).click()
                expect(detail.locator('.catalog-stamp')).to_have_text('Aprobado')
                expect(detail.get_by_role('button', name='Delegar a Caja', exact=True)).to_have_count(0)
                capture('aprobada')
                inbox.get_by_role('button', name='Mías').click()
                expect(cases).to_have_count(4)
                inbox.get_by_role('button', name='Todas').click()
                inbox.locator('.bandeja-cases').get_by_role('button', name=re.compile('Responder a Daniela')).click()
                detail.get_by_role('button', name='Descartar', exact=True).click()
                expect(detail).to_contain_text('Descartado · queda en el rastro.')
                capture('descartada')
                inbox.get_by_role('button', name='Mías').click()
                expect(cases).to_have_count(3)
                # Native keyboard operation of list selections.
                first = inbox.locator('.bandeja-cases button').first
                first.focus()
                first.press('Enter')
                expect(first).to_have_attribute('aria-current', 'true')
                assert not errors, f'Console errors {width}/{theme}: {errors}'
                results.append({'width': width, 'theme': theme, 'console_errors': len(errors), 'screenshots': len(screenshots), 'contrast_samples': len(samples), 'min_contrast': round(min(samples), 2), 'checks': ['five-fixtures', 'evidence', 'mine-all', 'edit-cancel', 'empty-edit', 'new-version', 'approve', 'decline', 'keyboard', 'no-overflow']})
                print(json.dumps(results[-1]), flush=True)
                context.close()
                # Official reference, captured with the same viewport/theme.
                reference = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                mock = reference.new_page()
                mock.goto(args.mockup_url, wait_until='networkidle')
                mock.evaluate("""theme => { APP.role='admin';APP.sec='bandeja';document.documentElement.dataset.theme=theme;render(); }""", theme)
                mock.screenshot(path=str(out / f'{width}-{theme}-mockup.png'), full_page=True)
                reference.close()
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2))
