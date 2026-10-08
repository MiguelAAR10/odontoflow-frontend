go('/aprobaciones'); page.get_by_role('button',name='Aprobar',exact=True).click(); expect(page.locator('.success-banner')).to_be_visible(); snap('j3-traspaso-aprobado'); print(page.locator('.success-banner').inner_text())
for location in [1,2]:
 result=api(f'/products/1/balance?location_id={location}'); log({'after_transfer_balance':result}); print(result)
go('/inventario'); snap('j3-stock-carlos')
