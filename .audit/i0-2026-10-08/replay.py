from uuid import uuid4
# Replay the exact browser intent with the same authenticated human and key.
logs=[json.loads(s) for s in (OUT/'browser.jsonl').read_text().splitlines()]
ids={2} if ROLE=='Carlos Vega' else {1,3}
originals={}
for row in logs:
 if row.get('method')=='POST' and row.get('status')==200 and row.get('replayed') is None:
  match=re.search('/agent/proposals/(\d+)/approve',row.get('url',''))
  if match and int(match[1]) in ids: originals[int(match[1])]=row
assert set(originals)==ids,(originals,ids)
for id,row in originals.items():
 path=f'/agent/proposals/{id}/approve'
 result=api(path,'POST',row['request_body'],row['idempotency_key'])
 assert result['status']==200 and result['replayed']=='true',result
 assert result['body']['result_ref']==row['body']['result_ref'],result
 log({'approval_same_key_replay':{'id':id,**result}})
 # New key on already-executed proposal must also not duplicate the effect.
 again=api(path,'POST',row['request_body'],str(uuid4()))
 log({'approval_new_key_repeat':{'id':id,**again}})
 assert again['status'] in (200,409),again
 print('proposal',id,'same-key',result['status'],result['replayed'],'new-key',again['status'])
go('/aprobaciones');page.get_by_role('button',name='Ejecutadas',exact=True).click()
expect(page.locator('article.approval-card')).to_have_count(3)
snap('segunda-pasada-'+('carlos' if ROLE=='Carlos Vega' else 'lucia'))
assert page.get_by_role('button',name='Aprobar',exact=True).count()==0
