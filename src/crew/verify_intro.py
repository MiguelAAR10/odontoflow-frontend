"""Real-browser regression: no third identity during intro, including a busy renderer."""
import json
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

source = """
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Intro} from './src/crew/Intro';
createRoot(document.getElementById('root')).render(<Intro/>);
"""
bundle = subprocess.run(["node", "--input-type=module", "-e", """
import {build} from 'esbuild';
const r=await build({stdin:{contents:process.env.INTRO_TEST,resolveDir:process.cwd(),loader:'tsx'},outfile:'.audit/intro.js',bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'}});
process.stdout.write(r.outputFiles.find(file=>file.path.endsWith('.js')).text);
"""], env={**os.environ, "INTRO_TEST": source}, capture_output=True, text=True, check=True).stdout
trace = """() => {
  window.introMotion = {max:0, frames:0};
  let previous={};
  const sample=()=>{
    const next={}; let moving=0;
    for(const node of document.querySelectorAll('[data-intro-agent]')) {
      const id=node.dataset.introAgent;
      const disc=node.querySelector('.airi-intro__disc');
      const css=getComputedStyle(disc);
      const value=css.transform+'|'+css.opacity;
      next[id]=value;
      const active=node.getAnimations({subtree:true}).some(a=>a.playState==='running');
      if(active || (previous[id]!==undefined && previous[id]!==value)) moving++;
    }
    previous=next; window.introMotion.max=Math.max(window.introMotion.max,moving);
    window.introMotion.frames++; requestAnimationFrame(sample);
  }; requestAnimationFrame(sample);
}"""
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in (1440,390):
        for reduced in (False,True):
            context=browser.new_context(viewport={"width":width,"height":1000}, reduced_motion="reduce" if reduced else "no-preference")
            page=context.new_page()
            page.on('pageerror',lambda error: print(f'Browser error: {error}',flush=True))
            html='<style>'+Path('src/tokens.css').read_text()+Path('src/crew/crew.css').read_text()+'</style><div id="root"></div>'
            page.route('http://intro.test/',lambda route: route.fulfill(content_type='text/html',body=html))
            page.goto('http://intro.test/')
            page.evaluate(trace)
            page.add_script_tag(content=bundle)
            page.wait_for_selector('.airi-intro[open]')
            if not reduced:
                page.evaluate("window.busyIntro=setInterval(()=>{const end=performance.now()+90;while(performance.now()<end){}},120)")
            page.wait_for_selector('.airi-intro',state='detached',timeout=20000)
            page.evaluate('clearInterval(window.busyIntro)')
            result=page.evaluate('window.introMotion')
            assert result['max'] <= (0 if reduced else 2), result
            results.append({"width":width,"reduced":reduced,**result})
            context.close()
    browser.close()
out=Path('.audit/G2-MOTION');out.mkdir(parents=True,exist_ok=True)
(out/'intro-motion.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
