for path,name in [('/agenda','agenda'),('/pacientes','pacientes'),('/caja','caja'),('/inventario','inventario-denegado')]:
 go(path); snap('j1-lucia-'+name)
 print(name,page.locator('main').inner_text()[:450])
denied=api('/inventory/products/1/balance?location_id=1')
log({'expected_403_probe':denied})
# Find an existing canonical inventory read rather than assuming its route.
denied=api('/products')
assert denied['status']==403,denied
log({'j1_expected_403':denied})
go('/aprobaciones')
page.locator('li.agent-run').filter(has=page.get_by_role('heading',name='Cobranza',exact=True)).get_by_role('button',name='Ejecutar ahora').click()
expect(page.locator('article.approval-card')).to_have_count(1)
snap('j2-cobranza-propuesta')
items=api('/agent/inbox?status=pending')['body']['items']; (OUT/'cobranza-proposal.json').write_text(json.dumps(items,indent=2,ensure_ascii=False))
page.get_by_role('button',name='Aprobar',exact=True).click()
expect(page.locator('.success-banner')).to_be_visible()
snap('j2-cobranza-aprobada')
print(page.locator('.success-banner').inner_text())
page.get_by_role('tab',name='Ejecutadas',exact=True).click(); page.wait_for_load_state('networkidle'); snap('j2-cobranza-ejecutada')
