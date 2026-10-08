import sys,json,os
from uuid import uuid4
import httpx
from ops import BE,OUT,envfile,cleanenv,record
os.environ.clear(); os.environ.update(cleanenv());os.environ.update(envfile(BE/'.env.local'))
creds=envfile(BE/'.env.demo.local')
if sys.argv[1]=='handoff':
 body={'tool_version':'1.1','tool_name':'request_human_handoff','conversation_id':1,'request_id':str(uuid4()),'correlation_id':str(uuid4()),'idempotency_key':str(uuid4()),'arguments':{'reason_code':'requested_by_contact','reason_summary':'Ensayo I0: paciente ficticio solicita hablar con recepción.'}}
 r=httpx.post('http://127.0.0.1:8110/agent-tools/call',json=body,headers={'Authorization':'Bearer '+creds['SALES_AGENT_V0_CREDENTIAL'],'X-Request-Id':body['request_id'],'X-Correlation-Id':body['correlation_id']},timeout=30)
 result={'http_status':r.status_code,'request':body,'body':r.json(),'fixture':'Solicitud explícita mediante herramienta canónica; sin LLM. El seed no crea derivaciones.'}
 (OUT/'handoff-fixture.json').write_text(json.dumps(result,indent=2,ensure_ascii=False));print(json.dumps(result,ensure_ascii=False));assert r.status_code==200 and r.json()['status']=='success'
elif sys.argv[1]=='dispatch':
 sys.path.insert(0,str(BE))
 from integrations.sandbox.consumer import SandboxSettings,SandboxConsumer
 from dataclasses import asdict
 settings=SandboxSettings(backend_base_url='http://127.0.0.1:8110',receiver_url='http://127.0.0.1:8110/internal/sandbox/receive',credential=creds['SANDBOX_DISPATCHER_TOKEN'])
 with SandboxConsumer(settings) as consumer: result=consumer.dispatch_once(limit=20)
 safe={'claimed':result.claimed,'delivered':result.delivered,'failed':result.failed,'statuses':[s.model_dump(mode='json') for s in result.statuses]}
 (OUT/('dispatch-'+sys.argv[2]+'.json')).write_text(json.dumps(safe,indent=2));print(json.dumps(safe));assert result.failed==0
record(['sandbox_ops.py',*sys.argv[1:]],BE,0)
