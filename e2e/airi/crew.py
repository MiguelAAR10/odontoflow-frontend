"""C2-CREW acceptance: shell smoke + production components with real sim/store.
Run: NEXT_PUBLIC_USE_MOCKS=true next dev -p 5222; python3 e2e/airi/crew.py.
The temporary browser harness does not change app routes owned by C1/B2.
"""
import os
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("AIRI_BASE_URL", "http://127.0.0.1:5222")
AUDIT = Path(".audit/C2-CREW")


def smoke(page):
    page.goto(f"{BASE}/home")
    page.wait_for_load_state("networkidle")
    crew = page.locator("#crew")
    expect(crew.locator("button[data-agent]")).to_have_count(7)
    # Pausing animation must preserve authored SVG geometry (especially eyes).
    assert crew.locator('[data-part="eye-left"]').evaluate_all("els => els.every(el => getComputedStyle(el).transform !== 'none')")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'Shell overflows'
    location = page.get_by_role('combobox', name='Sede').bounding_box()
    for face in crew.locator('button[data-agent]').all():
        rect = face.bounding_box()
        assert rect and 0 <= rect['x'] and rect['x'] + rect['width'] <= page.viewport_size['width']
        if page.viewport_size['width'] == 390:
            assert rect['x'] + rect['width'] <= location['x'], 'Agent overlaps Sede'
    button = crew.get_by_role("button", name="Cepillo", exact=False)
    button.click()
    dialog = page.get_by_role("dialog", name="Cepillo", exact=True)
    expect(dialog).to_be_visible()
    assert dialog.evaluate("el => el.contains(document.activeElement)")
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(button).to_be_focused()


HARNESS = r"""
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentCrew } from './src/crew/AgentCrew';
import { createAgentStore, useAgentStore } from './src/agui/store';
import { SimulatedSource } from './src/agui/sim/source';
import { Card } from './src/catalog/Card';
const source = new SimulatedSource({scenarioId:'admin-hueco'});
const store = createAgentStore({source, approveCard:source.approveCard,
  toApiError:e=>({code:e.code||'TEST',message:e.message,httpStatus:e.httpStatus||0})});
window.testStore = store;
function App() {
 const state=useAgentStore(s=>s,store);
 return <><header style={{height:60,display:'flex',justifyContent:'center',position:'sticky',top:0,zIndex:60,background:'var(--surface)'}}>
 <div id="crew"><AgentCrew store={store}/></div></header>
 <main style={{padding:24,maxWidth:900,margin:'auto'}}><button id="run" onClick={()=>store.send('Llena el hueco de la tarde')}>Reproducir admin-hueco</button>
 <button id="clear" onClick={()=>store.clear()}>Limpiar</button>
 {Object.values(state.cards).map(entry=><Card key={entry.card.id} {...entry} onApprove={()=>store.approve(entry.card.id)}/>)}</main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
"""


def build_harness():
    script = """
import {build} from 'esbuild';
const result = await build({stdin:{contents:process.env.CREW_HARNESS,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,write:false,outfile:'.audit/C2-CREW/harness.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}});
for (const file of result.outputFiles) if (!file.path.endsWith('.css')) process.stdout.write(file.text);
"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], env={**os.environ, "CREW_HARNESS": HARNESS}, text=True, capture_output=True, check=True)
    return result.stdout


def load_harness(page, bundle):
    tokens = Path("src/tokens.css").read_text()
    characters = Path("src/crew/crew.css").read_text()
    fonts = """
