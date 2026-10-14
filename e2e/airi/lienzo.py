"""E1-LIENZO: NEXT_PUBLIC_USE_MOCKS=true next dev -p 5241 -H 127.0.0.1.
Run: python3 e2e/airi/lienzo.py --base-url http://127.0.0.1:5241
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:5241')
parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
parser.add_argument('--output', default='.audit/E1-LIENZO')
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
                page.goto(args.base_url + '/lienzo', wait_until='networkidle', timeout=120000)
                editor = page.locator('[data-canvas-ready]')
                expect(editor).to_have_attribute('data-canvas-ready', 'true')
                expect(editor).to_have_attribute('data-theme', theme)
                expect(page.locator('.excalidraw button:visible')).to_have_count(0)
                assert page.locator('.excalidraw__canvas').evaluate_all("els=>els.every(el=>getComputedStyle(el).filter==='none')"), 'Canvas changed the theme or agent colors'
                expect(page.locator('#agent-panel, .airi-interaction')).to_have_count(0)
                expect(page.locator('[data-airi-input]')).to_have_count(0)
                expect(page.get_by_role('heading', name='Lienzo libre', exact=True)).to_be_visible()
                page.add_style_tag(content='nextjs-portal{display:none!important}')
                page.screenshot(path=str(out / f'{width}-{theme}-vacio.png'))
                if width == 390:
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                    expect(page.locator('#app-sidebar')).to_be_visible()
                    page.locator('#app-sidebar').get_by_role('button', name='Cerrar navegación', exact=True).click()
                    expect(page.locator('#app-sidebar')).to_be_hidden()

                # Drawing works before the agent arrives and survives its scene update.
                page.get_by_role('button', name='Dibujar', exact=True).click()
                bounds = page.locator('.canvas-stage').bounding_box()
                x, y = bounds['x'] + bounds['width'] - 85, bounds['y'] + bounds['height'] - 90
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x + 35, y + 20, steps=8)
                page.mouse.up()
                expect(editor).to_have_attribute('data-scene-elements', '1')
                page.get_by_role('button', name='Seleccionar', exact=True).click()
                page.get_by_role('button', name='Relacionar huecos', exact=True).click()
                expect(page.locator('[data-canvas-card]')).to_have_count(3)
                expect(editor).to_have_attribute('data-agent-arrows', '1')
                expect(editor).to_have_attribute('data-scene-elements', '5')
                expect(page.locator('.canvas-progress')).to_contain_text('Revisa la propuesta')
                offer = page.locator('[data-canvas-card="cv-oferta"] [data-card="cv-oferta"]')
                expect(offer.get_by_role('button', name='Aprobar y ofrecer', exact=True)).to_be_enabled()
                expect(offer.locator('.catalog-stamp')).to_have_count(0)
                # Wait for card measurements and the fit operation to settle.
                page.wait_for_timeout(400)
                page.screenshot(path=str(out / f'{width}-{theme}-tarjetas.png'))

                # HTML cards follow the scene camera, and can move by keyboard and pointer.
                card = page.locator('[data-canvas-card="cv-agenda"]')
                handle = card.get_by_role('button', name=re.compile('Mover tarjeta:'))
                before = card.get_attribute('style')
                handle.focus()
                page.keyboard.press('ArrowRight')
                expect(card).not_to_have_attribute('style', before)
                position = handle.bounding_box()
                before = card.get_attribute('style')
                page.mouse.move(position['x'] + position['width'] / 2, position['y'] + position['height'] / 2)
                page.mouse.down()
                page.mouse.move(position['x'] + position['width'] / 2 + 25, position['y'] + position['height'] / 2 + 20, steps=6)
                page.mouse.up()
                expect(card).not_to_have_attribute('style', before)
                before = card.get_attribute('style')
                page.get_by_role('button', name='Mover lienzo', exact=True).click()
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x - 35, y - 25, steps=6)
                page.mouse.up()
                expect(card).not_to_have_attribute('style', before)
                before = card.get_attribute('style')
                page.keyboard.down('Control')
                page.mouse.wheel(0, -120)
                page.keyboard.up('Control')
                expect(card).not_to_have_attribute('style', before)
                page.get_by_role('button', name='Encuadrar tarjetas', exact=True).click()

                # Both shortcut forms open the same conversation with focus and Escape.
                page.keyboard.press('Meta+k')
                dialog = page.get_by_role('dialog', name='Hilo de AIRI', exact=True)
                expect(dialog).to_be_visible()
                expect(dialog.get_by_label('Tu intención', exact=True)).to_be_focused()
                expect(dialog.locator('.airi-turn--user')).to_have_count(1)
                expect(dialog).not_to_contain_text('No puedo mostrar este contenido')
                dialog.get_by_label('Tu intención', exact=True).fill('sí')
                dialog.get_by_label('Tu intención', exact=True).press('Enter')
                expect(dialog).to_contain_text('Escribir un asentimiento no aprueba nada')
                expect(dialog.locator('[data-card="cv-oferta"] .catalog-stamp')).to_have_count(0)
                page.screenshot(path=str(out / f'{width}-{theme}-hilo.png'))
                page.keyboard.press('Escape')
                expect(dialog).to_have_count(0)
                page.keyboard.press('Control+k')
                expect(dialog).to_be_visible()
                page.keyboard.press('Control+k')
                expect(dialog).to_have_count(0)

                # List is the readable, keyboard-accessible alternative at every viewport.
                page.get_by_role('button', name='Ver lista', exact=True).click()
                cards = page.locator('.canvas-list [data-card]')
                expect(cards).to_have_count(3)
                list_offer = page.locator('.canvas-list [data-card="cv-oferta"]')
                expect(list_offer.get_by_role('button', name='Aprobar y ofrecer', exact=True)).to_be_enabled()
                samples = cards.evaluate_all("""roots => roots.flatMap(root=>[...root.querySelectorAll('h3,p,button,span')].filter(el=>el.checkVisibility()&&!el.disabled&&el.textContent.trim()&&!el.querySelector('p,h3,button,span')).map(el=>{
                  let node=el,bg;while(node){bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;node=node.parentElement;}
                  return {text:el.textContent.slice(0,60),fg:getComputedStyle(el).color,bg};
                }))""")
                ratios = [contrast(sample['fg'], sample['bg']) for sample in samples]
                assert min(ratios) >= 4.5, [(sample, ratio) for sample, ratio in zip(samples, ratios) if ratio < 4.5]
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Viewport overflow'
                page.screenshot(path=str(out / f'{width}-{theme}-lista.png'))
                list_offer.get_by_role('button', name='Aprobar y ofrecer', exact=True).click()
                expect(list_offer.locator('.catalog-stamp')).to_have_text('Aprobado')
                page.get_by_role('button', name='Ver lienzo', exact=True).click()
                expect(offer.locator('.catalog-stamp')).to_have_text('Aprobado')
                expect(editor).to_have_attribute('data-scene-elements', '5')
                page.screenshot(path=str(out / f'{width}-{theme}-aprobado.png'))

                # Explicit data-theme updates without remounting or losing the scene.
                opposite = 'light' if theme == 'dark' else 'dark'
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', opposite)
                expect(editor).to_have_attribute('data-theme', opposite)
                expect(editor).to_have_attribute('data-agent-arrows', '1')
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                expect(editor).to_have_attribute('data-theme', theme)

                # Decisions and thread survive client navigation back to Inicio and Lienzo.
                page.get_by_role('link', name='Volver a Inicio', exact=True).click()
                expect(page).to_have_url(args.base_url + '/home')
                expect(page.locator('[data-canvas-card]')).to_have_count(0)
                if width == 390:
                    panel = page.locator('#agent-panel')
                    if panel.is_visible():
                        panel.get_by_role('button', name='Cerrar asistente', exact=True).click()
                    page.get_by_role('button', name='Abrir navegación', exact=True).click()
                page.locator('.sidebar-item[href="/lienzo"]').click()
                expect(page).to_have_url(args.base_url + '/lienzo')
                expect(page.locator('[data-canvas-card="cv-oferta"] .catalog-stamp')).to_have_text('Aprobado')
                assert not errors, errors
                results.append({'width': width, 'theme': theme, 'cards': 3, 'agent_arrows': 1, 'errors': 0,
                                'contrast_samples': len(ratios), 'contrast_min': round(min(ratios), 2), 'screenshots': 5,
                                'checks': ['drawing_retained', 'drag', 'keyboard_move', 'pan', 'zoom', 'fit', 'meta_k', 'ctrl_k', 'chat_no_approval', 'human_approval', 'theme_update', 'navigation_retained']})
                context.close()

                reference = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion='reduce')
                mockup = reference.new_page()
                mockup.goto(args.mockup_url, wait_until='networkidle', timeout=60000)
                mockup.evaluate("""theme => { document.documentElement.dataset.theme=theme; APP.theme=theme; setRole('admin'); APP.sec='canvas'; render(); }""", theme)
                mockup.screenshot(path=str(out / f'{width}-{theme}-mockup.png'))
                mockup.evaluate("() => runScenario('cv-huecos')")
                expect(mockup.locator('.tl-airi [data-card]')).to_have_count(3)
                mockup.screenshot(path=str(out / f'{width}-{theme}-mockup-tarjetas.png'))
                reference.close()
                print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    finally:
        browser.close()
(out / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
