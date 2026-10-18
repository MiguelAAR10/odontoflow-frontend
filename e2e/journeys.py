#!/usr/bin/env python3
"""Local no-mock browser journeys and the E1 measurement gate."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from decimal import Decimal
from statistics import median
from threading import Barrier
from urllib.parse import parse_qs, quote, urlsplit
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo


E1 = 'cobro-verificado'
JOURNEYS = ('J1', 'J2', 'J3', 'J4', 'J5', 'J6', E1)


def e1_seed(path):
    seed = json.loads(path.read_text())
    check(re.fullmatch(r'[A-Za-z0-9_-]{1,32}', seed['run_id']), 'Invalid M1 run_id')
    check(seed['sedes']['Lince'] != seed['sedes']['Miraflores'], 'M1 locations must differ')
    check(set(seed['personas']) == {'caja', 'recepcion'}, 'Missing M1 people')
    rows = seed['lotes']['pruebas'] + seed['lotes']['medicion']
    ids = [row['payment_id'] for row in rows]
    check(len(ids) == 30 and len(set(ids)) == 30 and
          all(type(pid) is int and pid > 0 for pid in ids), 'M1 needs 30 distinct payment IDs')
    tests = seed['lotes']['pruebas']
    check(len([r for r in tests if r['ruta'] == 'h1-fe3']) == 8 and
          len([r for r in tests if r['ruta'] == 'sin_referencia']) == 1 and
          len([r for r in tests if r['ruta'] == 'otra_sede']) == 1, 'Unexpected M1 pruebas batch')
    for row in rows:
        expected = seed['sedes']['Miraflores' if row['ruta'] == 'otra_sede' else 'Lince']
        check(row['location_id'] == expected, 'M1 payment in unexpected location')
    for route in ('manual', 'airi'):
        check(len([r for r in seed['lotes']['medicion'] if r['ruta'] == route]) == 10,
              'M1 needs 10 manual and 10 AIRI measurement payments')
    return seed


def measure_csv(path, seed):
    """Validate the unmodified M1 template; never fill missing human measurements."""
    with path.open(newline='', encoding='utf-8-sig') as source:
        reader = csv.DictReader(source)
        required = {'run_id', 'lote', 'payment_id', 'ruta', 'segundos', 'acciones',
                    'total_antes', 'total_despues'}
        check(required <= set(reader.fieldnames or []), 'Missing M1 CSV columns')
        rows = list(reader)
    expected = {str(r['payment_id']): r['ruta'] for r in seed['lotes']['medicion']}
    measured = [r for r in rows if r['lote'] == 'medicion']
    check(len(measured) == 20, 'Measurement requires exactly 20 medicion rows')
    check(all(r['lote'] in ('medicion', 'pruebas') for r in rows), 'Unknown M1 batch')
    check(len({r['payment_id'] for r in measured}) == 20, 'Duplicate measured payment')
    check({r['payment_id']: r['ruta'] for r in measured} == expected,
          'CSV must match the M1 medicion IDs/routes exactly; pruebas are excluded')
    for row in measured:
        check(row['run_id'] == seed['run_id'], 'Mixed measurement run_id')
        for column in ('segundos', 'acciones', 'total_antes', 'total_despues'):
            value = Decimal(row[column])
            check(value.is_finite() and value >= 0, f'Invalid {column}')
            row[column] = value
        check(row['segundos'] > 0 and row['acciones'] >= 1 and
              row['acciones'] == row['acciones'].to_integral_value(), 'Invalid time/action count')
    groups = {route: [r for r in measured if r['ruta'] == route] for route in ('manual', 'airi')}
    stats = {route: {'n': len(items), 'mediana_segundos': median(r['segundos'] for r in items),
                     'mediana_acciones': median(r['acciones'] for r in items),
                     'acciones_totales': sum(r['acciones'] for r in items)}
             for route, items in groups.items()}
    saving = 1 - stats['airi']['mediana_segundos'] / stats['manual']['mediana_segundos']
    checks = {'tiempo': saving >= Decimal('0.20'),
              'acciones': stats['airi']['mediana_acciones'] <= stats['manual']['mediana_acciones'] and
                          stats['airi']['acciones_totales'] <= stats['manual']['acciones_totales'],
              'total_recibido': all(r['total_antes'] == r['total_despues'] for r in measured)}
    return {'run_id': seed['run_id'], 'csv_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'rutas': stats, 'reduccion_tiempo': saving, 'checks': checks,
            'payment_ids': sorted(int(pid) for pid in expected)}


def envfile(path):
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        # Seed env files contain raw JSON; shell-quoted env files are supported too.
        if value.startswith(("'", '"')):
            value = shlex.split(value)[0]
        values[key] = value
    return values


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + '\n')
    temporary.replace(path)


class Journeys:
    TABLES = {'proposals': 'agent_proposals', 'outbounds': 'outbound_messages',
              'messages': 'messages', 'movements': 'inventory_movements',
              'receipts': 'command_receipts', 'sandbox_receipts': 'sandbox_delivery_receipts',
              'handoffs': 'reception_handoffs', 'conversations': 'conversations',
              'appointments': 'appointments'}

    def __init__(self, args):
        from sqlalchemy import create_engine
        self.args = args
        self.root = args.run_dir.resolve()
        self.env = envfile(self.root / 'env')
        check(self.env.get('APP_ENV') == 'development', 'APP_ENV must be development')
        for url in (args.base, args.api):
            parsed = urlsplit(url)
            check(parsed.hostname in ('localhost', '127.0.0.1', '::1') and
                  parsed.scheme == 'http' and not parsed.username, 'Only local HTTP origins allowed')
        check((self.root / 'env').stat().st_mode & 0o077 == 0, 'env must be private (chmod 600)')
        check(args.measure_csv is not None or not (self.root / 'journeys.json').exists(),
              'Use a new RUN_ID, not an existing journey run')
        self.e1 = E1 in args.journeys.split(',') or args.measure_csv is not None
        self.TABLES = dict(self.TABLES)
        if self.e1:
            from sqlalchemy.engine import make_url
            database = make_url(self.env['DATABASE_URL'])
            check(database.host == '127.0.0.1' and database.port == 5434 and
                  database.database == args.e1_db and
                  re.fullmatch(r'[a-z0-9_]{1,63}', args.e1_db) and 'e1' in args.e1_db.split('_'),
                  'E1 requires the selected isolated E1 database on 127.0.0.1:5434')
            check(self.env.get('NEXT_PUBLIC_USE_MOCKS') == 'false', 'E1 requires NEXT_PUBLIC_USE_MOCKS=false')
            self.seed = e1_seed(args.seed_summary or self.root / 'e1-seed.json')
            self.TABLES.update(payments='payments', reversals='payment_reversals', audit='audit_events')
            if not args.measure_csv:
                for key in ('BFF_ACCESS_CODE', 'SALES_AGENT_V0_CREDENTIAL', 'E1_OTHER_HUMAN_CREDENTIAL', 'E1_BACKEND_DIR'):
                    check(self.env.get(key), f'Missing E1 fixture setting: {key}')
                other = e1_seed(args.other_seed_summary or self.root / 'e1-other-seed.json')
                check(other['organization_id'] != self.seed['organization_id'], 'Other-organization fixture is the same tenant')
        self.engine = create_engine(self.env['DATABASE_URL'])
        self.shots = self.root / 'shots'
        self.shots.mkdir(exist_ok=True)
        self.result = {'base': args.base, 'api': args.api, 'journeys': {}, 'intents': [],
                       'responses': [], 'replay': {}, 'started_at': datetime.now(timezone.utc).isoformat()}
        self.person = None
        self.session_epoch = 0
        self.requests = {}
        self.inventory = None
        self.page_errors = []
        self.capture_intents = not self.e1

    def redact(self, value):
        value = str(value)
        for key, secret in self.env.items():
            if secret and any(word in key for word in ('TOKEN', 'SECRET', 'CODE', 'CREDENTIAL', 'URL', 'HUMANS')):
                value = value.replace(secret, '[REDACTED]')
        return re.sub(r'postgres(?:ql)?(?:\+\w+)?://\S+', '[REDACTED_DSN]', value)

    def sql(self, query, params=None):
        from sqlalchemy import text
        with self.engine.connect() as connection:
            connection.exec_driver_sql('SET TRANSACTION READ ONLY')
            return [dict(row) for row in connection.execute(text(query), params or {}).mappings()]

    def snapshot(self):
        # Full persisted rows, including receipts and assignment, in a single consistent transaction.
        from sqlalchemy import text
        with self.engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
            connection.exec_driver_sql('SET TRANSACTION READ ONLY')
            rows = {key: [dict(row) for row in connection.execute(text(f'SELECT * FROM {table} ORDER BY id')).mappings()]
                    for key, table in self.TABLES.items()}
        return json.loads(json.dumps(rows, default=str))

    def on_request(self, request):
        if '/api/backend/' in request.url:
            self.requests[request] = (self.person, self.session_epoch)

    def on_response(self, response):
        if '/api/backend/' not in response.url:
            return
        request = response.request
        check('authorization' not in request.headers, 'Browser exposed a bearer credential')
        requested_as, requested_epoch = self.requests.get(request, (None, -1))
        row = {'path': urlsplit(response.url).path, 'method': request.method, 'status': response.status,
               'requested_as': requested_as, 'received_as': self.person,
               'requested_epoch': requested_epoch, 'received_epoch': self.session_epoch}
        self.result['responses'].append(row)
        if self.capture_intents and request.method == 'POST' and re.search(r'/(approve|claim|verification-review)$', row['path']) and response.status in (200, 201):
            if response.headers.get('idempotent-replay') != 'true':
                key = request.headers.get('idempotency-key')
                check(key and UUID(key).version == 4, 'Mutation must use UUIDv4')
                if not any(x['key'] == key for x in self.result['intents']):
                    self.result['intents'].append({'path': row['path'].removeprefix('/api/backend'),
                                                   'body': request.post_data_json, 'key': key,
                                                   'person': self.person, 'result': response.json()})

    def api(self, path, method='GET', body=None, key=None):
        return self.page.evaluate('''async ({path,method,body,key}) => {
          const r = await fetch('/api/backend'+path, {method, headers: {'Content-Type':'application/json',
            ...(key ? {'Idempotency-Key':key}: {})}, ...(body !== null ? {body:JSON.stringify(body)}: {})});
          return {status:r.status, body:await r.json(), replay:r.headers.get('idempotent-replay')};
        }''', dict(path=path, method=method, body=body, key=key))

    def get(self, path):
        result = self.api(path)
        check(result['status'] == 200, f'GET {path}: {result}')
        return result['body']

    def go(self, path):
        response = self.page.goto(self.args.base.rstrip('/') + path, wait_until='networkidle')
        check(response.ok, f'Navigation {path} failed')

    def choose(self, person):
        from playwright.sync_api import expect
        if self.person == person:
            return self.get('/me')
        previous = self.person
        start = len(self.result['responses'])
        # Observe before the first action that invalidates the old session.
        # Epochs also distinguish logout/login of the same named person.
        if self.page.get_by_role('heading', name='Elige quién eres', exact=True).count() == 0:
            self.page.get_by_role('button', name=re.compile('Cambiar de persona')).click()
        code = self.page.get_by_label('Código de acceso')
        if code.count():
            code.fill(self.env['BFF_ACCESS_CODE'])
        self.session_epoch += 1
        self.person = person
        self.page.get_by_role('button', name=re.compile(person)).last.click()
        self.page.wait_for_load_state('networkidle')
        expect(self.page.get_by_role('heading', name='Elige quién eres', exact=True)).to_have_count(0)
        expect(self.page.locator('.persona-switcher__text')).to_contain_text(person)
        self.page.wait_for_timeout(2000)
        late = self.late_responses(start)
        self.result.setdefault('session_switches', []).append({'from': previous, 'to': person, 'wait_ms': 2000, 'late_responses': len(late),
                                                            'response_start': start, 'response_end': len(self.result['responses']),
                                                            'epoch': self.session_epoch})
        check(not late, f'Late responses from previous session: {late}')
        me = self.get('/me')
        check(me['principal']['display_name'] == person and me['principal']['type'] == 'human', f'Wrong /me: {me}')
        return me

    def late_responses(self, start):
        return [row for row in self.result['responses'][start:]
                if row['requested_epoch'] != self.session_epoch]

    def logout(self):
        from playwright.sync_api import expect
        start = len(self.result['responses'])
        self.session_epoch += 1
        self.person = None
        self.page.evaluate("async () => { await fetch('/api/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:null})}); }")
        check(self.api('/me')['status'] == 401, 'Logout must return 401')
        self.go('/agenda')
        expect(self.page.get_by_role('heading', name='Elige quién eres', exact=True)).to_be_visible()
        self.page.wait_for_timeout(2000)
        late = self.late_responses(start)
        receipt = {'status': 401, 'wait_ms': 2000, 'late_responses': len(late),
                   'response_start': start, 'response_end': len(self.result['responses']),
                   'epoch': self.session_epoch}
        self.result['journeys']['J1']['logout'] = receipt
        check(not late, f'Late backend responses after logout: {late}')
        return receipt

    def snap(self, journey, step):
        relative = f'shots/{journey}-{step}'
        self.page.screenshot(path=str(self.root / (relative + '.png')), full_page=True)
        (self.root / (relative + '.txt')).write_text(self.redact(self.page.locator('body').inner_text()))
        self.result['journeys'][journey]['shots'].append({'image': relative + '.png', 'text': relative + '.txt',
                                                                  'sha256': hashlib.sha256((self.root / (relative + '.png')).read_bytes()).hexdigest()})

    def run_agent(self, label, kind):
        from playwright.sync_api import expect
        self.go('/aprobaciones')
        agent = self.page.locator('li.agent-run').filter(has=self.page.get_by_role('heading', name=label, exact=True))
        agent.get_by_role('button', name='Ejecutar ahora').click()
        expect(agent.locator('.agent-run__status')).to_have_text(re.compile('Listo'))
        self.page.wait_for_load_state('networkidle')
        expect(self.page.locator('article.approval-card')).not_to_have_count(0)
        items = [x for x in self.get('/agent/inbox?status=pending')['items'] if x['kind'] == kind]
        check(len(items) == 1, f'Expected one {kind} proposal, got {len(items)}')
        return items[0]

    def card(self, proposal):
        return self.page.locator('article.approval-card').filter(has_text={'inventory_transfer': 'Inventario', 'collection_reminder': 'Cobranza', 'waitlist_offer': 'Lista de espera'}[proposal['kind']])

    def approve(self, proposal):
        from playwright.sync_api import expect
        with self.page.expect_response(lambda r: r.request.method == 'POST' and r.url.endswith(f"/proposals/{proposal['id']}/approve")) as response:
            self.card(proposal).get_by_role('button', name='Aprobar', exact=True).click()
        check(response.value.status == 200, f'Approval failed: {response.value.status}')
        expect(self.page.locator('.success-banner')).to_be_visible()
        body = response.value.json()
        check(body['status'] == 'executed', f'Approval not executed: {body}')
        return body

    def dispatch(self, outbound_ids):
        import httpx
        def post(path, body):
            request_id = str(uuid4())
            response = httpx.post(self.args.api.rstrip('/') + path, json=body, headers={
                'Authorization': 'Bearer ' + self.env['SANDBOX_DISPATCHER_TOKEN'],
                'Idempotency-Key': str(uuid4()), 'X-Request-Id': request_id, 'X-Correlation-Id': request_id}, timeout=30)
            check(200 <= response.status_code < 300, f'Sandbox {path}: HTTP {response.status_code}')
            return response.json()
        items = post('/internal/outbound/claim', {'limit': 50, 'provider': 'sandbox'})
        check({x['outbound_id'] for x in items} == set(outbound_ids), 'Unexpected sandbox queue; use isolated DB')
        for item in items:
            receipt = post('/internal/sandbox/receive', {'outbound_id': item['outbound_id'], 'payload': item['payload']})
            check(receipt['provider_message_id'] == f"sandbox-{item['outbound_id']}", 'Invalid sandbox receipt')
            settled = post(f"/internal/outbound/{item['outbound_id']}/result", {
                'outcome': 'delivered', 'provider_message_id': receipt['provider_message_id']})
            check(settled['status'] == 'delivered', 'Outbound not delivered')
        state = self.snapshot()
        for oid in outbound_ids:
            outbound = next(x for x in state['outbounds'] if x['id'] == oid)
            check(outbound['status'] == 'delivered' and outbound['attempt_count'] == 1, 'Delivery not exactly once')
            check(sum(x['outbound_id'] == oid for x in state['sandbox_receipts']) == 1, 'Missing/duplicate receipt')
            check(next(x for x in state['messages'] if x['id'] == outbound['message_id'])['delivery_status'] == 'delivered', 'Message not delivered')
        return {'claimed': len(items), 'delivered': len(items), 'failed': 0, 'outbound_ids': outbound_ids}

    def chat_effect(self, outbound_id):
        state = self.snapshot()
        outbound = next(x for x in state['outbounds'] if x['id'] == outbound_id)
        message = next(x for x in state['messages'] if x['id'] == outbound['message_id'])
        self.go('/chat')
        # Backfill sends identical text to multiple contacts; resolve the conversation by ID.
        conversation = next(x for x in self.get('/conversations?limit=100')['items'] if x['id'] == outbound['conversation_id'])
        self.page.locator('button.conversation-item').filter(has_text=conversation['contact_display_name']).click()
        from playwright.sync_api import expect
        expect(self.page.locator('.message-panel')).to_contain_text(message['body_text'])
        return outbound['conversation_id']

    def J1(self):
        from playwright.sync_api import expect
        self.choose('Lucía Ramos')
        self.snap('J1', 'antes')
        check(self.api('/products')['status'] == 403, 'Lucía inventory read must be denied')
        self.choose('Carlos Vega')
        for path in ('/agenda', '/pacientes', '/caja', '/inventario'):
            self.go(path)
            check('No tienes permisos' not in self.page.locator('main').inner_text(), f'Carlos denied {path}')
        self.inventory = self.run_agent('Inventario', 'inventory_transfer')
        self.choose('Lucía Ramos')
        self.go('/aprobaciones')
        expect(self.card(self.inventory)).to_be_visible()
        check(self.card(self.inventory).get_by_role('button', name='Aprobar', exact=True).count() == 0, 'Lucía sees Approve')
        denied = self.api(f"/agent/proposals/{self.inventory['id']}/approve", 'POST',
                          {'payload_hash': self.inventory['payload_hash']}, str(uuid4()))
        check(denied['status'] == 403, f'Expected approval 403: {denied}')
        me = self.get('/me')
        check(me['principal']['display_name'] == 'Lucía Ramos', '403 destroyed session')
        self.result['journeys']['J1'].update(proposal_id=self.inventory['id'], denied=denied, me_after_403=me)
        self.snap('J1', 'rechazo')
        self.result['journeys']['J1']['logout'] = self.logout()
        self.snap('J1', 'efecto')
        self.choose('Lucía Ramos')

    def J2(self):
        self.choose('Lucía Ramos')
        proposal = self.run_agent('Cobranza', 'collection_reminder')
        self.snap('J2', 'antes')
        approved = self.approve(proposal)
        self.snap('J2', 'aprobacion')
        dispatch = self.dispatch([approved['result_ref']['id']])
        conversation = self.chat_effect(approved['result_ref']['id'])
        self.snap('J2', 'efecto')
        self.result['journeys']['J2'].update(proposal=proposal, approved=approved, dispatch=dispatch, conversation_id=conversation)

    def J3(self):
        self.choose('Carlos Vega')
        proposal = self.inventory
        check(proposal is not None, 'J3 requires J1 preparation')
        self.go('/aprobaciones')
        payload = proposal['payload']
        product = payload['product_id']
        origin, destination = payload['origin_location_id'], payload['destination_location_id']
        def balance(location):
            return Decimal(self.get(f'/products/{product}/balance?location_id={location}')['available'])
        before = [balance(origin), balance(destination)]
        self.snap('J3', 'antes')
        approved = self.approve(proposal)
        self.snap('J3', 'aprobacion')
        after = [balance(origin), balance(destination)]
        q = Decimal(payload['quantity'])
        check(after == [before[0] - q, before[1] + q], 'Transfer balances do not match proposal')
        movements = [x for x in self.snapshot()['movements'] if str(x['transfer_id']) == str(approved['result_ref']['id'])]
        check(len(movements) == 2 and {x['type'] for x in movements} == {'TRANSFER_IN', 'TRANSFER_OUT'}, 'Invalid transfer ledger')
        self.go('/inventario')
        self.snap('J3', 'efecto')
        self.result['journeys']['J3'].update(proposal=proposal, approved=approved, before=before, after=after, movements=movements)

    def J4(self):
        from playwright.sync_api import expect
        from zoneinfo import ZoneInfo
        self.choose('Lucía Ramos')
        rows = self.sql("SELECT a.*, p.full_name FROM appointments a JOIN patients p ON p.id=a.patient_id AND p.organization_id=a.organization_id WHERE p.full_name='Fiorella Palomino Torres' AND a.state='confirmed' AND a.start_utc > now() AND a.start_utc < now() + interval '48 hours' ORDER BY a.id")
        check(len(rows) == 1, 'Missing unique I0 Backfill demo appointment')
        appointment = rows[0]
        hours = (appointment['start_utc'] - datetime.now(timezone.utc)).total_seconds() / 3600
        check(0 < hours < 48, f'Cancellation outside 48h: {hours}')
        local = appointment['start_utc'].astimezone(ZoneInfo('America/Lima'))
        self.go('/agenda')
        self.page.get_by_label('Mes del calendario').fill(local.strftime('%Y-%m'))
        self.page.get_by_role('button', name='Ir al ' + local.strftime('%Y-%m-%d'), exact=True).click()
        self.page.get_by_role('button', name=re.compile(local.strftime('%H:%M') + ' ' + appointment['full_name'])).click()
        self.snap('J4', 'antes')
        self.page.get_by_role('button', name='Cancelar cita', exact=True).click()
        self.page.get_by_role('dialog', name='Cancelar cita', exact=True).get_by_role('button', name='Cancelar cita', exact=True).click()
        expect(self.page.get_by_role('dialog', name='Cancelar cita', exact=True)).to_have_count(0)
        check(self.get(f"/appointments/{appointment['id']}")['state'] == 'cancelled', 'Cancellation not persisted')
        proposal = self.run_agent('Cupos liberados', 'waitlist_offer')
        approved = self.approve(proposal)
        self.snap('J4', 'aprobacion')
        outbounds = approved['result_ref']['outbound_ids']
        check(len(outbounds) == len(proposal['payload']['entry_ids']) and outbounds, 'Backfill recipients mismatch')
        dispatch = self.dispatch(outbounds)
        self.chat_effect(outbounds[0])
        self.snap('J4', 'efecto')
        self.result['journeys']['J4'].update(appointment_id=appointment['id'], hours_before=hours, proposal=proposal, approved=approved, dispatch=dispatch)

    def J5(self):
        import httpx
        from playwright.sync_api import expect
        self.choose('Lucía Ramos')
        self.go('/agente')
        expect(self.page.get_by_role('heading', name='Actividad', exact=True)).to_be_visible()
        # Follow UI pagination until earlier approvals are visible.
        for _ in range(30):
            if 'aprobó una propuesta del agente de Cobranza' in self.page.locator('main').inner_text():
                break
            more = self.page.get_by_role('button', name='Cargar más', exact=True).first
            if not more.count():
                break
            more.click()
            self.page.wait_for_load_state('networkidle')
        if 'J2' in self.result['journeys']:
            expect(self.page.locator('main')).to_contain_text('aprobó una propuesta del agente de Cobranza')
        activity = self.get('/activity?limit=100')['items']
        for intent in self.result['intents']:
            if intent['path'].endswith('/approve'):
                pid = intent['path'].split('/')[-2]
                for action, actor in (('agent_proposal.created', 'agent'), ('agent_proposal.approved', 'human')):
                    check(any(str(x['entity_id']) == pid and x['action'] == action and x['actor_kind'] == actor for x in activity), f'Activity missing {action} {pid}')
        self.snap('J5', 'antes')
        pending = self.get('/handoffs?status=pending')['items']
        if not pending:
            conversation = self.result['journeys'].get('J2', {}).get('conversation_id')
            if conversation is None:
                conversations = self.sql('SELECT id FROM conversations ORDER BY id')
                check(conversations, 'No sandbox conversation for handoff')
                conversation = conversations[0]['id']
            request_id = str(uuid4())
            body = {'tool_version': '1.1', 'tool_name': 'request_human_handoff', 'conversation_id': conversation,
                    'request_id': request_id, 'correlation_id': request_id, 'idempotency_key': str(uuid4()),
                    'arguments': {'reason_code': 'requested_by_contact', 'reason_summary': '[DEMO E2E1] Paciente sintético solicita recepción; sin LLM.'}}
            response = httpx.post(self.args.api + '/agent-tools/call', json=body, headers={
                'Authorization': 'Bearer ' + self.env['SALES_AGENT_V0_CREDENTIAL'],
                'X-Request-Id': request_id, 'X-Correlation-Id': request_id}, timeout=30)
            check(response.status_code == 200 and response.json()['status'] == 'success', 'Handoff fixture failed')
            self.result['journeys']['J5']['fixture'] = {'request': body, 'result': response.json()}
            pending = self.get('/handoffs?status=pending')['items']
        check(len(pending) == 1, 'Expected one pending demo handoff')
        handoff = pending[0]
        self.go('/chat')
        self.page.get_by_role('button', name=re.compile('Derivaciones')).click()
        expect(self.page.locator('.handoff-queue')).to_be_visible()
        self.snap('J5', 'aprobacion')
        with self.page.expect_response(lambda r: r.request.method == 'POST' and r.url.endswith(f"/handoffs/{handoff['id']}/claim")) as response:
            self.page.locator('.handoff-queue').get_by_role('button', name='Tomar', exact=True).click()
        check(response.value.status == 200, 'Claim failed')
        expect(self.page.locator('.chat-page__notice')).to_contain_text('Tomaste')
        me = self.get('/me')
        claimed = next(x for x in self.get('/handoffs?status=claimed')['items'] if x['id'] == handoff['id'])
        check(claimed['claimed_by_display_name'] == me['principal']['display_name'], 'Wrong assignee')
        self.go('/chat')
        self.page.locator('button.conversation-item').filter(has_text=handoff['contact_display_name']).click()
        expect(self.page.locator('.message-panel')).to_contain_text('La atiende ' + me['principal']['display_name'])
        assigned = next(x for x in self.snapshot()['conversations'] if x['id'] == handoff['conversation_id'])
        check(assigned['assigned_principal_id'] == me['principal']['id'], 'Assignment did not persist')
        self.snap('J5', 'efecto')
        self.result['journeys']['J5'].update(handoff=claimed, conversation_id=handoff['conversation_id'], activity=activity)

    def J6(self):
        me = self.choose('Carlos Vega')
        check('audit.read' in me['permissions'], 'Carlos requires audit.read for Productividad')
        self.result['journeys']['J6']['persona'] = me['principal']['display_name']
        routes = []
        for path in ('/caja', '/productividad', '/configuracion', '/home', '/chat'):
            row = {'path': path, 'result': 'FAIL'}
            start = len(self.result['responses'])
            error_start = len(self.page_errors)
            try:
                self.go(path)
                main = self.page.locator('main').inner_text()
                check('No tienes permisos' not in main, f'Carlos denied {path}')
                errors = [r for r in self.result['responses'][start:] if r['status'] >= 400]
                check(not errors, f'Backend errors on {path}: {errors}')
                check(not self.page_errors[error_start:], f'Browser errors on {path}: {self.page_errors[error_start:]}')
                row['result'] = 'PASS'
            except Exception as error:
                row['error'] = self.redact(error)
            self.snap('J6', path.strip('/'))
            routes.append(row)
        self.result['journeys']['J6']['routes'] = routes
        check(all(row['result'] == 'PASS' for row in routes), f'J6 route failures: {routes}')

    def e1_proof(self, payment_id):
        state = self.snapshot()
        payment = [p for p in state['payments'] if p['id'] == payment_id]
        check(len(payment) == 1, f'Missing seeded payment {payment_id}')
        reversals = [r for r in state['reversals'] if r['payment_id'] == payment_id]
        payment[0]['reversed_at'] = reversals[0]['reversed_at'] if reversals else None
        events = [e for e in state['audit'] if e['entity_type'] == 'payment' and
                  e['entity_id'] == str(payment_id)]
        return {'payment': payment[0], 'events': events, 'reversals': reversals}

    def e1_membership(self, active):
        """Local IAM fixture through its public service, never direct SQL writes."""
        backend = Path(self.env['E1_BACKEND_DIR'])
        python = Path(self.env.get('E1_BACKEND_PYTHON', str(backend / '.venv/bin/python')))
        check(backend.is_absolute() and python.is_absolute(), 'IAM fixture paths must be absolute')
        script = '''import sys
from sqlalchemy import select
from app.db import SessionLocal
from app.iam.models import Membership
from app.iam.service import set_membership_active
with SessionLocal() as session:
    membership = session.scalar(select(Membership).where(
        Membership.organization_id == int(sys.argv[1]), Membership.principal_id == int(sys.argv[2])))
    active = sys.argv[3] == 'true'
    assert membership is not None and (active or membership.is_active), 'Unexpected membership fixture state'
    if membership.is_active != active:
        set_membership_active(session, membership.id, active)
'''
        completed = subprocess.run([str(python), '-c', script, str(self.seed['organization_id']),
                                    str(self.seed['personas']['caja']), str(active).lower()], cwd=backend,
                                   env={**os.environ, **self.env, 'PYTHONDONTWRITEBYTECODE': '1'},
                                   capture_output=True, text=True, timeout=30)
        check(completed.returncode == 0, 'IAM fixture failed: ' + self.redact(completed.stderr))

    def e1_request(self, path, body=None, key=None, method='POST'):
        key = key or (str(uuid4()) if method == 'POST' else None)
        response = self.api(path, method, body, key)
        self.result['journeys'][E1].setdefault('requests', []).append(
            {'path': path, 'method': method, 'body': body, 'key': key,
             'person': self.person, 'response': response})
        return response

    def e1_http_session(self):
        """Copy the current signed BFF cookie into an independent local client."""
        import httpx
        cookies = httpx.Cookies()
        for cookie in self.page.context.cookies([self.args.base]):
            cookies.set(cookie['name'], cookie['value'], domain=cookie['domain'], path=cookie['path'])
        origin = urlsplit(self.args.base)
        return httpx.Client(base_url=self.args.base.rstrip('/'), cookies=cookies, timeout=30,
                            headers={'Origin': f'{origin.scheme}://{origin.netloc}'})

    @contextmanager
    def e1_control_session(self, *, permissions=(), restore_path=None):
        previous = self.person
        try:
            me = self.choose(self.env.get('E1_CONTROL_PERSONA', 'Carlos Vega'))
            check(me['organization']['id'] == self.seed['organization_id'] and
                  me['principal']['type'] == 'human' and
                  me['principal']['id'] != self.seed['personas']['caja'] and
                  'payments.reverse' in me['permissions'], 'Control human must be authorized to reverse')
            check(set(permissions) <= set(me['permissions']),
                  'Control human lacks the required organization-wide read permissions')
            with self.e1_http_session() as control:
                identity = control.get('/api/backend/me')
                check(identity.status_code == 200 and identity.json() == me, 'Control BFF identity differs from /me')
                yield control, me
        finally:
            try:
                # Leave Dirección/Rastro before restoring a location-only identity:
                # switching personas remounts the current page and repeats its reads.
                if restore_path:
                    self.go(restore_path)
            finally:
                self.choose(previous)

    def e1_http_post(self, client, request, principal_id):
        response = client.post('/api/backend' + request['path'],
                               headers={'Idempotency-Key': request['key']},
                               **({'json': request['body']} if request.get('body') is not None else {}))
        return {'status': response.status_code, 'body': response.json(),
                'replay': response.headers.get('idempotent-replay'), 'principal_id': principal_id}

    def e1_reverse(self, payment_id):
        request = {'path': f'/payments/{payment_id}/reverse', 'key': str(uuid4()),
                   'body': {'reason': 'E1 synthetic stale proposal'}}
        with self.e1_control_session() as (control, me):
            response = self.e1_http_post(control, request, me['principal']['id'])
        self.result['journeys'][E1].setdefault('requests', []).append(
            {**request, 'method': 'POST', 'response': response})
        return response

    def e1_reversal_race(self, payment_id, proposal):
        requests = [
            {'path': f'/payments/{payment_id}/reverse', 'key': str(uuid4()),
             'body': {'reason': 'E1 synthetic race'}},
            {'path': f'/agent/proposals/{proposal["id"]}/approve', 'key': str(uuid4()),
             'body': {'payload_hash': proposal['payload_hash']}}]
        with self.e1_control_session() as (control, me):
            self.choose(f'E1 sintético {self.seed["run_id"]} · caja')
            # Keep the administrator's cookie independent of the browser's switch back to Caja.
            identity = control.get('/api/backend/me')
            check(identity.status_code == 200 and identity.json() == me, 'Race lost its independent control identity')
            with self.e1_http_session() as cashier:
                identity = cashier.get('/api/backend/me')
                check(identity.status_code == 200 and
                      identity.json()['principal']['id'] == self.seed['personas']['caja'], 'Race approver must be M1 Caja')
                start = Barrier(2)

                def post(client, request, principal_id):
                    start.wait(timeout=30)
                    return self.e1_http_post(client, request, principal_id)

                with ThreadPoolExecutor(max_workers=2) as executor:
                    reversal = executor.submit(post, control, requests[0], me['principal']['id'])
                    approval = executor.submit(post, cashier, requests[1], self.seed['personas']['caja'])
                    results = [reversal.result(timeout=35), approval.result(timeout=35)]
        self.result['journeys'][E1].setdefault('concurrent_requests', []).append(
            {'requests': requests, 'responses': results})
        return results

    def e1_parallel(self, requests):
        result = self.page.evaluate('''async requests => Promise.all(requests.map(async q => {
          const r = await fetch('/api/backend'+q.path, {method:'POST',
            headers:{'Content-Type':'application/json','Idempotency-Key':q.key},
            ...(q.body == null ? {} : {body:JSON.stringify(q.body)})});
          return {status:r.status, body:await r.json(), replay:r.headers.get('idempotent-replay')};
        }))''', requests)
        self.result['journeys'][E1].setdefault('concurrent_requests', []).append(
            {'requests': requests, 'responses': result})
        return result

    def e1_prepare(self, payment_id):
        response = self.e1_request(f'/payments/{payment_id}/verification-review')
        check(response['status'] in (200, 201), f'Prepare rejected: {response}')
        proposal = response['body']['proposal']
        check(proposal['kind'] == 'payment_verify' and
              proposal['payload']['payment_ids'] == [payment_id], 'Wrong payment proposal')
        return proposal

    def e1_rejected(self, response, statuses=(403,), code=None, reason=None):
        check(response['status'] in statuses, f'Expected rejection {statuses}: {response}')
        error = response['body'].get('error', {})
        if code:
            check(error.get('code') == code, f'Wrong error code: {response}')
        if reason:
            check(error.get('details', {}).get('reason') == reason, f'Wrong error reason: {response}')

    def e1_direction(self):
        from playwright.sync_api import expect
        self.go('/direccion')
        self.page.reload(wait_until='networkidle')
        row = self.page.locator('tr[data-sede="Lince"]')
        expect(row).to_be_visible()
        state = self.get('/state')
        check(datetime.fromisoformat(state['cut_at']).astimezone(ZoneInfo('America/Lima')).date().isoformat()
              == self.seed['dia_lima'], 'Direction and M1 must use the same Lima day')
        sede = next(s for s in state['sedes'] if s['name'] == 'Lince')
        check(sede['complete'], 'Direction has an incomplete Lince cash projection')
        # Check rendered amounts against the real projection, rather than accepting API-only evidence.
        for label, value in (('Cobrado verificado', sede['collected']['amount_cents']),
                             ('Por verificar', sede['pending_verification']['amount_cents'])):
            rendered = row.locator(f'[data-label="{label}"]').inner_text().replace('\xa0', ' ')
            amount = re.search(r'([\d,]+\.\d{2})', rendered)
            check(amount and Decimal(amount[1].replace(',', '')) * 100 == value,
                  f'Direction UI differs from its projection: {label} {rendered}')
        return {'location_id': self.seed['sedes']['Lince'], 'dia_lima': self.seed['dia_lima'],
                'cut_at': state['cut_at'], 'verified': sede['collected']['amount_cents'],
                'pending': sede['pending_verification']['amount_cents']}

    def e1_trail(self, proposal_id, payment_id):
        from playwright.sync_api import expect
        self.go('/agente')
        self.page.reload(wait_until='networkidle')
        items, cursor = [], None
        for _ in range(100):
            page = self.get('/activity?limit=100' + ('&cursor=' + quote(cursor, safe='') if cursor else ''))
            items.extend(page['items'])
            cursor = page['next_cursor']
            if not cursor:
                break
        expected = [('agent_proposal.created', proposal_id, 'agent'),
                    ('agent_proposal.approved', proposal_id, 'human'),
                    ('payment.verified', payment_id, 'human')]
        evidence = []
        for action, entity_id, actor in expected:
            matches = [i for i in items if i['action'] == action and str(i['entity_id']) == str(entity_id)]
            check(len(matches) == 1, f'Activity missing/duplicated {action} {entity_id}')
            event = matches[0]
            check(event['actor_kind'] == actor and event['location_id'] == self.seed['sedes']['Lince'] and
                  event['occurred_at'], f'Wrong activity attribution: {event}')
            if actor == 'human':
                check(event['actor_principal_id'] == self.seed['personas']['caja'], 'Wrong approving cashier')
            else:
                check(event['agent_key'] == 'airi', 'Proposal not attributed to AIRI')
            datetime.fromisoformat(event['occurred_at'])
            evidence.append(event)
        for _ in range(100):
            if all(self.page.locator('.activity-entry').filter(has_text=e['actor_display_name'])
                   .filter(has=self.page.locator(f'time[datetime="{e["occurred_at"]}"]')).count()
                   for e in evidence):
                break
            more = self.page.get_by_role('button', name='Cargar más', exact=True).first
            check(more.count(), 'Activity events are absent from the rendered trail')
            more.click()
            self.page.wait_for_load_state('networkidle')
        for event in evidence:
            expect(self.page.locator('.activity-entry').filter(has_text=event['actor_display_name'])
                   .filter(has=self.page.locator(f'time[datetime="{event["occurred_at"]}"]'))).not_to_have_count(0)
        expect(self.page.locator('main')).to_contain_text('verificó un pago')
        return evidence

    def cobro_verificado(self):
        from playwright.sync_api import expect
        row = self.result['journeys'][E1]
        row.update(run_id=self.seed['run_id'], cases={})
        cases = row['cases']
        fixtures = self.seed['lotes']['pruebas']
        regular = [p for p in fixtures if p['ruta'] == 'h1-fe3']
        medicion_ids = {p['payment_id'] for p in self.seed['lotes']['medicion']}
        initial = [p for p in self.snapshot()['payments'] if p['id'] in medicion_ids]
        for fixture in fixtures:
            proof = self.e1_proof(fixture['payment_id'])
            check(proof['payment']['verification_status'] == 'unverified' and
                  proof['payment']['reversed_at'] is None and
                  not any(e['action'] == 'payment.verified' for e in proof['events']),
                  'Use a fresh M1 run; pruebas was already consumed')
            check(proof['payment']['organization_id'] == self.seed['organization_id'] and
                  proof['payment']['charge_id'] == fixture['charge_id'] and
                  proof['payment']['reference'] == fixture['reference'], 'M1 JSON does not match the database')
        name = f'E1 sintético {self.seed["run_id"]} · caja'
        me = self.choose(name)
        location_permissions = me.get('location_permissions', [])
        lince_permissions = {code for grant in location_permissions
                             if grant['location_id'] == self.seed['sedes']['Lince']
                             for code in grant['permissions']}
        global_permissions = set(me.get('permissions', []))
        all_location_permissions = {code for grant in location_permissions
                                    for code in grant['permissions']}
        required_permissions = {'locations.read', 'charges.read', 'payments.read',
                                'payments.manage', 'proposals.read', 'proposals.decide'}
        forbidden_permissions = {'payments.reverse'}
        check(me['principal']['id'] == self.seed['personas']['caja'] and
              required_permissions <= lince_permissions and
              not global_permissions and
              not (forbidden_permissions & (global_permissions | all_location_permissions)),
              'M1 Caja requires the Lince journey permissions, no global grants or reversal permission')
        control_reads = ('locations.read', 'payments.read', 'proposals.read')
        with self.e1_control_session(permissions=control_reads, restore_path='/aprobaciones') as (_, control_me):
            row['actors'] = {'cashier': me, 'reversal_control': control_me}
            before = self.e1_direction()
            self.snap(E1, 'direccion-antes')
        payment_id = regular[0]['payment_id']
        self.go('/caja')
        self.page.get_by_role('tab', name='Conciliación', exact=True).click()
        payment_row = self.page.get_by_role('row').filter(has_text=regular[0]['reference'])
        expect(payment_row).to_be_visible()
        self.snap(E1, 'conciliacion')
        path = f'/payments/{payment_id}/verification-review'
        self.capture_intents = True
        try:
            with self.page.expect_response(lambda r: r.request.method == 'POST' and r.url.endswith(path)) as received:
                payment_row.get_by_role('button', name='Preparar revisión', exact=True).click(click_count=2)
            response = received.value
            check(response.status in (200, 201), f'UI preparation failed: {response.status}')
            receipt = response.json()
            proposal = receipt['proposal']
            expect(self.page).to_have_url(re.compile(r'/aprobaciones\?'))
            query = parse_qs(urlsplit(self.page.url).query)
            check(query.get('proposal') == [f'agent_proposal:{proposal["id"]}'], 'Bandeja did not focus the proposal')
            selected = self.page.locator('#bandeja-selected')
            expect(selected).to_contain_text(regular[0]['reference'])
            for text in ('Monto', 'Referencia', 'Método', 'Receptor', 'Sede', 'Lince',
                         'cobrado verificado', 'total recibido no cambia'):
                expect(selected).to_contain_text(text)
            check(receipt['payment']['id'] == payment_id and proposal['kind'] == 'payment_verify' and
                  'approve' in proposal['actions'], 'Wrong prepared review or actions')
            expect(selected).to_contain_text(receipt['payment']['receiver'])
            expect(selected).to_contain_text(re.compile(re.escape(receipt['payment']['method']), re.I))
            expect(selected).to_contain_text(f'{Decimal(str(receipt["payment"]["amount"])):,.2f}')
            self.page.reload(wait_until='networkidle')
            expect(selected).to_contain_text(regular[0]['reference'])
            self.snap(E1, 'tarjeta-enfocada')
            with self.page.expect_response(lambda r: r.request.method == 'POST' and
                                           r.url.endswith(f'/proposals/{proposal["id"]}/approve')) as approved:
                selected.get_by_role('button', name='Aprobar', exact=True).click(click_count=2)
            check(approved.value.status == 200 and approved.value.json()['status'] == 'executed',
                  'UI approval did not execute')
            expect(self.page.locator('.success-banner')).to_be_visible()
        finally:
            self.capture_intents = False
        row.update(payment_id=payment_id, proposal_id=proposal['id'])
        check(any(i['path'].endswith('/approve') for i in self.result['intents']) and
              any(i['path'].endswith('/verification-review') for i in self.result['intents']),
              'Missing UI mutation intents; retries must reuse the captured keys')
        proof = self.e1_proof(payment_id)
        verified = [e for e in proof['events'] if e['action'] == 'payment.verified']
        check(proof['payment']['verification_status'] == 'verified' and len(verified) == 1,
              'UI double approval did not verify exactly once')
        with self.e1_control_session(permissions=control_reads, restore_path='/aprobaciones'):
            after = self.e1_direction()
            self.snap(E1, 'direccion-despues')
            amount = int(Decimal(proof['payment']['amount']) * 100)
            check(after['verified'] == before['verified'] + amount and
                  after['pending'] == before['pending'] - amount and
                  before['verified'] + before['pending'] == after['verified'] + after['pending'],
                  'Direction must move -X/+X while preserving total received')
            cases['1-2'] = {'before': before, 'after': after, 'proof': proof}
            cases['3'] = self.e1_trail(proposal['id'], payment_id)
            self.snap(E1, 'rastro')

        # Two simultaneous preparations with different keys must share one open proposal.
        pid = regular[1]['payment_id']
        path = f'/payments/{pid}/verification-review'
        requests = [{'path': path, 'key': str(uuid4())} for _ in range(2)]
        prepared = self.e1_parallel(requests)
        check(sorted(r['status'] for r in prepared) == [200, 201] and
              sorted(r['body']['created'] for r in prepared) == [False, True] and
              len({r['body']['proposal']['id'] for r in prepared}) == 1, 'Concurrent preparation duplicated a proposal')
        open_id = prepared[0]['body']['proposal']['id']
        self.go(f'/aprobaciones?proposal=agent_proposal%3A{open_id}')
        self.page.reload(wait_until='networkidle')
        expect(self.page.locator('#bandeja-selected')).to_contain_text(regular[1]['reference'])
        proposals = self.sql("SELECT * FROM agent_proposals WHERE kind='payment_verify' AND status='pending'")
        matching = [p for p in proposals if p['payload']['payment_ids'] == [pid]]
        check(len(matching) == 1, 'SQL found duplicate open payment proposals')
        # Both responses must replay their own original body (including created).
        for request, original in zip(requests, prepared):
            replay = self.e1_request(path, key=request['key'])
            check(replay['status'] in (200, 201) and replay['replay'] == 'true' and
                  replay['body'] == original['body'], 'Preparation replay changed its body')
        cases['4'] = {'proposal_id': open_id, 'responses': prepared, 'open_proposals': len(matching)}
        # Same-key approval retry, including after reload/execution, is mandatory even without --replay.
        before_retry = self.snapshot()
        for intent in self.result['intents']:
            if not intent['path'].endswith('/approve'):
                continue
            replay = self.e1_request(intent['path'], intent['body'], intent['key'])
            check(replay['status'] == 200 and replay['replay'] == 'true' and replay['body'] == intent['result'],
                  'Approval replay changed its result')
        check(before_retry == self.snapshot(), 'Approval retry mutated persisted rows')
        cases['5'] = {'payment_verified_count': len(verified), 'identical_sql_after_retry': True}

        missing = next(p for p in fixtures if p['ruta'] == 'sin_referencia')['payment_id']
        before_missing = self.e1_proof(missing)
        for suffix, body in (('verification-review', None), ('verify', {})):
            self.e1_rejected(self.e1_request(f'/payments/{missing}/{suffix}', body), (422,),
                             'INVALID_INPUT', 'missing_reference')
        check(before_missing == self.e1_proof(missing), 'Missing-reference rejection changed payment')
        cases['6'] = {'payment_id': missing, 'unchanged': True}

        stale = []
        for fixture, action in zip(regular[2:4], ('verify', 'reverse')):
            pid = fixture['payment_id']
            pending = self.e1_prepare(pid)
            self.go(f'/aprobaciones?proposal=agent_proposal%3A{pending["id"]}')
            expect(self.page.locator('#bandeja-selected')).to_contain_text(fixture['reference'])
            if action == 'reverse':
                before_denied = self.e1_proof(pid)
                denied = self.e1_request(f'/payments/{pid}/reverse', {'reason': 'E1 cashier cannot reverse'})
                self.e1_rejected(denied, (403,), 'PERMISSION_DENIED')
                check(before_denied == self.e1_proof(pid), 'Denied cashier reversal changed payment/events')
                row['cashier_reverse_denied'] = denied
                changed = self.e1_reverse(pid)
            else:
                changed = self.e1_request(f'/payments/{pid}/verify', {})
            check(changed['status'] == 200, f'Stale fixture failed: {changed}')
            before_stale = self.e1_proof(pid)
            rejected = self.e1_request(f'/agent/proposals/{pending["id"]}/approve',
                                       {'payload_hash': pending['payload_hash']})
            if rejected['status'] == 409:
                self.e1_rejected(rejected, (409,), 'PROPOSAL_SUPERSEDED')
            else:
                check(rejected['status'] == 200 and rejected['body']['status'] == 'failed',
                      f'Stale proposal was executable: {rejected}')
            check(before_stale == self.e1_proof(pid), 'Stale approval changed payment/events')
            if action == 'reverse':
                check(not any(e['action'] == 'payment.verified' for e in before_stale['events']),
                      'Reversed payment was verified')
                self.e1_rejected(self.e1_request(f'/payments/{pid}/verify', {}), (422,), 'INVALID_INPUT', 'reversed')
            stale.append({'payment_id': pid, 'action': action, 'rejection': rejected, 'proof': before_stale})
        pid = regular[4]['payment_id']
        pending = self.e1_prepare(pid)
        race = self.e1_reversal_race(pid, pending)
        check(race[0]['status'] == 200 and race[1]['status'] in (200, 409), f'Unexpected race response: {race}')
        proof = self.e1_proof(pid)
        events = [e for e in proof['events'] if e['action'] == 'payment.verified']
        executed = race[1]['status'] == 200 and race[1]['body']['status'] == 'executed'
        check(len(events) == int(executed), 'Race produced an unexpected verification event')
        check(proof['payment']['reversed_at'], 'Race reversal not persisted')
        if events:
            reversal_events = [e for e in proof['events'] if e['action'] == 'payment.reversed']
            # Database now() can predate a row-lock wait. Audit IDs are assigned
            # inside the serialized mutations and establish their actual order.
            check(len(reversal_events) == 1 and events[0]['id'] < reversal_events[0]['id'],
                  'Verification happened after reversal won')
        cases['7'] = {'stale': stale, 'race': race, 'race_proof': proof, 'winner': 'approve' if executed else 'reverse'}

        pid = regular[5]['payment_id']
        pending = self.e1_prepare(pid)
        before_denied = self.e1_proof(pid)
        paths = [(f'/payments/{pid}/verify', {}),
                 (f'/agent/proposals/{pending["id"]}/approve', {'payload_hash': pending['payload_hash']}),
                 (f'/agent/proposals/{pending["id"]}/retry', None)]
        try:
            reception = self.choose(f'E1 sintético {self.seed["run_id"]} · recepcion')
            check(reception['principal']['id'] == self.seed['personas']['recepcion'] and
                  reception['organization']['id'] == self.seed['organization_id'], 'Wrong M1 Reception identity')
            for path, body in paths:
                self.e1_rejected(self.e1_request(path, body))
        finally:
            self.choose(name)
        check(before_denied == self.e1_proof(pid), 'Reception changed the payment')
        # Server-side identity probes keep bearer credentials outside the browser and evidence.
        import httpx
        token = self.env['SALES_AGENT_V0_CREDENTIAL']
        identity = httpx.get(self.args.api.rstrip('/') + '/me',
                             headers={'Authorization': 'Bearer ' + token}, timeout=30)
        check(identity.status_code == 200 and identity.json()['principal']['type'] == 'agent' and
              identity.json()['organization']['id'] == self.seed['organization_id'], 'Wrong denial agent identity')
        for path, body in [(f'/payments/{pid}/verification-review', None), *paths]:
            response = httpx.post(self.args.api.rstrip('/') + path, headers={
                'Authorization': 'Bearer ' + token, 'Idempotency-Key': str(uuid4())},
                **({'json': body} if body is not None else {}), timeout=30)
            check(response.status_code == 403, f'Agent principal must receive 403: {path} HTTP {response.status_code}')
        check(before_denied == self.e1_proof(pid), 'Agent rejection changed the payment')
        cases['8'] = {'payment_id': pid, 'reception_and_agent': '403', 'unchanged': True}

        # The control human prepares the Miraflores fixture; Caja must not read or execute it.
        foreign = next(p for p in fixtures if p['ruta'] == 'otra_sede')
        with self.e1_control_session(permissions=('payments.read', 'proposals.read')):
            other_location = self.e1_prepare(foreign['payment_id'])
        cases['9'] = {'other_location': self.e1_isolation(foreign, other_location)}
        other = e1_seed(self.args.other_seed_summary or self.root / 'e1-other-seed.json')
        check(other['organization_id'] != self.seed['organization_id'], 'Other-organization fixture is the same tenant')
        foreign = other['lotes']['pruebas'][0]
        token = self.env['E1_OTHER_HUMAN_CREDENTIAL']
        identity = httpx.get(self.args.api.rstrip('/') + '/me',
                             headers={'Authorization': 'Bearer ' + token}, timeout=30)
        check(identity.status_code == 200 and identity.json()['principal']['type'] == 'human' and
              identity.json()['organization']['id'] == other['organization_id'], 'Wrong other-organization human identity')
        response = httpx.post(self.args.api.rstrip('/') + f'/payments/{foreign["payment_id"]}/verification-review',
                              headers={'Authorization': 'Bearer ' + token, 'Idempotency-Key': str(uuid4())}, timeout=30)
        check(response.status_code in (200, 201), 'Other-organization fixture preparation failed')
        cases['9']['other_organization'] = self.e1_isolation(foreign, response.json()['proposal'])
        pid = regular[6]['payment_id']
        pending = self.e1_prepare(pid)
        before_revoked = self.e1_proof(pid)
        try:
            self.e1_membership(False)
            denied = self.e1_request(f'/agent/proposals/{pending["id"]}/approve',
                                     {'payload_hash': pending['payload_hash']})
            self.e1_rejected(denied)
            check(before_revoked == self.e1_proof(pid), 'Revoked membership executed a payment')
            cases['8']['revocation'] = {'payment_id': pid, 'denied': denied, 'unchanged': True}
        finally:
            self.e1_membership(True)
        check(self.get('/me')['principal']['id'] == self.seed['personas']['caja'], 'Caja membership was not restored')
        check(initial == [p for p in self.snapshot()['payments'] if p['id'] in medicion_ids],
              'Journey consumed measurement payments')
        row['medicion_unchanged'] = True
        self.snap(E1, 'rechazos')

    def e1_isolation(self, fixture, proposal):
        pid = fixture['payment_id']
        before = self.e1_proof(pid)
        for path in (f'/charges/{fixture["charge_id"]}', f'/charges/{fixture["charge_id"]}/payments',
                     f'/agent/proposals/{proposal["id"]}'):
            self.e1_rejected(self.e1_request(path, method='GET'), (403, 404))
        for path, body in ((f'/payments/{pid}/verification-review', None),
                           (f'/payments/{pid}/verify', {}),
                           (f'/agent/proposals/{proposal["id"]}/approve', {'payload_hash': proposal['payload_hash']}),
                           (f'/agent/proposals/{proposal["id"]}/retry', None)):
            self.e1_rejected(self.e1_request(path, body), (403, 404))
        visible = self.get('/payments')
        check(pid not in {p['id'] for p in visible}, 'Payment list leaked an out-of-scope payment')
        inbox = self.get('/agent/inbox?status=pending')['items']
        check(proposal['id'] not in {p['id'] for p in inbox if p['source'] == 'agent_proposal'},
              'Inbox leaked an out-of-scope proposal')
        check(before == self.e1_proof(pid), 'Out-of-scope rejection changed payment/events')
        return {'payment_id': pid, 'proposal_id': proposal['id'], 'denied': True, 'unchanged': True}

    def measurement(self):
        check(self.args.operator and self.args.operator.strip(), '--operator must identify the same human for both routes')
        result = measure_csv(self.args.measure_csv, self.seed)
        state = self.snapshot()
        pairs = {}
        for fixture in self.seed['lotes']['medicion']:
            proof = self.e1_proof(fixture['payment_id'])
            payment = proof['payment']
            check(payment['organization_id'] == self.seed['organization_id'] and
                  payment['charge_id'] == fixture['charge_id'] and payment['reference'] == fixture['reference'],
                  'Measurement seed does not match the database')
            count = sum(e['action'] == 'payment.verified' for e in proof['events'])
            check(payment['verification_status'] == 'verified' and payment['reversed_at'] is None,
                  'Measurement has an unverified/reversed payment')
            check(datetime.fromisoformat(payment['paid_at']).astimezone(ZoneInfo('America/Lima')).date().isoformat()
                  == self.seed['dia_lima'], 'Measurement crosses Lima days')
            visit = self.sql('SELECT v.location_id FROM charges c JOIN service_executions s ON s.id=c.service_execution_id '
                             'JOIN visits v ON v.id=s.visit_id WHERE c.id=:id', {'id': payment['charge_id']})
            check(visit[0]['location_id'] == self.seed['sedes']['Lince'], 'Measurement crosses locations')
            pairs.setdefault(fixture['ruta'], []).append((Decimal(payment['amount']), payment['method'], payment['receiver']))
            result.setdefault('verification_counts', {})[payment['id']] = count
        check(sorted(pairs['manual']) == sorted(pairs['airi']), 'Manual/AIRI payments are not equivalent')
        result['checks']['cero_duplicados'] = all(n == 1 for n in result['verification_counts'].values())
        result.update(operator=self.args.operator, dia_lima=self.seed['dia_lima'],
                      location_id=self.seed['sedes']['Lince'],
                      evaluated_at=datetime.now(timezone.utc).isoformat(),
                      seed_sha256=hashlib.sha256((self.args.seed_summary or self.root / 'e1-seed.json').read_bytes()).hexdigest())
        result['cumple'] = all(result['checks'].values())
        result['estado_e1'] = 'CUMPLE' if result['cumple'] else 'PENDIENTE'
        check(state == self.snapshot(), 'Measurement must be read only')
        destination = self.root / 'e1-medicion.json'
        check(not destination.exists(), 'Preserve existing measurement evidence; use another run-dir')
        write_json(destination, result)
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        self.engine.dispose()
        return int(not result['cumple'])

    def replay(self):
        before = self.snapshot()
        results = []
        failure = None
        for intent in list(self.result['intents']):
            self.choose(intent['person'])
            same = self.api(intent['path'], 'POST', intent['body'], intent['key'])
            check(same['status'] in (200, 201) and same['replay'] == 'true', f'Replay failed: {same}')
            check(same['body'] == intent['result'], 'Replay result changed')
            other_key = str(uuid4())
            other = self.api(intent['path'], 'POST', intent['body'], other_key)
            results.append({'path': intent['path'], 'same_key': intent['key'], 'same': same,
                            'new_key': other_key, 'new': other})
            self.result['replay']['requests'] = results
            expected_status = 422 if intent['path'].endswith('/verification-review') else 409
            if other['status'] != expected_status:
                failure = f"New key must return {expected_status}: {other}"
                break
            if expected_status == 422:
                self.e1_rejected(other, (422,), 'INVALID_INPUT', 'already_verified')
        after = self.snapshot()
        self.result['replay'].update(before=before, after=after, identical=before == after,
                                     counts_before={k: len(v) for k, v in before.items()},
                                     counts_after={k: len(v) for k, v in after.items()})
        print('REPLAY SQL before=' + json.dumps(self.result['replay']['counts_before'], sort_keys=True))
        print('REPLAY SQL after =' + json.dumps(self.result['replay']['counts_after'], sort_keys=True) + ' identical=' + str(before == after).lower())
        check(failure is None, failure)
        check(before == after, 'Replay changed SQL rows')

    def run(self):
        from playwright.sync_api import sync_playwright
        selected = self.args.journeys.split(',')
        check(all(x in JOURNEYS for x in selected), 'Unknown journey')
        check(E1 not in selected or selected == [E1], 'Run E1 alone with its fresh M1 pruebas batch')
        if 'J3' in selected and 'J1' not in selected:
            selected.append('J1')
        selected = sorted(set(selected))
        failed = False
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                self.page = browser.new_page(viewport={'width': 1440, 'height': 1100}, timezone_id='America/Lima')
                self.page.on('request', self.on_request)
                self.page.on('response', self.on_response)
                self.page.on('pageerror', lambda error: self.page_errors.append(str(error)))
                self.go('/aprobaciones' if self.e1 else '/agenda')
                self.result['initial_sql'] = self.snapshot()
                for journey in selected:
                    self.result['journeys'][journey] = {'result': 'FAIL', 'shots': []}
                    try:
                        getattr(self, journey.replace('-', '_'))()
                        check(not self.page_errors, f'Browser errors: {self.page_errors}')
                        self.result['journeys'][journey]['sql_counts'] = {k: len(v) for k, v in self.snapshot().items()}
                        self.result['journeys'][journey]['result'] = 'PASS'
                    except Exception as error:
                        self.result['journeys'][journey]['error'] = self.redact(error)
                        self.snap(journey, 'error')
                        failed = True
                        break
                if self.args.replay and not failed:
                    try:
                        self.replay()
                        self.result['replay']['result'] = 'PASS'
                    except Exception as error:
                        self.result['replay'].update(result='FAIL', error=self.redact(error))
                        failed = True
            finally:
                browser.close()
        self.result['finished_at'] = datetime.now(timezone.utc).isoformat()
        self.result['result'] = 'FAIL' if failed else 'PASS'
        write_json(self.root / 'journeys.json', self.result)
        manifest_path = self.root / 'manifest.json'
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            manifest['journeys'] = self.result
            write_json(manifest_path, manifest)
        print('Journey | Resultado | IDs')
        for journey in selected:
            row = self.result['journeys'].get(journey, {'result': 'FAIL', 'error': 'Not run: preceding journey failed'})
            ids = {k: row[k] for k in ('proposal_id', 'appointment_id', 'conversation_id') if k in row}
            if 'proposal' in row:
                ids['proposal_id'] = row['proposal']['id']
                ids['result_ref'] = row['approved']['result_ref']
            if 'handoff' in row:
                ids['handoff_id'] = row['handoff']['id']
            print(f"{journey} | {row['result']} | {json.dumps(ids)} {row.get('error', '')}")
        if self.args.replay:
            print('REPLAY | FAIL | ' + self.result['replay'].get('error', 'Not run') if failed else 'REPLAY | PASS (misma clave/cuerpo; nueva clave rechazada; SQL idéntico)')
        self.engine.dispose()
        return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=os.environ.get('E2E_BASE_URL',
                        'http://127.0.0.1:' + os.environ.get('FRONTEND_PORT', '3120')))
    parser.add_argument('--api', default=os.environ.get('E2E_API_URL',
                        'http://127.0.0.1:' + os.environ.get('API_PORT', '8120')))
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--journeys', default='J1,J2,J3,J4,J5,J6')
    parser.add_argument('--e1-db', default=os.environ.get('E1_JOURNEY_DB', 'odontoflow_test_fe_e1_fe3'),
                        help='Expected isolated E1 database; default: E1_JOURNEY_DB or odontoflow_test_fe_e1_fe3')
    parser.add_argument('--replay', action='store_true')
    parser.add_argument('--seed-summary', type=Path, help='M1 JSON; default: <run-dir>/e1-seed.json')
    parser.add_argument('--other-seed-summary', type=Path, help='M1 JSON for another organization; default: <run-dir>/e1-other-seed.json')
    parser.add_argument('--dry-run', action='store_true', help='Validate E1 selection and M1 IDs without DB/browser/mutations')
    parser.add_argument('--measure-csv', type=Path, help='Evaluate the measured M1 CSV using read-only SQL; does not run journeys')
    parser.add_argument('--operator', help='Same human operator for the manual and AIRI measurement')
    args = parser.parse_args()
    runner = None
    try:
        check(all(x in JOURNEYS for x in args.journeys.split(',')), 'Unknown journey')
        check(args.run_dir.is_absolute(), '--run-dir must be absolute')
        for path in (args.seed_summary, args.other_seed_summary, args.measure_csv):
            check(path is None or path.is_absolute(), 'E1 input paths must be absolute')
        if args.dry_run:
            check(args.journeys == E1 and not args.measure_csv, '--dry-run selects cobro-verificado alone')
            seed = e1_seed(args.seed_summary or args.run_dir / 'e1-seed.json')
            print(json.dumps({'mode': 'DRY_RUN', 'journey': E1, 'run_id': seed['run_id'],
                              'pruebas_ids': [r['payment_id'] for r in seed['lotes']['pruebas']],
                              'medicion_ids_excluded': [r['payment_id'] for r in seed['lotes']['medicion']],
                              'real_cases_1_9': 'NOT_RUN', 'measurement_case_10': 'PENDIENTE'}, indent=2))
            return 0
        runner = Journeys(args)
        return runner.measurement() if args.measure_csv else runner.run()
    except Exception as error:
        print('FAIL: ' + (runner.redact(error) if runner else type(error).__name__ + ': check private env and prerequisites'), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
