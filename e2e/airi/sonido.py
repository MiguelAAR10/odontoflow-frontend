"""D4 acceptance. Run against NEXT_PUBLIC_USE_MOCKS=true dev on port 5234.
Browser-only harness bundles production hook/Intro and real reducer; no test API in app.
"""
import os
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('AIRI_BASE_URL', 'http://127.0.0.1:5234')
AUDIT = Path('.audit/D4-SONIDO-INTRO')
NOTES = dict(airi=196, cepillo=220, pasta=261.63, hilo=293.66, enjuague=329.63, espejo=392, escudo=440)
SPY = r"""
window.audioSpy = {contexts:0, frequencies:[]};
const NativeAudioContext = window.AudioContext;
window.AudioContext = class extends NativeAudioContext {
 constructor(...args) { super(...args); window.audioSpy.contexts++; }
 createOscillator() {
  const oscillator = super.createOscillator();
  const original = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
  oscillator.frequency.setValueAtTime = (value, time) => {
   window.audioSpy.frequencies.push(value); return original(value, time);
  };
  return oscillator;
 }
};
"""
HARNESS = r"""
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Intro} from './src/crew/Intro';
import {useAgentSounds} from './src/lib/useAgentSounds';
import {sound} from './src/lib/sound';
import {createInitialState, reducer} from './src/agui/reducer';
let state = createInitialState();
const listeners = new Set();
const store = {getSnapshot:()=>state, subscribe:fn=>{listeners.add(fn); return ()=>listeners.delete(fn)}};
window.emit = event => {state = reducer(state,event); listeners.forEach(fn=>fn());};
window.resetStore = () => {state=createInitialState(); listeners.forEach(fn=>fn());};
window.soundCalls=[];
const play=sound.play;
sound.play=(name,agent)=>{window.soundCalls.push({name,agent}); play(name,agent)};
window.testSound=sound;
function Sounds(){useAgentSounds(store); return null;}
function App(){return <><Sounds/><Intro/><main><form onSubmit={e=>{e.preventDefault();window.emit({type:'RUN_REQUESTED',threadId:'t',runId:'r'})}}>
<input data-airi-input aria-label="Pregúntale a AIRI"/><button>Enviar</button></form></main></>}
createRoot(document.getElementById('root')).render(<App/>);
"""


def bundle():
    script = """
import {build} from 'esbuild';
const result=await build({stdin:{contents:process.env.SOUND_HARNESS,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,
 outfile:'.audit/D4-SONIDO-INTRO/harness.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}});
for(const file of result.outputFiles) if(!file.path.endsWith('.css')) process.stdout.write(file.text);
"""
    return subprocess.run(['node', '--input-type=module', '-e', script], env={**os.environ, 'SOUND_HARNESS': HARNESS}, capture_output=True, text=True, check=True).stdout


def harness(page, js, search=''):
    html = '<style>' + Path('src/tokens.css').read_text() + Path('src/crew/crew.css').read_text() + '</style><div id="root"></div>'
    page.route('**/__sound_harness*', lambda route: route.fulfill(status=200, content_type='text/html', body=html))
    page.goto(f'{BASE}/__sound_harness{search}')
    page.add_script_tag(content=js)
    page.wait_for_function('window.emit !== undefined')


def emit(page, event):
    page.evaluate('event=>window.emit(event)', event)


def calls(page):
    return page.evaluate('window.soundCalls.map(call=>call.name)')


def reset_spies(page):
    page.evaluate('window.soundCalls=[];window.audioSpy.frequencies=[]')


