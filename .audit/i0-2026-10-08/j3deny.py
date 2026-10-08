from uuid import uuid4
go('/aprobaciones'); snap('j3-lucia-sin-aprobar')
proposal=json.loads((OUT/'inventory-proposal.json').read_text())[0]
assert page.locator('article.approval-card').get_by_role('button',name='Aprobar',exact=True).count()==0
result=api('/agent/proposals/'+str(proposal['id'])+'/approve','POST',{'payload_hash':proposal['payload_hash']},str(uuid4()))
assert result['status']==403,result
log({'inventory_lucia_forbidden':result})
page.get_by_role('button',name='Ejecutadas',exact=True).click();page.wait_for_load_state('networkidle');snap('j2-cobranza-ejecutada')
print('Lucía: traspaso sin botón Aprobar; POST 403. Cobranza ejecutada visible.')
