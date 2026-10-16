"""D3-CAJA: python3 e2e/airi/caja.py --base-url http://127.0.0.1:5233.
Start Next with NEXT_PUBLIC_USE_MOCKS=true; captures include the official mockup.
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5233')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/D3-CAJA')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
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
            for theme in ['light', 'dark']:
                context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                context.add_init_script("sessionStorage.setItem('airi.intro.v1','1')")
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                page.goto(args.base_url + '/caja', wait_until='networkidle', timeout=120000)
                page.add_style_tag(content='nextjs-portal{display:none!important}')
                preview = page.get_by_role('region', name='Corte simulado de caja')
                verified = preview.locator('[data-cash-verified]')
                pending = preview.locator('[data-cash-pending]')
                expect(verified).to_have_text('S/ 3,120.00')
                expect(pending).to_have_text('S/ 420.00')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page overflow'
                font = verified.evaluate('(el) => ({family:getComputedStyle(el).fontFamily, numbers:getComputedStyle(el).fontVariantNumeric})')
                assert 'Outfit' in font['family'] or 'outfit' in font['family'], font
                assert 'tabular-nums' in font['numbers'], font
                colors = preview.locator('p,span,strong,h2,h3,button').evaluate_all("""nodes => nodes.filter(el => el.checkVisibility() && !el.disabled && el.textContent.trim() && !el.querySelector('p,span,strong,h2,h3,button')).map(el => {
                    let parent=el, background;
                    while(parent){background=getComputedStyle(parent).backgroundColor;if(background!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
                    const css=getComputedStyle(el);
                    return {text:el.textContent,fg:css.color,bg:background,size:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)};
                })""")
                for color in colors:
                    large = color['size'] >= 24 or (color['size'] >= 18.66 and color['weight'] >= 700)
                    assert contrast(color['fg'], color['bg']) >= (3 if large else 4.5), color
                page.screenshot(path=str(out / f'{width}-{theme}-pendiente.png'), full_page=True)
                # Chat assent must never approve a card.
                entry = page.locator('[data-airi-input]:visible')
                entry.fill('sí')
                entry.press('Enter')
                expect(page.locator('#agent-panel')).to_contain_text('Escribir un asentimiento no aprueba nada')
                expect(verified).to_have_text('S/ 3,120.00')
                page.locator('#agent-panel').get_by_role('button', name='Cerrar asistente', exact=True).click()
                approve = preview.get_by_role('button', name='Confirmar ingreso', exact=True)
                approve.focus()
                page.keyboard.press('Enter')
                expect(verified).to_have_text('S/ 3,240.00')
                expect(pending).to_have_text('S/ 300.00')
                expect(approve).to_have_count(0)
                expect(preview).to_contain_text('Abono verificado')
                preview.get_by_text('Diferencia por explicar', exact=True).click()
                preview.get_by_role('button', name='Delegar a Caja', exact=True).click()
                expect(preview).to_contain_text('Delegado a Rosa')
                expect(verified).to_have_text('S/ 3,240.00')
                page.screenshot(path=str(out / f'{width}-{theme}-aprobado.png'), full_page=True)
                # Client navigation must retain both decisions without a reversal.
                if width < 768:
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                page.get_by_role('link', name='Inicio', exact=True).click()
                expect(page).to_have_url(re.compile(r'/home$'))
                if width < 768:
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                page.get_by_role('link', name='Caja', exact=True).click()
                expect(page).to_have_url(re.compile(r'/caja$'))
                expect(verified).to_have_text('S/ 3,240.00')
                expect(pending).to_have_text('S/ 300.00')
                expect(preview.get_by_role('button', name='Confirmar ingreso', exact=True)).to_have_count(0)
                expect(preview.get_by_role('button', name='Delegar a Caja', exact=True)).to_have_count(0)
                preview.get_by_text('Diferencia por explicar', exact=True).click()
                expect(preview).to_contain_text('Delegado a Rosa')
                page.screenshot(path=str(out / f'{width}-{theme}-navegacion.png'), full_page=True)
                # The existing operational view still works.
                page.get_by_text('Registros de caja', exact=True).click()
                page.get_by_role('button', name='Conciliación', exact=True).click()
                expect(page.locator('#cash-panel')).to_contain_text('pagos')
                expect(page.locator('.cash-page').get_by_role('alert')).to_have_count(0)
                assert not errors, errors
                results.append({'width': width, 'theme': theme, 'errors': errors, 'navigation_retained': True, 'font': font, 'contrast_min': min(contrast(c['fg'],c['bg']) for c in colors)})
                context.close()
                # Compare the same Lince cut and administrative role as the product.
                reference = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                mockup = reference.new_page()
                mockup.goto(args.mockup_url + f'?rol=admin&tema={theme}&intro=0', wait_until='networkidle')
                mockup.evaluate("APP.sec='caja'; render()")
                mockup.screenshot(path=str(out / f'{width}-{theme}-mockup.png'), full_page=True)
                reference.close()
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
print(json.dumps(results, indent=2, ensure_ascii=False))
