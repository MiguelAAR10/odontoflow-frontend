import json,sys,re,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from ops import FE,OUT,envfile,record
STAGE=sys.argv[1]; ROLE=sys.argv[2] if len(sys.argv)>2 else 'Lucía Ramos'
def log(value):
 with (OUT/'browser.jsonl').open('a') as f: f.write(json.dumps({'stage':STAGE,**value},ensure_ascii=False)+'\n')
def response(r):
 if '/api/backend/' not in r.url: return
 try: body=r.json()
 except: body=None
 h=r.request.headers
 log({'url':r.url,'method':r.request.method,'status':r.status,'body':body,'request_body':r.request.post_data_json if r.request.method=='POST' else None,'idempotency_key':h.get('idempotency-key'),'replayed':r.headers.get('idempotent-replay'),'browser_bearer_present':'authorization' in h})
def snap(name):
 page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
 (OUT/(name+'.txt')).write_text(page.locator('body').inner_text())
def api(path,method='GET',body=None,key=None):
 return page.evaluate('''async ({path,method,body,key})=>{const r=await fetch('/api/backend'+path,{method,headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),replayed:r.headers.get('idempotent-replay')}}''',dict(path=path,method=method,body=body,key=key))
def go(path):
 page.goto('http://127.0.0.1:3110'+path,wait_until='networkidle')
def login():
 go('/agenda')
 page.get_by_label('Código de acceso').fill(envfile(FE/'.env.local')['BFF_ACCESS_CODE'])
 page.get_by_role('button',name=re.compile(ROLE)).click()
 page.wait_for_load_state('networkidle')
 expect(page.get_by_role('heading',name='Elige quién eres')).to_have_count(0)
 log({'identity':api('/me')})
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1100},timezone_id='America/Lima')
 page.on('response',response)
 page.on('pageerror',lambda e:log({'pageerror':str(e)}))
 try:
  login()
  if STAGE=='discover':
   snap('01-lucia-agenda'); print(page.locator('body').inner_text()[:5500]); go('/aprobaciones'); snap('02-lucia-bandeja'); print(page.locator('body').inner_text()[:5500])
  else:
   exec((OUT/(STAGE+'.py')).read_text())
  record(['python3','browser.py',STAGE,ROLE],FE,0)
 except Exception as e:
  snap(STAGE+'-error'); record(['python3','browser.py',STAGE,ROLE],FE,1); raise
 finally:
  browser.close()
