import json,hashlib,subprocess,datetime
from pathlib import Path
from ops import *
rows=[json.loads(s) for s in (OUT/'browser.jsonl').read_text().splitlines()]
requests=[r for r in rows if 'url' in r]
assert requests and not any(r['browser_bearer_present'] for r in requests)
state=json.loads((OUT/'after-replay.json').read_text())
assert [r['status'] for r in state['proposals']]==['executed']*3
assert [r['decided_by_principal_id'] for r in state['proposals']]==[6,7,6]
assert len(state['outbound'])==4 and all(r['status']=='delivered' and r['attempt_count']==1 for r in state['outbound'])
assert len(state['sandbox_receipts'])==4
moves=[r for r in state['movements'] if r['transfer_id']]
assert len(moves)==2 and len({r['transfer_id'] for r in moves})==1
assert state['handoffs'][0]['assigned_principal_id']==6 and state['handoffs'][0]['status']=='claimed'
assert state['appointment'][0]['state']=='cancelled'
assert all(json.loads((OUT/'no-duplicates.json').read_text())[k]['identical'] for k in ['proposals','outbound','messages','movements','sandbox_receipts','handoffs','appointment','balances'])
activity=next(r['activity_final']['body']['items'] for r in reversed(rows) if 'activity_final' in r)
for id in ['1','2','3']:
 assert any(str(r['entity_id'])==id and r['action']=='agent_proposal.approved' and r['actor_kind']=='human' for r in activity)
 assert any(str(r['entity_id'])==id and r['action']=='agent_proposal.created' and r['actor_kind']=='agent' for r in activity)
secrets_to_scan=[x['token'] for x in json.loads(envfile(FE/'.env.local')['BACKEND_DEMO_HUMANS'])]
secrets_to_scan += [envfile(FE/'.env.local')[k] for k in ['BFF_SESSION_SECRET','BFF_ACCESS_CODE']]
secrets_to_scan += [v for k,v in envfile(BE/'.env.demo.local').items() if k!='BACKEND_DEMO_HUMANS']
assets=[p for p in (FE/'.next/static').rglob('*') if p.is_file()]
files=[p for p in OUT.rglob('*') if p.is_file()]
for p in assets+files:
 raw=p.read_bytes();assert not any(s.encode() in raw for s in secrets_to_scan), 'Secret found in '+str(p)
security={'browser_bff_responses_checked':len(requests),'browser_bearer_found':False,'compiled_static_files_scanned':len(assets),'evidence_files_scanned':len(files),'secret_found':False,'same_origin_bff':True}
(OUT/'security.json').write_text(json.dumps(security,indent=2))
shas={name:subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip() for name,repo in [('backend',BE),('frontend',FE)]}
evidence={'date':'2026-10-08','verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'shas':shas,'branches':{'backend':'i0/run','frontend':'i0/run'},'environment':json.loads((OUT/'environment.json').read_text()),'journeys':{k:{'result':'PASS','scope':v} for k,v in {'J1':'Acceso por permisos; Lucía/Carlos /me,403 y cambio de persona; KPIs falsos registrados aparte','J2':'Cobranza propuesta 1, cargo 1, outbound 1, receipt sandbox 1','J3':'Inventario propuesta 2; Lucía403; Carlos aprueba; traspaso 16, dos movimientos','J4':'Cita39 cancelada <48h; job1/run3/propuesta3; outbounds2,3,4 entregados en sandbox','J5':'Feed humano/agente, cuatro conversaciones; handoff1 tomado por Lucía; fixture canónica sin LLM'}.items()},'persisted':state,'duplicate_check':json.loads((OUT/'no-duplicates.json').read_text()),'security':security,'commands':[json.loads(s) for s in (OUT/'commands.jsonl').read_text().splitlines()],'commits_created':[],'source_changes':[],'limitations':['No suite backend completa: no se modificó código; pruebas reales mediante HTTP/BFF y PostgreSQL aislado.','Los KPIs de Pacientes siguen fijos: no se certifica ausencia total de datos de demostración.','Chat conserva ASC; no se ensayaron hilos >200 mensajes.','La derivación fue preparada con request_human_handoff sobre conversación sembrada; no se ejecutó modelo.','Fallos del runner conservados: entorno unitario, selector tab, cardinalidad Backfill, campos de snapshot y claim, trace headers.'],'screenshots':[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.glob('*.png'))]}
(OUT/'evidence.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False,default=str)); print(json.dumps({'verified':True,'shas':shas,'security':security,'screenshots':len(evidence['screenshots'])},indent=2))
