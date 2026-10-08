go('/aprobaciones')
expect(page.locator('article.approval-card')).to_have_count(1)
items=api('/agent/inbox?status=pending')['body']['items']; assert items[0]['payload']['entry_ids']==[1,2,3]
(OUT/'backfill-proposals.json').write_text(json.dumps(items,indent=2,ensure_ascii=False))
snap('j4-backfill-propuestas')
page.get_by_role('button',name='Aprobar',exact=True).click(); expect(page.locator('.success-banner')).to_be_visible(); snap('j4-backfill-aprobadas');print(page.locator('.success-banner').inner_text())
page.get_by_role('button',name='Ejecutadas',exact=True).click();page.wait_for_load_state('networkidle');snap('j4-bandeja-ejecutadas')
