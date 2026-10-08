from uuid import uuid4
# Switch personas using the real UI and check the backend identity.
page.get_by_role('button',name=re.compile('Cambiar de persona')).click()
page.get_by_role('button',name=re.compile('Carlos Vega')).click();expect(page.get_by_role('link',name='Inventario',exact=True)).to_be_visible()
identity=api('/me');assert identity['body']['principal']['display_name']=='Carlos Vega';log({'switched_to_carlos':identity});snap('j1-cambio-a-carlos')
page.get_by_role('button',name=re.compile('Cambiar de persona')).click();page.get_by_role('button',name=re.compile('Lucía Ramos')).click();expect(page.get_by_role('link',name='Inventario',exact=True)).to_have_count(0)
identity=api('/me');assert identity['body']['principal']['display_name']=='Lucía Ramos';log({'switched_back_lucia':identity})
# Retry the exact claim intent, without generating a new assignment.
rows=[json.loads(x) for x in (OUT/'browser.jsonl').read_text().splitlines()]
claim=next(r for r in rows if r.get('url','').endswith('/handoffs/1/claim') and r.get('method')=='POST' and r.get('status')==200)
retry=api('/handoffs/1/claim','POST',None,claim['idempotency_key']);assert retry['status']==200 and retry['replayed']=='true';log({'claim_replay':retry})
# No bearer or access credentials persist in browser storage or cookie values.
secrets=[x['token'] for x in json.loads(envfile(FE/'.env.local')['BACKEND_DEMO_HUMANS'])]
cookies=page.context.cookies(); storage=page.evaluate('JSON.stringify({local:{...localStorage},session:{...sessionStorage}})')
assert not any(s in json.dumps(cookies)+storage for s in secrets)
log({'browser_storage':{'bearer_found':False,'cookie_properties':[{k:c[k] for k in ['name','httpOnly','sameSite','secure']} for c in cookies]}})
page.context.clear_cookies();go('/agenda');expect(page.get_by_role('heading',name='Elige quién eres')).to_be_visible()
unauth=api('/me');assert unauth['status']==401;log({'missing_session_401':unauth});snap('j1-sesion-cerrada')
print('Cambio Lucía→Carlos→Lucía, claim replay, cookie httpOnly, /me sin sesión=401.')