def shell(page, width, theme):
    page.clock.install()
    page.clock.pause_at(page.evaluate('new Date(Date.now() + 1000).toISOString()'))
    page.goto(f'{BASE}/home?intro=1')
    page.clock.run_for(500)
    intro = page.get_by_role('dialog', name='AIRI y su equipo')
    expect(intro).to_be_visible()
    expect(intro.locator('[data-intro-agent]')).to_have_count(7)
    assert page.evaluate('window.audioSpy.contexts') == 0
    expect(intro.get_by_role('button', name='Omitir presentación')).to_be_focused()
    page.screenshot(path=str(AUDIT / f'intro-{width}-{theme}.png'), animations='disabled')
    page.clock.resume()
    page.keyboard.press('Tab')
    expect(intro.get_by_role('button', name='Omitir presentación')).to_be_focused()
    page.keyboard.press('Escape')
    expect(intro).to_have_count(0)
    home = page.locator('#airi-home-input')
    expect(home).to_be_focused()
    page.evaluate("history.replaceState(null, '', '/home')")
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(intro).to_have_count(0)
    if width == 390:
        page.get_by_role('button', name='Abrir navegación', exact=True).click()
    toggle = page.get_by_role('button', name='Sonido', exact=True)
    expect(toggle).to_have_attribute('aria-pressed', 'true')
    toggle.click()
    expect(toggle).to_have_attribute('aria-pressed', 'false')
    assert page.evaluate("localStorage.getItem('airi.sound')") == '0'
    toggle.click()
    expect(toggle).to_have_attribute('aria-pressed', 'true')
    page.screenshot(path=str(AUDIT / f'shell-{width}-{theme}.png'), full_page=True)
    if width == 390:
        page.get_by_role('button', name='Cerrar navegación', exact=True).first.click()
    reset_spies(page)
    home.press_sequentially('Resume esta vista', delay=45)
    assert page.evaluate('window.audioSpy.frequencies.length') > 0, 'Inicio no suena al teclear'
    reset_spies(page)
    home.press('Enter')
    page.wait_for_timeout(1000)
    assert 293.66 in page.evaluate('window.audioSpy.frequencies'), 'Inicio no suena al enviar'
    page.goto(f'{BASE}/agenda')
    page.wait_for_load_state('networkidle')
    reset_spies(page)
    bar = page.locator('.interaction-bar input[data-airi-input]')
    bar.press_sequentially('Resume esta vista', delay=45)
    assert page.evaluate('window.audioSpy.frequencies.length') > 0, 'Barra no suena al teclear'
    reset_spies(page)
    bar.press('Enter')
    page.wait_for_timeout(1000)
    assert 293.66 in page.evaluate('window.audioSpy.frequencies'), 'Barra no suena al enviar'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def sound_mapping(page, js):
    harness(page, js)
    expect(page.get_by_role('dialog', name='AIRI y su equipo')).to_be_visible()
    assert page.evaluate('window.audioSpy.contexts') == 0
    page.get_by_role('button', name='Omitir presentación').click()
    assert page.evaluate('window.audioSpy.contexts') == 1
    reset_spies(page)
    field = page.get_by_role('textbox')
    field.press_sequentially('x')
    assert calls(page) == ['key']
    reset_spies(page)
    field.press('ArrowLeft')
    field.press('Control+a')
    assert calls(page) == [], 'Atajos y navegación no deben sonar'
    for agent, note in NOTES.items():
        page.evaluate('window.resetStore()')
        reset_spies(page)
        emit(page, dict(type='RUN_REQUESTED', threadId='t', runId='r'))
        emit(page, dict(type='RUN_STARTED', threadId='t', runId='r', agent=agent))
        assert calls(page) == ['send', 'start']
        assert note in page.evaluate('window.audioSpy.frequencies'), f'Nota de {agent}'
        emit(page, dict(type='TEXT_MESSAGE_START', messageId='m', role='assistant'))
        emit(page, dict(type='TEXT_MESSAGE_CONTENT', messageId='m', delta='Hola'))
        assert calls(page) == ['send', 'start'], 'El streaming no añade ticks'
        page.wait_for_timeout(700)
    # Needs, successful approval (without start/done), and failed approval.
    fixture = json.loads(Path('src/agui/sim/fixtures/admin-hueco.json').read_text())
    card = fixture[-1]['event']['outcome']['interrupts'][0]['metadata']['card']
    page.evaluate('window.resetStore()')
    emit(page, dict(type='RUN_STARTED', threadId='t', runId='r', agent=card['agent']))
    reset_spies(page)
    emit(page, dict(type='RUN_FINISHED', threadId='t', runId='r', outcome=dict(type='interrupt', interrupts=[dict(id='i', reason='approve', metadata=dict(card=card))])))
    assert calls(page) == ['needs']
    reset_spies(page)
    emit(page, dict(type='CARD_APPROVAL_STARTED', cardId=card['id']))
    assert calls(page) == []
    emit(page, dict(type='CARD_APPROVAL_FAILED', cardId=card['id'], message='Error de aprobación'))
    assert calls(page) == ['error']
    reset_spies(page)
    emit(page, dict(type='CARD_APPROVAL_STARTED', cardId=card['id']))
    emit(page, dict(type='CARD_APPROVED', card={**card, 'state':'approved'}))
    assert calls(page) == ['approved'], 'Aprobar no debe añadir tick/acorde'
    page.evaluate('window.resetStore()')
    emit(page, dict(type='RUN_STARTED', threadId='t', runId='r'))
    reset_spies(page)
    emit(page, dict(type='RUN_FINISHED', threadId='t', runId='r', outcome=dict(type='success')))
    assert calls(page) == ['done']
    reset_spies(page)
    emit(page, dict(type='RUN_ERROR', code='TEST', message='Error de prueba'))
    assert calls(page) == ['error']
    reset_spies(page)
    emit(page, dict(type='RUN_STOPPED'))
    assert calls(page) == []
    page.evaluate('window.resetStore()')
    emit(page, dict(type='RUN_STARTED', threadId='t', runId='r', agent='airi'))
    reset_spies(page)
    emit(page, dict(type='SUBAGENT_STARTED', agent='cepillo', name='Cepillo', subagentRunId='sub'))
    assert calls(page) == ['start']
    reset_spies(page)
    auto_card = {**card, 'id':'test-auto', 'level':'auto', 'state':'ready'}
    emit(page, dict(type='TOOL_CALL_RESULT', toolCallId='tool', messageId='result', content='', metadata=dict(card=auto_card)))
    assert calls(page) == ['done']
    reset_spies(page)
    # Clear cannot replay the old trace; subsequent runs still sound.
    page.evaluate('window.resetStore()')
    assert calls(page) == []
    print('OK: siete señales, siete notas, streaming, aprobación y reinicio')


