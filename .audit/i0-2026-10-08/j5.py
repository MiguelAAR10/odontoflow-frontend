go('/agente');snap('j5-actividad-lucia');print('ACTIVIDAD',page.locator('main').inner_text()[:7500])
log({'activity':api('/activity?limit=100')})
go('/chat');snap('j5-chat-antes');print('CHAT',page.locator('main').inner_text()[:6000])
