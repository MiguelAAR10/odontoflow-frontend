"""E3-PARIDAD: auditoría reproducible; no modifica ni corrige el producto."""
import argparse
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import tempfile
import unittest
from urllib.request import urlopen

VIEWS = [
    ('Inicio', '/home', 'home', 'admin'),
    ('Agenda', '/agenda', 'agenda', 'admin'),
    ('Bandeja', '/aprobaciones', 'bandeja', 'admin'),
    ('Caja', '/caja', 'caja', 'admin'),
    ('Rastro', '/agente', 'actividad', 'admin'),
    ('Mi turno', '/mi-turno', 'turno', 'admin'),
    ('Dirección', '/direccion', 'direccion', 'dueno'),
    ('Jornada', '/jornada', 'jornada', 'doctor'),
    ('Atención', '/atencion', 'ficha', 'doctor'),
    ('Lienzo', '/lienzo', 'canvas', 'admin'),
]
AXE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js'


class SelfTests(unittest.TestCase):
    def test_missing_measurement_never_passes(self):
        self.assertFalse(passes({}))

    def test_failures_remain_visible(self):
        good = {'checks': {'console': True, 'network': True}, 'failure': None}
        self.assertTrue(passes(good))
        self.assertFalse(passes({**good, 'failure': 'navigation failed'}))
        self.assertFalse(passes({**good, 'checks': {'console': True, 'network': False}}))

    def test_canvas_exception_and_reduced_motion(self):
        result = {'metrics': {'documentOverflow': 0, 'overflow': [], 'visibleInputs': 0,
                             'maxAgents': 0, 'animatedProperties': [], 'theme': 'dark', 'reduced': True},
                  'events': {'console': [], 'pageerror': [], 'http': [], 'requestfailed': []},
                  'a11y': {'violations': []}, 'shortcut': {'visibleInputs': 1}}
        self.assertTrue(all(check_result(result, 'dark', 'reduce', True).values()))
        self.assertFalse(check_result(result, 'dark', 'reduce', False)['input'])
        result['metrics']['maxAgents'] = 1
        self.assertFalse(check_result(result, 'dark', 'reduce', True)['reduced_agents'])
        result['a11y']['violations'] = [{'id': 'color-contrast'}]
        self.assertFalse(check_result(result, 'dark', 'reduce', True)['aa_automatic'])

    def test_report_includes_working_and_shortcut_overflow(self):
        result = {'metrics': {'documentOverflow': 0, 'overflow': [], 'maxAgents': 0},
                  'working': {'documentOverflow': 0, 'overflow': [{'selector': 'select', 'pixels': 18}], 'maxAgents': 3},
                  'shortcut': {'documentOverflow': 4, 'overflow': [{'selector': 'select', 'pixels': 18}], 'maxAgents': 2}}
        self.assertEqual(worst_metrics(result), {'global': 4, 'internal': 18, 'nodes': 1, 'agents': 3})

    def test_comparison_preserves_both_images(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.new('RGB', (3, 4), 'red').save(root / 'a.png')
            Image.new('RGB', (3, 6), 'blue').save(root / 'b.png')
            pair(root / 'a.png', root / 'b.png', root / 'pair.png')
            with Image.open(root / 'pair.png') as picture:
                self.assertEqual(picture.size, (6, 6))
                self.assertEqual(picture.getpixel((1, 1)), (255, 0, 0))
                self.assertEqual(picture.getpixel((4, 5)), (0, 0, 255))


def passes(result):
    return bool(result.get('checks')) and all(result['checks'].values()) and not result.get('failure')


def pair(app, mockup, target):
    from PIL import Image
    with Image.open(app) as left, Image.open(mockup) as right:
        combined = Image.new('RGB', (left.width + right.width, max(left.height, right.height)), '#888888')
        combined.paste(left, (0, 0))
        combined.paste(right, (left.width, 0))
        combined.save(target)


# Motion sampling includes painted elements inside the viewport. Include
# nested transforms: a moving SVG arm counts its agent once, not every SVG part.
MEASURE = r"""async ({milliseconds}) => {
  const visible = el => {
    if (!(el instanceof Element) || !el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) return false;
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0 && r.right>0 && r.bottom>0 && r.left<innerWidth && r.top<innerHeight;
  };
  const selector = el => el.id ? '#'+el.id : el.tagName.toLowerCase()+'.'+[...el.classList].slice(0,2).join('.');
  const overflow = [...document.body.querySelectorAll('*')].filter(el => {
    if (!(el instanceof HTMLElement) || !visible(el) || el.closest('nextjs-portal,[aria-hidden="true"]') || el.matches('button[data-agent]')) return false;
    const style=getComputedStyle(el);
    return el.clientWidth>1 && style.clipPath==='none' && style.clip==='auto' && style.textOverflow!=='ellipsis' && el.scrollWidth>el.clientWidth+1 && !['auto','scroll'].includes(style.overflowX);
  }).map(el=>({selector:selector(el), pixels:el.scrollWidth-el.clientWidth, overflow:getComputedStyle(el).overflowX}));
  let maxAgents=0, maxAnimations=0, frames=0, peakAgents=[];
  const previous=new Map(), moved=new Set(), properties=new Set();
  const start=performance.now();
  await new Promise(resolve => {
    function frame(now) {
      frames++;
      const agents=new Set();
      const animations=document.getAnimations().filter(a=>a.playState==='running' && visible(a.effect?.target));
      maxAnimations=Math.max(maxAnimations, animations.length);
      for(const animation of animations) {
        const root=animation.effect.target.closest('[data-agent],.personaje,[data-intro-agent]');
        if(root) agents.add(root.dataset.agent||root.dataset.introAgent||[...root.classList].find(c=>c.startsWith('pj-'))?.slice(3)||selector(root));
        for(const keyframe of animation.effect.getKeyframes()) for(const key of Object.keys(keyframe))
          if(!['offset','computedOffset','easing','composite','transform','opacity'].includes(key)) properties.add(key);
      }
      for(const root of document.querySelectorAll('[data-agent],.personaje,[data-intro-agent]')) {
        if(!visible(root)) continue;
        const id=root.dataset.agent||root.dataset.introAgent||[...root.classList].find(c=>c.startsWith('pj-'))?.slice(3)||selector(root);
        for(const el of [root,...root.querySelectorAll('*')]) {
          if(!visible(el)) continue;
          const css=getComputedStyle(el), value=css.transform+'|'+css.opacity;
          if(previous.has(el) && previous.get(el)!==value) {agents.add(id);moved.add(id);}
          previous.set(el,value);
        }
      }
      if(agents.size>maxAgents) {maxAgents=agents.size;peakAgents=[...agents];}
      if(now-start>=milliseconds) resolve(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  return {documentOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth), overflow,
    inputs:document.querySelectorAll('[data-airi-input]:not([type="hidden"])').length,
    visibleInputs:[...document.querySelectorAll('[data-airi-input]')].filter(visible).length,
    maxAgents,maxAnimations,frames,peakAgents,movedAgents:[...moved],animatedProperties:[...properties],
    theme:document.documentElement.dataset.theme,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
}"""

AXE = """async () => {
 const result=await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
 const compact = rows => rows.map(row=>({id:row.id, impact:row.impact, description:row.description,
   helpUrl:row.helpUrl, nodes:row.nodes.map(node=>({target:node.target, summary:node.failureSummary, html:node.html}))}));
 return {version:axe.version, violations:compact(result.violations), incomplete:compact(result.incomplete),
   passedRules:result.passes.length, inapplicableRules:result.inapplicable.length};
}"""


def observe(page):
    events = {'console': [], 'pageerror': [], 'http': [], 'requestfailed': []}
    page.on('console', lambda message: events['console'].append(message.text) if message.type == 'error' else None)
    page.on('pageerror', lambda error: events['pageerror'].append(str(error)))
    page.on('response', lambda response: events['http'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
    page.on('requestfailed', lambda request: events['requestfailed'].append({'url': request.url, 'failure': request.failure}))
    return events


def role(page, width, value):
    from playwright.sync_api import expect
    label = {'admin': 'Administrativo', 'dueno': 'Dueño', 'doctor': 'Doctor'}[value]
    if width == 390:
        page.locator('.shell-role-select').select_option(value)
    else:
        page.locator('.shell-roles').get_by_role('button', name=label, exact=True).click()
    expect(page.locator('.shell-roles').get_by_role('button', name=label, exact=True, include_hidden=True)).to_have_attribute('aria-pressed', 'true')


def navigate_app(page, args, view, width, theme):
    from playwright.sync_api import expect
    page.goto(args.base_url.rstrip('/') + '/home', wait_until='networkidle', timeout=120000)
    expect(page.locator('html')).to_have_attribute('data-theme', theme)
    # Match the mockup's Lince scope instead of comparing all branches to one.
    page.locator('.shell-location-select').select_option(label='Lince')
    expect(page.locator('.shell-location-select')).to_have_value('1')
    role(page, width, view[3])
    if view[1] != '/home':
        if width == 390:
            page.get_by_role('button', name='Abrir navegación', exact=True).click()
        page.locator(f'#app-sidebar a[href="{view[1]}"]').click()
        expect(page).to_have_url(args.base_url.rstrip('/') + view[1])
        page.wait_for_load_state('networkidle')
    expect(page.locator('main h1').first).to_be_visible()
    if view[1] == '/lienzo':
        expect(page.locator('[data-canvas-ready]')).to_have_attribute('data-canvas-ready', 'true')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(600)  # Complete finite view entries before measuring idle.


def audit(page, axe_path, milliseconds):
    metrics = page.evaluate(MEASURE, {'milliseconds': milliseconds})
    page.add_script_tag(path=str(axe_path))
    accessibility = page.evaluate(AXE)
    if accessibility['version'] != '4.10.3':
        raise RuntimeError('Se requiere axe-core 4.10.3')
    return {'metrics': metrics, 'a11y': accessibility}


def check_result(result, theme, motion, canvas):
    metrics = result['metrics']
    checks = {
        'console': not result['events']['console'] and not result['events']['pageerror'],
        'network': not result['events']['http'] and not result['events']['requestfailed'],
        'overflow': metrics['documentOverflow'] <= 1 and not metrics['overflow'],
        'aa_automatic': not result['a11y']['violations'],
        'input': metrics['visibleInputs'] == (0 if canvas else 1),
        'agents': metrics['maxAgents'] <= 2,
        'motion_properties': not metrics['animatedProperties'],
        'theme': metrics['theme'] == theme,
        'reduced_preference': metrics['reduced'] == (motion == 'reduce'),
        'reduced_agents': motion != 'reduce' or metrics['maxAgents'] == 0,
    }
    if canvas:
        checks['canvas_shortcut'] = result.get('shortcut', {}).get('visibleInputs') == 1
    return checks


def worst_metrics(result):
    states = [result.get(key, {}) for key in ('metrics', 'working', 'shortcut')]
    overflows = [item for state in states for item in state.get('overflow', [])]
    return {'global': max(state.get('documentOverflow', 0) for state in states),
            'internal': max((item['pixels'] for item in overflows), default=0),
            'nodes': len({item['selector'] for item in overflows}),
            'agents': max(state.get('maxAgents', 0) for state in states)}


def save_reports(output, results, metadata):
    (output / 'results.json').write_text(json.dumps({'metadata': metadata, 'cases': results}, indent=2, ensure_ascii=False))
    rows = ['# E3-PARIDAD · resultados automáticos', '',
            'App a la izquierda; mockup a la derecha. AA automático no equivale a certificación WCAG.', '',
            '| Vista | Configuración | Estado | Consola/JS | Red | Desborde global/interno px/nodos | AA nodos | AA revisar | Entradas | Agentes máx. | Captura |',
            '|---|---|---|---:|---:|---|---:|---:|---:|---:|---|']
    gallery = ['<!doctype html><html lang="es"><meta charset="utf-8"><title>E3-PARIDAD</title>',
               '<style>body{font:16px system-ui;margin:24px;background:#eee;color:#111}img{width:100%;height:auto}article{margin:32px 0}a{color:#0044aa}</style>',
               '<h1>E3-PARIDAD</h1><p>App izquierda · mockup derecha. Comparación visual manual; no hay umbral de similitud inventado.</p>']
    for result in results:
        m, a = result.get('metrics', {}), result.get('a11y', {})
        worst = worst_metrics(result)
        e = result.get('events', {})
        count = lambda key: len(e.get(key, []))
        nodes = sum(len(v['nodes']) for v in a.get('violations', []))
        review = sum(len(v['nodes']) for v in a.get('incomplete', []))
        verdict = 'PASA' if passes(result) else 'FALLA'
        name, config, stem = result['view'], result['config'], result['stem']
        capture = f'{stem}-pair.png'
        link = f'[comparar]({capture})' if (output / capture).exists() else 'sin pareja'
        rows.append(f"| {name} | {config} | {verdict} | {count('console')+count('pageerror')} | {count('http')+count('requestfailed')} | {worst['global']}/{worst['internal']}/{worst['nodes']} | {nodes} | {review} | {m.get('visibleInputs','?')} | {worst['agents']} | {link} |")
        failed = ', '.join(key for key, value in result.get('checks', {}).items() if not value)
        gallery.append(f'<article><h2>{html.escape(name+" · "+config+" · "+verdict)}</h2><p>{html.escape(result.get("failure") or failed)}</p>')
        if (output / capture).exists():
            gallery.append(f'<a href="{capture}"><img loading="lazy" src="{capture}" alt="{html.escape(name)}: app izquierda, mockup derecha"></a>')
        gallery.append('</article>')
    (output / 'report.md').write_text('\n'.join(rows)+'\n')
    (output / 'index.html').write_text('\n'.join(gallery)+'</html>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5243')
    parser.add_argument('--mockup-url', default='http://127.0.0.1:8130/agente-v10/')
    parser.add_argument('--output', type=Path, default=Path('.audit/E3-PARIDAD'))
    parser.add_argument('--axe-path', type=Path, help='axe-core 4.10.3 local, para ejecución sin CDN')
    parser.add_argument('--views', nargs='+', choices=[view[2] for view in VIEWS], help='Filtro diagnóstico; omitir para aceptación completa')
    parser.add_argument('--sample-ms', type=int, default=1200)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(SelfTests)
        return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1
    if args.sample_ms < 500:
        parser.error('--sample-ms debe ser >=500')
    from playwright.sync_api import expect, sync_playwright
    expect.set_options(timeout=30000)
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    axe_path = args.axe_path or output / 'axe-4.10.3.min.js'
    if args.axe_path is None and not axe_path.exists():
        with urlopen(AXE_URL, timeout=30) as response:
            axe_path.write_bytes(response.read())
    metadata = {'started_utc': datetime.now(timezone.utc).isoformat(), 'scope': 'Lince', 'base_url': args.base_url, 'mockup_url': args.mockup_url, 'axe_source': AXE_URL,
                'axe_sha256': hashlib.sha256(axe_path.read_bytes()).hexdigest(), 'sample_ms': args.sample_ms,
                'views_filter': args.views, 'coverage': 'WCAG A/AA automático axe 4.10.3 + revisión visual manual pendiente'}
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        metadata['browser'] = browser.version
        try:
            for width, height in [(1440, 1000), (390, 844)]:
                for theme in ['light', 'dark']:
                    for motion in ['no-preference', 'reduce']:
                        for view in VIEWS:
                            if args.views and view[2] not in args.views:
                                continue
                            config = f'{width}-{theme}-{motion}'
                            stem = f'{view[2]}-{config}'
                            result = {'view': view[0], 'route': view[1], 'role': view[3], 'config': config,
                                      'stem': stem, 'checks': {}, 'failure': None}
                            context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme, reduced_motion=motion)
                            context.add_init_script(f"sessionStorage.setItem('airi.intro.v1','1'); localStorage.setItem('airi.shell.theme.v1','{theme}'); sessionStorage.setItem('airi9.intro','1');")
                            page, reference = context.new_page(), context.new_page()
                            result['events'] = observe(page)
                            reference_events = observe(reference)
                            try:
                                navigate_app(page, args, view, width, theme)
                                result.update(audit(page, axe_path, args.sample_ms))
                                # Hide only Next's developer badge for screenshots, after
                                # measuring. Never silence console/network errors.
                                page.add_style_tag(content='nextjs-portal{display:none!important}')
                                page.screenshot(path=str(output / f'{stem}-app.png'), full_page=True)
                                if view[2] == 'canvas':
                                    page.keyboard.press('Control+k')
                                    expect(page.locator('[data-airi-input]:visible')).to_have_count(1)
                                    result['shortcut'] = audit(page, axe_path, 500)
                                    result['shortcut'] = {**result['shortcut']['metrics'], 'a11y': result['shortcut']['a11y']}
                                    page.screenshot(path=str(output / f'{stem}-shortcut.png'), full_page=True)
                                    # The dialog is a product state too: fold its violations
                                    # and geometry into acceptance, preserving raw evidence.
                                    for issue in result['shortcut']['a11y']['violations']:
                                        result['a11y']['violations'].append(issue)
                                # Exercise actual agent activity, not just an idle crew.
                                # The fixture intent only proposes; it never approves.
                                entry = page.locator('[data-airi-input]:visible')
                                entry.fill('Confirma las citas de mañana' if view[3] == 'admin' else 'Compara las sedes' if view[3] == 'dueno' else 'Prepara el brief')
                                entry.press('Enter')
                                expect(page.locator('.airi-turn--user').first).to_be_visible()
                                result['working'] = page.evaluate(MEASURE, {'milliseconds': args.sample_ms})
                                result['checks'] = check_result(result, theme, motion, view[2] == 'canvas')
                                w = result['working']
                                result['checks']['working_agents'] = w['maxAgents'] <= (0 if motion == 'reduce' else 2)
                                result['checks']['working_motion_properties'] = not w['animatedProperties']
                                result['checks']['working_input'] = w['visibleInputs'] == 1
                                result['checks']['working_overflow'] = w['documentOverflow'] <= 1 and not w['overflow']
                                page.screenshot(path=str(output / f'{stem}-working.png'), full_page=True)
                                if view[2] == 'canvas':
                                    s = result['shortcut']
                                    result['checks']['canvas_geometry'] = s['documentOverflow'] <= 1 and not s['overflow']
                                    result['checks']['canvas_motion'] = s['maxAgents'] <= (0 if motion == 'reduce' else 2)
                            except Exception as error:
                                result['failure'] = str(error)
                                try:
                                    page.screenshot(path=str(output / f'{stem}-app.png'), full_page=True)
                                    (output / f'{stem}-failure.html').write_text(page.content())
                                except Exception as capture_error:
                                    result['capture_failure'] = str(capture_error)
                            try:
                                reference.goto(args.mockup_url + f'?rol={view[3]}&tema={theme}&intro=0', wait_until='networkidle', timeout=120000)
                                reference.evaluate('(section) => { APP.sec=section; render(); }', view[2])
                                assert reference.evaluate('APP.sec') == view[2], 'Mockup mostró otra sección'
                                reference.evaluate('document.fonts.ready')
                                reference.wait_for_timeout(600)
                                result['reference'] = audit(reference, axe_path, 500)
                                result['reference']['events'] = reference_events
                                expect(reference.locator('html')).to_have_attribute('data-theme', theme)
                                reference.screenshot(path=str(output / f'{stem}-mockup.png'), full_page=True)
                                pair(output / f'{stem}-app.png', output / f'{stem}-mockup.png', output / f'{stem}-pair.png')
                            except Exception as error:
                                result['reference_failure'] = str(error)
                                result['checks']['reference_available'] = False
                            # Events can arrive during screenshot/reference processing.
                            result['checks']['console'] = not result['events']['console'] and not result['events']['pageerror']
                            result['checks']['network'] = not result['events']['http'] and not result['events']['requestfailed']
                            results.append(result)
                            save_reports(output, results, metadata)
                            print(f'{view[0]} {config}: {"PASA" if passes(result) else "FALLA"}', flush=True)
                            context.close()
        finally:
            browser.close()
    metadata['finished_utc'] = datetime.now(timezone.utc).isoformat()
    save_reports(output, results, metadata)
    passed = sum(passes(result) for result in results)
    print(f'{passed}/{len(results)} casos pasan. Evidencia: {output / "report.md"}')
    return 0 if passed == len(results) and results else 1


if __name__ == '__main__':
    raise SystemExit(main())