def intro_lifecycle(page, js):
    harness(page, js, '?intro=1')
    intro = page.get_by_role('dialog', name='AIRI y su equipo')
    expect(intro).to_be_visible()
    start = page.evaluate('performance.now()')
    seen = set()
    while intro.count() and page.evaluate('performance.now()') - start < 4200:
        current = intro.locator('[data-intro-agent][data-presenting="true"]')
        if current.count(): seen.add(current.get_attribute('data-intro-agent'))
        page.wait_for_timeout(60)
    expect(intro).to_have_count(0)
    assert seen == set(NOTES), seen
    elapsed = page.evaluate('performance.now()') - start
    assert 2700 <= elapsed <= 3900, elapsed
    harness(page, js)
    page.wait_for_timeout(100)
    expect(intro).to_have_count(0)
    harness(page, js, '?intro=1')
    expect(intro).to_be_visible()
    page.keyboard.press('Enter')
    expect(intro).to_have_count(0)
    page.emulate_media(reduced_motion='reduce')
    harness(page, js, '?intro=1')
    expect(intro).to_be_visible()
    assert intro.evaluate('el => el.getAnimations({subtree:true}).length') == 0
    expect(intro.locator('[data-intro-agent]')).to_have_count(7)
    page.wait_for_timeout(700)
    expect(intro).to_be_visible()
    page.wait_for_timeout(700)
    expect(intro).to_have_count(0)
    page.emulate_media(reduced_motion='no-preference')
    print('OK: siete presentaciones, 3,2 s, sesión, Enter y reduced 1,3 s')


def main():
    AUDIT.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for width in (1440, 390):
            for theme in ('light', 'dark'):
                context = browser.new_context(viewport={'width':width, 'height':900}, color_scheme=theme)
                context.add_init_script(SPY)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
                shell(page, width, theme)
                print(f'OK: shell {width} {theme}')
                context.close()
        js = bundle()
        context = browser.new_context(viewport={'width':1440, 'height':900})
        context.add_init_script(SPY)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        sound_mapping(page, js)
        intro_lifecycle(page, js)
        context.close()
        context = browser.new_context()
        context.add_init_script(SPY)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.goto(f'{BASE}/home?sound=0')
        page.get_by_role('button', name='Omitir presentación').click()
        expect(page.get_by_role('button', name='Sonido', exact=True)).to_be_disabled()
        page.get_by_role('textbox', name='Pregúntale a AIRI', exact=True).press_sequentially('Resume esta vista')
        page.keyboard.press('Enter')
        page.wait_for_timeout(700)
        assert page.evaluate('window.audioSpy.contexts') == 0
        context.close()
        browser.close()
    assert not errors, errors
    print('OK: ?sound=0; 0 errores del navegador; 8 capturas')


if __name__ == '__main__':
    main()
