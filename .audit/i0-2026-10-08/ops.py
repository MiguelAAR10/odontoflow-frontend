import os,sys,json,subprocess,secrets,datetime
from pathlib import Path
OF=Path('/home/miguel/projects/MiguelAR10-Builder/AI-Edge-Runners/products/odontoflow')
BE=OF/'.worktrees/backend-i0-run'; FE=OF/'.worktrees/frontend-i0-run'; OUT=FE/'.audit/i0-2026-10-08'
def envfile(p):
 return dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line and not line.startswith('#'))
def cleanenv():
 return {k:v for k,v in os.environ.items() if not any(x in k for x in ['TOKEN','SECRET','PASSWORD','DATABASE_URL','API_KEY']) and not k.startswith(('SALES_AGENT_','BACKEND_','BFF_','NEXT_PUBLIC_','SANDBOX_'))}
def env(repo):
 e=cleanenv(); e.update(envfile(repo/'.env.local')); return e
def record(command,cwd,code,log=None):
 with (OUT/'commands.jsonl').open('a') as f: f.write(json.dumps(dict(command=command,cwd=str(cwd),exit_code=code,log=log,time=datetime.datetime.now(datetime.timezone.utc).isoformat()))+'\n')
def run(command,repo,label):
 child=env(repo)
 if label.startswith('unit-tests'):
  child.pop('NEXT_PUBLIC_USE_MOCKS',None)
  child.update(VITEST_MAX_THREADS='1',VITEST_MIN_THREADS='1',VITEST_MAX_FORKS='1',VITEST_MIN_FORKS='1')
 result=subprocess.run(command,cwd=repo,env=child,capture_output=True,text=True)
 output=result.stdout+result.stderr
 # Never persist credentials or connection URLs in logs.
 import re
 for k,v in env(repo).items():
  if any(x in k for x in ['TOKEN','SECRET','PASSWORD','DATABASE_URL','API_KEY','HUMANS','ACCESS_CODE']) and v: output=output.replace(v,'[REDACTED]')
 output=re.sub(r'postgres(?:ql)?(?:\+\w+)?://[^\s\"\']+','[REDACTED_DSN]',output)
 (OUT/(label+'.log')).write_text(output); record(command,repo,result.returncode,label+'.log'); print(output[-3000:]); return result.returncode
if __name__=='__main__':
 if sys.argv[1]=='setup':
  from dotenv import dotenv_values
  from sqlalchemy.engine import make_url
  import psycopg
  from psycopg import sql
  base=make_url(dotenv_values(OF/'odontoflow-backend/.env.local')['DATABASE_URL'])
  assert base.host in ('127.0.0.1','localhost') and base.port==5434
  dbname='odontoflow_i0_20261008'; memory=dbname+'_agent'
  with psycopg.connect(host=base.host,port=base.port,user=base.username,password=base.password,dbname='postgres',autocommit=True) as conn:
   for name in (dbname,memory):
    assert not conn.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,)).fetchone(), 'DB already exists: refusing reuse'
    conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
  values={'DATABASE_URL':base.set(database=dbname).render_as_string(hide_password=False),'SALES_AGENT_DATABASE_URL':base.set(database=memory).render_as_string(hide_password=False),'APP_ENV':'development','ERP_ANONYMOUS_COMPAT':'false','REQUIRE_HTTPS':'false','API_PORT':'8110','API_HOST':'127.0.0.1','SALES_AGENT_BASE_URL':'http://127.0.0.1:8110','SANDBOX_BASE_URL':'http://127.0.0.1:8110'}
  (BE/'.env.local').write_text(''.join(f'{k}={v}\n' for k,v in values.items())); (BE/'.env.local').chmod(0o600)
  record(['create isolated databases',dbname,memory],BE,0)
  (OUT/'environment.json').write_text(json.dumps({'database':dbname,'agent_database':memory,'postgres_host':'127.0.0.1','postgres_port':5434,'backend_port':8110,'frontend_port':3110,'anchor_date':'2026-10-08','model':'none: deterministic templates','channel':'sandbox'},indent=2))
  assert run(['.venv/bin/python','-m','alembic','upgrade','head'],BE,'migrate')==0
  assert run(['.venv/bin/python','scripts/seed_demo.py','--anchor-date','2026-10-08','--issue-staff-credential'],BE,'seed')==0
  humans=envfile(BE/'.env.demo.local')['BACKEND_DEMO_HUMANS']
  fenv={'BACKEND_URL':'http://127.0.0.1:8110','BACKEND_DEMO_HUMANS':humans,'BFF_SESSION_SECRET':secrets.token_urlsafe(48),'BFF_ACCESS_CODE':secrets.token_urlsafe(18),'NEXT_PUBLIC_USE_MOCKS':'false'}
  (FE/'.env.local').write_text(''.join(f'{k}={v}\n' for k,v in fenv.items())); (FE/'.env.local').chmod(0o600)
  print('Isolated databases created and seeded; private env files written.')
 elif sys.argv[1]=='checks':
  codes=[run(cmd,FE,label) for cmd,label in [(['npm','run','typecheck'],'typecheck'),(['npm','test'],'unit-tests'),(['npm','run','build'],'build')]]
  sys.exit(max(codes))
 elif sys.argv[1]=='serve':
  repo=BE if sys.argv[2]=='backend' else FE
  cmd=['.venv/bin/python','-m','app.run'] if repo==BE else ['node','node_modules/next/dist/bin/next','start','-p','3110','-H','127.0.0.1']
  record(cmd,repo,None,sys.argv[2]+'.log'); os.chdir(repo); os.execvpe(cmd[0],cmd,env(repo))