@font-face { font-family:Readex; src:url('/fonts/readexpro.woff2'); font-weight:100 900; }
@font-face { font-family:Outfit; src:url('/fonts/outfit.woff2'); font-weight:100 900; }
:root { --font-readex:Readex; --font-outfit:Outfit; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--font-text); }
"""
    html = '<style>' + tokens + characters + Path("src/catalog/catalog.css").read_text() + fonts + '</style><div id="root"></div>'
    page.route("**/__crew_harness", lambda route: route.fulfill(status=200, content_type="text/html", body=html))
    page.goto(f"{BASE}/__crew_harness")
    page.add_script_tag(content=bundle)
    expect(page.locator("#crew button[data-agent]")).to_have_count(7)


def animated_agents(page):
    return page.evaluate("""() => {
      const previous = window.crewTransforms || {};
      const next = {};
      const animations = document.getAnimations();
      const moving = [...document.querySelectorAll('#crew button[data-agent]')].filter(button => {
        const transform = getComputedStyle(button.querySelector('.airi-crew-face')).transform;
        next[button.dataset.agent] = transform;
        return (previous[button.dataset.agent] !== undefined && previous[button.dataset.agent] !== transform)
          || animations.some(animation => animation.playState === 'running' && button.contains(animation.effect?.target));
      });
      window.crewTransforms = next;
      return moving.map(button => button.dataset.agent);
    }""")


def scenario(page):
    page.locator('#run').click()
    peak = 0
    observed = set()
    for _ in range(45):
        moving = animated_agents(page)
        count = len(moving)
        peak = max(peak, count)
        assert count <= 2, f"Too many moving agents: {moving}"
        assert page.locator('.airi-crew-status').count() <= 1
        observed.update(page.locator('#crew button[data-agent]').evaluate_all("els => els.map(el => el.dataset.state)"))
        page.wait_for_timeout(120)
    expect(page.locator('[data-agent="hilo"].airi-crew-agent')).to_have_attribute('data-state', 'needs-you')
    assert 'working' in observed, observed
    assert 'needs-you' in observed, observed
    expect(page.locator('.airi-agent-cursor')).to_be_visible()
    cursor = page.locator('.airi-agent-cursor__tag').bounding_box()
    assert cursor and cursor['x'] >= 0 and cursor['x'] + cursor['width'] <= page.viewport_size['width']
    theme = page.evaluate("matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'")
    page.screenshot(path=str(AUDIT / f'waiting-{page.viewport_size["width"]}-{theme}.png'))
    cursor_edge(page)
    page.locator('#crew [data-agent="hilo"]').click()
    dialog = page.get_by_role('dialog', name='Hilo', exact=True)
    expect(dialog.locator('li')).to_have_count(3)
    page.keyboard.press('Tab')
    assert dialog.evaluate('el => el.contains(document.activeElement)')
    page.screenshot(path=str(AUDIT / f'dialog-{page.viewport_size["width"]}.png'))
    dialog.get_by_role('button', name='Ver su tarjeta').click()
    expect(page.locator('[data-card="r-oferta"]')).to_be_focused()
    assert page.evaluate("testStore.getSnapshot().cards['r-oferta'].status") == 'pending'
    page.get_by_role('button', name='Aprobar y ofrecer', exact=True).click()
    expect(page.locator('#crew [data-agent="hilo"]')).to_have_attribute('data-state', 'done')
    expect(page.locator('#crew [role="status"]')).to_have_text('Hilo · listo')
    expect(page.locator('.airi-agent-cursor')).to_have_count(0)
    return peak


def reduced_check(page, bundle):
    page.emulate_media(reduced_motion='reduce')
    load_harness(page, bundle)
    page.locator('#run').click()
    expect(page.locator('#crew [data-agent="hilo"]')).to_have_attribute('data-state', 'needs-you')
    page.wait_for_timeout(500)
    assert page.locator('.airi-crew-face').evaluate_all("els => els.every(el => getComputedStyle(el).transform === 'none')")
    assert animated_agents(page) == []
    expect(page.locator('.airi-agent-cursor')).to_be_visible()
    assert page.locator('.airi-agent-cursor').evaluate("el => getComputedStyle(el).transform === 'none'")
    assert page.evaluate("testStore.getSnapshot().cards['r-oferta'].status") == 'pending'
    page.screenshot(path=str(AUDIT / 'reduced.png'), full_page=True)
    # Live preference changes are honored without remounting the component.
    page.emulate_media(reduced_motion='no-preference')
    expect(page.locator('.airi-crew')).to_have_attribute('data-reduced', 'false')
    page.emulate_media(reduced_motion='reduce')
    expect(page.locator('.airi-crew')).to_have_attribute('data-reduced', 'true')
    assert page.locator('.airi-crew-face').evaluate_all("els => els.every(el => getComputedStyle(el).transform === 'none')")


def cursor_edge(page):
    card = page.locator('[data-card="r-oferta"]')
    card.evaluate("el => Object.assign(el.style, {position:'fixed',right:'0px',top:'200px',width:'24px',height:'40px',overflow:'hidden'})")
    page.wait_for_timeout(240)
    tag = page.locator('.airi-agent-cursor__tag')
    expect(tag).to_have_attribute('data-flip', 'true')
    rect = tag.bounding_box()
    assert rect and 0 <= rect['x'] and rect['x'] + rect['width'] <= page.viewport_size['width']
    page.screenshot(path=str(AUDIT / 'cursor-edge.png'))
    card.evaluate("el => el.removeAttribute('style')")


def idle_and_touch(page, bundle):
    page.emulate_media(reduced_motion='no-preference')
    load_harness(page, bundle)
    peak = 0
    for _ in range(40):
        moving = animated_agents(page)
        peak = max(peak, len(moving))
        assert len(moving) <= 1, moving
        page.wait_for_timeout(120)
    assert peak == 1, 'No idle breathing observed'
    button = page.locator('#crew [data-agent="cepillo"]')
    button.dispatch_event('pointerenter', {'pointerType':'touch'})
    expect(page.locator('.airi-crew-tip')).to_have_count(0)
    button.hover()
    expect(page.locator('.airi-crew-tip')).to_contain_text('agenda y cupos')
    page.mouse.move(0, 500)
    expect(page.locator('.airi-crew-tip')).to_have_count(0)
    return peak


if __name__ == "__main__":
    AUDIT.mkdir(parents=True, exist_ok=True)
    bundle = build_harness()
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (1440, 390):
            for theme in ('light', 'dark'):
                page = browser.new_page(viewport={"width": width, "height": 1000 if width == 1440 else 844}, color_scheme=theme)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                page.add_init_script(f"localStorage.setItem('airi.shell.theme.v1', '{theme}')")
                smoke(page)
                page.screenshot(path=str(AUDIT / f'shell-{width}-{theme}.png'), full_page=True)
                load_harness(page, bundle)
                peak = scenario(page)
                page.screenshot(path=str(AUDIT / f'scenario-{width}-{theme}.png'), full_page=True)
                assert not errors, errors
                print(f'{width}/{theme}: max {peak}, 0 errors', flush=True)
                results.append({'width':width,'theme':theme,'max_animated':peak,'errors':len(errors)})
                page.close()
        supplemental_errors = []
        page = browser.new_page(viewport={"width":390,"height":844})
        page.on('pageerror', lambda error: supplemental_errors.append(str(error)))
        page.on('console', lambda message: supplemental_errors.append(message.text) if message.type == 'error' else None)
        reduced_check(page, bundle)
        page.close()
        page = browser.new_page(viewport={"width":1440,"height":1000})
        page.on('pageerror', lambda error: supplemental_errors.append(str(error)))
        page.on('console', lambda message: supplemental_errors.append(message.text) if message.type == 'error' else None)
        idle_peak = idle_and_touch(page, bundle)
        page.close()
        assert not supplemental_errors, supplemental_errors
        browser.close()
    (AUDIT / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps({'scenarios':results,'reduced':'PASS','idle_max':idle_peak,'touch_hover':'PASS'}, indent=2))
