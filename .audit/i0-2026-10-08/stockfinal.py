go('/inventario');page.get_by_label('Sede',exact=True).select_option(label='ODONTO SMART Lince')
expect(page.locator('tr').filter(has_text='Anestesia lidocaína')).to_contain_text('20')
snap('j3-stock-lince-20-final')
