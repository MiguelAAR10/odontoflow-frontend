from datetime import datetime,timezone
a=api('/appointments/39')['body']; log({'backfill_before':a})
start=datetime.fromisoformat(a['start_utc'].replace('Z','+00:00')) if 'start_utc' in a else datetime.fromisoformat(a['start'].replace('Z','+00:00'))
assert 0 < (start-datetime.now(timezone.utc)).total_seconds() < 48*3600
page.get_by_role('button',name=re.compile('09:00 Fiorella Palomino Torres')).click();page.wait_for_load_state('networkidle');snap('j4-cita-39-antes')
page.get_by_role('button',name='Cancelar cita',exact=True).click()
page.get_by_role('dialog',name='Cancelar cita',exact=True).get_by_role('button',name='Cancelar cita',exact=True).click()
expect(page.get_by_role('dialog',name='Cancelar cita',exact=True)).to_have_count(0);page.wait_for_load_state('networkidle');snap('j4-cita-cancelada')
go('/aprobaciones')
page.locator('li.agent-run').filter(has=page.get_by_role('heading',name='Cupos liberados',exact=True)).get_by_role('button',name='Ejecutar ahora').click()
expect(page.locator('article.approval-card')).to_have_count(3)
snap('j4-backfill-propuestas')
items=api('/agent/inbox?status=pending')['body']['items']; (OUT/'backfill-proposals.json').write_text(json.dumps(items,indent=2,ensure_ascii=False))
for i in range(3):
 page.get_by_role('button',name='Aprobar',exact=True).first.click()
 expect(page.locator('article.approval-card')).to_have_count(2-i)
snap('j4-backfill-aprobadas'); print(page.locator('.success-banner').inner_text())
