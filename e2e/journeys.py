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
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from statistics import median
from threading import Barrier
from urllib.parse import parse_qs, quote, urlsplit
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo


E1 = 'cobro-verificado'
E2 = 'recordatorios'
JOURNEYS = ('J1', 'J2', 'J3', 'J4', 'J5', 'J6', E1, E2)


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


def reminders_seed(path):
    """Read M1's final JSON verbatim; identities and appointments are checked in SQL."""
    seed = json.loads(path.read_text())
    check(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', seed['run_id']), 'Invalid E2 run_id')
    check(seed['scenario'] in ('nominal', 'adversarial'), 'Unknown E2 scenario')
    ids = seed['appointment_ids']
    count = 10 if seed['scenario'] == 'nominal' else 9
    check(len(ids) == count and len(set(ids)) == count and all(type(x) is int and x > 0 for x in ids), 'Unexpected M1 appointment IDs')
    check(set(seed['appointments_by_label'].values()) == set(ids), 'M1 labels must identify every appointment exactly once')
    for field in ('location_ids', 'reception_ids'):
        check(set(seed[field]) == {'Lince', 'Miraflores'} and len(set(seed[field].values())) == 2 and
              all(type(x) is int and x > 0 for x in seed[field].values()), 'M1 needs two distinct sites/reception people')
    check(set(seed['contact_ids']) == ({'P'} if count == 10 else {'P', 'R'}), 'Unexpected M1 contacts')
    check(len(seed['patient_ids']) == (1 if count == 10 else 3), 'Unexpected M1 patients')
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
        self.e2 = E2 in args.journeys.split(',')
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
                for key in ('BFF_ACCESS_CODE', 'SALES_AGENT_V0_CREDENTIAL', 'E1_OTHER_HUMAN_CREDENTIAL',
                            'E1_CASHIER_HUMAN_CREDENTIAL', 'E1_CONTROL_HUMAN_CREDENTIAL', 'E1_BACKEND_DIR'):
                    check(self.env.get(key), f'Missing E1 fixture setting: {key}')
                other = e1_seed(args.other_seed_summary or self.root / 'e1-other-seed.json')
                check(other['organization_id'] != self.seed['organization_id'], 'Other-organization fixture is the same tenant')
        if self.e2:
            from sqlalchemy.engine import make_url
            database = make_url(self.env['DATABASE_URL'])
            check(database.host in ('localhost', '127.0.0.1') and database.port == 5434 and
                  re.fullmatch(r'odontoflow_test_fe_e2_fe1(?:_[a-z0-9_]+)?', database.database or ''), 'E2 requires its isolated :5434 FE1 database')
            check(self.env.get('NEXT_PUBLIC_USE_MOCKS') == 'false', 'E2 requires no mocks')
            check(self.env.get('TELEGRAM_TRANSPORT') == 'fake', 'E2 requires fake Telegram transport')
            check(not self.env.get('TELEGRAM_BOT_TOKEN') and not self.env.get('TELEGRAM_WEBHOOK_SECRET'),
                  'E2 Telegram credentials belong only in the process environment, never the run-dir env file')
            self.reminders = reminders_seed(args.seed_summary or self.root / 'recordatorios-seed.json')
            for key in ('E2_BACKEND_DIR', 'E2_BACKEND_PYTHON', 'E2_NOW', 'E2_LINCE_PERSONA', 'E2_MIRAFLORES_PERSONA'):
                check(self.env.get(key), f'Missing E2 setting: {key}')
            check(os.environ.get('TELEGRAM_WEBHOOK_SECRET'), 'Signed E2 updates require a process-only webhook secret')
            check(datetime.fromisoformat(self.env['E2_NOW']).tzinfo is not None, 'E2_NOW must have a timezone')
            self.TABLES.update(reminders='reminder_items', changes='reminder_change_requests', audit='audit_events')
        self.engine = create_engine(self.env['DATABASE_URL'])
        self.shots = self.root / 'shots'
        self.shots.mkdir(exist_ok=True)
        self.result = {'base': args.base, 'api': args.api, 'journeys': {}, 'intents': [],
                       'responses': [], 'replay': {}, 'started_at': datetime.now(timezone.utc).isoformat()}
        self.person = None
        self.session_epoch = 0
        self.requests = {}
        self.pending_backend = set()
        self.inventory = None
        self.page_errors = []
        self.capture_intents = not self.e1

    def redact(self, value):
        value = str(value)
        for key, secret in self.env.items():
            if secret and any(word in key for word in ('TOKEN', 'SECRET', 'CODE', 'CREDENTIAL', 'URL', 'HUMANS')):
                value = value.replace(secret, '[REDACTED]')
        value = value.replace(os.environ.get('TELEGRAM_WEBHOOK_SECRET') or '\0', '[REDACTED]')
        value = re.sub(r'https://t\.me/\S+|\b[rc]:[A-Za-z0-9_-]{16,}(?::yes|:no)?', '[REDACTED_TELEGRAM]', value)
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
            self.pending_backend.add(request)

    def on_request_done(self, request):
        self.pending_backend.discard(request)

    def wait_backend_idle(self):
        deadline = time.monotonic() + 30
        quiet_since = None
        while time.monotonic() < deadline:
            self.page.wait_for_timeout(50)
            if self.pending_backend:
                quiet_since = None
            elif quiet_since is None:
                quiet_since = time.monotonic()
            elif time.monotonic() - quiet_since >= 0.5:
                return
        self.result.setdefault('backend_idle_timeouts', []).append({
            'pending': [{'path': urlsplit(request.url).path, 'timing': request.timing,
                         'failure': request.failure} for request in self.pending_backend]})
        check(False, 'Backend reads did not settle before switching persona')

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

    def on_intent_route(self, route):
        request = route.request
        if not self.capture_intents or request.method != 'POST':
            route.continue_()
            return
        # Fetch the real BFF response once and preserve its body before the UI
        # can navigate. A synchronous response listener can lose the body or
        # block expect_response while waiting for its own response to finish.
        response = route.fetch(max_retries=0)
        try:
            if response.status in (200, 201) and response.headers.get('idempotent-replay') != 'true':
                key = request.headers.get('idempotency-key')
                check(key and UUID(key).version == 4, 'Mutation must use UUIDv4')
                if not any(x['key'] == key for x in self.result['intents']):
                    self.result['intents'].append({'path': urlsplit(request.url).path.removeprefix('/api/backend'),
                                                   'body': request.post_data_json, 'key': key,
                                                   'person': self.person, 'result': response.json()})
        finally:
            route.fulfill(response=response)

    def captured_result(self, response):
        key = response.request.headers.get('idempotency-key')
        intent = next((item for item in self.result['intents'] if item['key'] == key), None)
        check(intent is not None and intent['path'] == urlsplit(response.url).path.removeprefix('/api/backend'),
              'Missing original UI mutation response')
        return intent['result']

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
        if self.e2 and self.page.locator('.drawer-backdrop').count():
            self.page.keyboard.press('Escape')
            expect(self.page.locator('.drawer-backdrop')).to_have_count(0)
        previous = self.person
        # The gate also renders while an existing signed-in session hydrates.
        # Decide which picker to use only after /me finishes loading.
        expect(self.page.locator('.persona-menu[aria-busy="false"], '
                                 '.persona-switcher__trigger[aria-busy="false"]')).to_be_visible()
        # Identity readiness mounts the page and starts its own reads afterwards.
        self.wait_backend_idle()
        if self.page.get_by_role('heading', name='Elige quién eres', exact=True).count() == 0:
            trigger = self.page.get_by_role('button', name=re.compile('Cambiar de persona'))
            expect(trigger).to_have_attribute('aria-busy', 'false')
            trigger.click()
            expect(self.page.get_by_role('group', name='Cambiar de persona', exact=True)).to_be_visible()
        code = self.page.get_by_label('Código de acceso')
        if code.count():
            code.fill(self.env['BFF_ACCESS_CODE'])
        # Observe before the first action that invalidates the old session.
        # Completed hydration reads precede the switch; in-flight reads retain
        # their original epoch and are still rejected if they finish afterwards.
        start = len(self.result['responses'])
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

    @contextmanager
    def e1_backend_session(self, credential_key, expected_me):
        """Server-side human fixture/probe; verify the same real identity as BFF."""
        import httpx
        check(expected_me['principal']['type'] == 'human', 'Backend fixture must use a human')
        with httpx.Client(base_url=self.args.api.rstrip('/'), timeout=30,
                          headers={'Authorization': 'Bearer ' + self.env[credential_key]}) as client:
            identity = client.get('/me')
            check(identity.status_code == 200 and identity.json() == expected_me,
                  f'Backend human identity differs from BFF: {credential_key}')
            yield client

    def e1_http_post(self, client, request, principal_id, prefix='/api/backend'):
        response = client.post(prefix + request['path'],
                               headers={'Idempotency-Key': request['key']},
                               **({'json': request['body']} if request.get('body') is not None else {}))
        return {'status': response.status_code, 'body': response.json(),
                'replay': response.headers.get('idempotent-replay'), 'principal_id': principal_id,
                'transport': 'bff' if prefix else 'api'}

    def e1_direct_request(self, path, body, credential_key, expected_me):
        request = {'path': path, 'key': str(uuid4()), 'body': body}
        with self.e1_backend_session(credential_key, expected_me) as client:
            response = self.e1_http_post(client, request, expected_me['principal']['id'], prefix='')
        self.result['journeys'][E1].setdefault('requests', []).append(
            {**request, 'method': 'POST', 'person': expected_me['principal']['display_name'], 'response': response})
        return response

    def e1_reverse(self, payment_id):
        with self.e1_control_session() as (_, me):
            return self.e1_direct_request(f'/payments/{payment_id}/reverse',
                                          {'reason': 'E1 synthetic stale proposal'},
                                          'E1_CONTROL_HUMAN_CREDENTIAL', me)

    def e1_reversal_race(self, payment_id, proposal):
        requests = [
            {'path': f'/payments/{payment_id}/reverse', 'key': str(uuid4()),
             'body': {'reason': 'E1 synthetic race'}},
            {'path': f'/agent/proposals/{proposal["id"]}/approve', 'key': str(uuid4()),
             'body': {'payload_hash': proposal['payload_hash']}}]
        with self.e1_control_session() as (_, me):
            with self.e1_backend_session('E1_CONTROL_HUMAN_CREDENTIAL', me) as control:
                self.choose(f'E1 sintético {self.seed["run_id"]} · caja')
                # The reversal API client keeps its own verified control identity.
                identity = control.get('/me')
                check(identity.status_code == 200 and identity.json() == me, 'Race lost its independent control identity')
                with self.e1_http_session() as cashier:
                    identity = cashier.get('/api/backend/me')
                    check(identity.status_code == 200 and
                          identity.json()['principal']['id'] == self.seed['personas']['caja'], 'Race approver must be M1 Caja')
                    start = Barrier(2)

                    def post(client, request, principal_id, prefix):
                        start.wait(timeout=30)
                        return self.e1_http_post(client, request, principal_id, prefix)

                    with ThreadPoolExecutor(max_workers=2) as executor:
                        reversal = executor.submit(post, control, requests[0], me['principal']['id'], '')
                        approval = executor.submit(post, cashier, requests[1], self.seed['personas']['caja'], '/api/backend')
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
        self.page.get_by_role('group', name='Espacios de caja', exact=True).get_by_role(
            'button', name='Conciliación', exact=True).click()
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
            receipt = self.captured_result(response)
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
            check(approved.value.status == 200 and self.captured_result(approved.value)['status'] == 'executed',
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
                denied = self.e1_direct_request(f'/payments/{pid}/reverse',
                                                {'reason': 'E1 cashier cannot reverse'},
                                                'E1_CASHIER_HUMAN_CREDENTIAL', self.get('/me'))
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

    def e2_webhook(self, payload, *, duplicate=False):
        """Never persist signed payloads or opaque callback values in evidence."""
        self.e2_update += 1
        for _ in range(2 if duplicate else 1):
            response = self.page.request.post(self.args.api.rstrip('/') + '/integrations/telegram/webhook',
                headers={'X-Telegram-Bot-Api-Secret-Token': os.environ['TELEGRAM_WEBHOOK_SECRET']},
                data={**payload, 'update_id': self.e2_update})
            check(response.status == 200, 'Signed Telegram update failed')
        return self.e2_update

    def e2_reply(self, callback, *, foreign=False, duplicate=False):
        return self.e2_webhook({'callback_query': {'id': str(uuid4()), 'data': callback,
            'from': {'id': self.e2_chat + int(foreign)},
            'message': {'message_id': 1, 'chat': {'id': self.e2_chat + int(foreign), 'type': 'private'}}}}, duplicate=duplicate)

    def e2_text(self, text):
        return self.e2_webhook({'message': {'message_id': self.e2_update + 1,
            'from': {'id': self.e2_chat}, 'chat': {'id': self.e2_chat, 'type': 'private'}, 'text': text}})

    def e2_worker(self, instant, *, target=None, phase=None, mutation=None, timeout=False):
        """Real --once/--now worker, fake provider; private socket observes its buttons.

        No callbacks go through stdout, argv, environment, files or journey JSON.
        Pauses are process barriers around the actual dispatch boundaries.
        """
        backend = Path(self.env['E2_BACKEND_DIR'])
        python = Path(self.env['E2_BACKEND_PYTHON'])
        check(backend.is_absolute() and python.is_absolute() and python.is_file(), 'Absolute E2 worker paths required')
        clock = self.env.get('E2_CLOCK_FILE')
        if clock:
            check(Path(clock).is_absolute(), 'E2 clock path must be absolute')
            Path(clock).write_text(instant.isoformat())
        program = r'''
import json, os, socket, sys
from app.reminders import dispatch
from app.reminders.telegram import TelegramClient, TelegramResult
from app.reminders.worker import main
pipe = socket.socket(fileno=int(sys.argv[1])).makefile('rwb', buffering=0)
config = json.loads(pipe.readline())
buttons, active, paused = {}, None, False
original_start, original_check = dispatch._start_attempt, dispatch._final_check
original_send = TelegramClient.send_message

def pause(phase, item_id):
    global paused
    if not paused and config['phase'] == phase and config['target'] == item_id:
        paused = True
        pipe.write(b'{"event":"ready"}\n')
        assert json.loads(pipe.readline())['resume']

def start(*args, **kwargs):
    global active
    pause('before_start', kwargs['item_id'])
    active = original_start(*args, **kwargs)
    return active

def final(*args, **kwargs):
    pause('before_call', kwargs['attempt'].item_id)
    return original_check(*args, **kwargs)

def send(self, *args, **kwargs):
    result = original_send(self, *args, **kwargs)
    if active is not None:
        buttons[str(active.item_id)] = kwargs.get('reply_markup', {})
        pause('after_call', active.item_id)
        if config['timeout'] and config['target'] == active.item_id:
            result = TelegramResult('uncertain', reason='timeout')
    return result

dispatch._start_attempt, dispatch._final_check = start, final
TelegramClient.send_message = send
code = main(['--once', '--now', config['now']])
pipe.write((json.dumps({'event':'done', 'code':code, 'buttons':buttons, 'paused':paused})+'\n').encode())
'''
        parent, child = socket.socketpair()
        parent.settimeout(55)
        process = subprocess.Popen([str(python), '-c', program, str(child.fileno())], cwd=backend,
            env={**os.environ, **self.env, 'TELEGRAM_TRANSPORT': 'fake'}, pass_fds=(child.fileno(),),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child.close()
        try:
            with parent, parent.makefile('rwb', buffering=0) as channel:
                channel.write((json.dumps({'now': instant.isoformat(), 'target': target, 'phase': phase, 'timeout': timeout}) + '\n').encode())
                while True:
                    raw = channel.readline()
                    check(raw, 'Controlled E2 worker ended without a receipt')
                    data = json.loads(raw)
                    if data['event'] == 'ready':
                        check(mutation is not None, 'A dispatch pause requires a mutation')
                        mutation()
                        channel.write(b'{"resume":true}\n')
                    else:
                        check(data['code'] == 0 and (phase is None or data['paused']), 'E2 dispatch barrier was not reached')
                        self.e2_buttons.update({int(k): v for k, v in data['buttons'].items()})
                        break
            process.communicate(timeout=5)
            check(process.returncode == 0, 'E2 worker failed (private diagnostics withheld)')
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()

    def e2_items(self):
        return self.sql('SELECT * FROM reminder_items WHERE appointment_id = ANY(:ids) ORDER BY due_at, id', {'ids': self.reminders['appointment_ids']})

    def e2_proof(self):
        return self.sql("SELECT i.id, i.status, count(a.id) AS calls FROM reminder_items i LEFT JOIN audit_events a "
            "ON a.organization_id=i.organization_id AND a.entity_type='reminder_item' AND a.entity_id=i.id::text "
            "AND a.action='reminder.fake_transport' WHERE i.appointment_id=ANY(:ids) GROUP BY i.id ORDER BY i.id",
            {'ids': self.reminders['appointment_ids']})

    def e2_callback(self, appointment, action='Confirmo'):
        rows = [r for r in self.e2_items() if r['appointment_id'] == appointment and r['id'] in self.e2_buttons]
        check(rows, 'No fake delivery buttons for this appointment')
        markup = self.e2_buttons[rows[-1]['id']]
        return next(b['callback_data'] for line in markup['inline_keyboard'] for b in line if b['text'] == action)

    def e2_prepare(self, site, approve=True):
        from playwright.sync_api import expect
        self.choose(self.env['E2_' + site.upper() + '_PERSONA'])
        self.go('/agenda')
        self.page.locator('.agenda-page').get_by_role('combobox', name='Sede', exact=True).select_option(str(self.reminders['location_ids'][site]))
        with self.page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path.endswith('/reminders/batches')) as pending:
            self.page.get_by_role('button', name='Preparar recordatorios', exact=True).evaluate('(b)=>{b.click();b.click()}')
        check(pending.value.status in (200, 201), 'E2 preparation failed')
        receipt = pending.value.json()
        self.page.get_by_role('link', name='Revisar lote en Bandeja', exact=True).click()
        expect(self.page.get_by_role('article', name='Lote de recordatorios')).to_be_visible()
        self.snap(E2, 'batch-' + site + '-' + str(receipt['proposal']['id']))
        if approve:
            self.e2_approve(receipt['proposal']['id'])
        return receipt

    def e2_approve(self, proposal):
        from playwright.sync_api import expect
        with self.page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path.endswith(f'/proposals/{proposal}/approve')) as pending:
            self.page.get_by_role('button', name='Autorizar envíos futuros', exact=True).evaluate('(b)=>{b.click();b.click()}')
        check(pending.value.status == 200, 'E2 authorization failed')
        expect(self.page.get_by_role('status').filter(has_text='Envíos futuros autorizados').first).to_be_visible()

    def recordatorios(self):
        from playwright.sync_api import expect
        seed, result = self.reminders, self.result['journeys'][E2]
        result.update(run_id=seed['run_id'], scenario=seed['scenario'], cases={str(n): 'NOT_RUN' for n in range(1, 13)}, certification='NOT_RUN')
        self.e2_buttons, self.e2_update = {}, int(datetime.now(timezone.utc).timestamp() * 1000)
        self.e2_chat = 800000000 + seed['contact_ids']['P']
        self.choose(self.env['E2_LINCE_PERSONA'])
        organization = self.get('/me')['organization']['id']
        actual = self.sql('SELECT id, patient_id, location_id, organization_id FROM appointments WHERE id=ANY(:ids)', {'ids': seed['appointment_ids']})
        check(len(actual) == len(seed['appointment_ids']) and all(r['organization_id'] == organization for r in actual) and
            {r['location_id'] for r in actual} == set(seed['location_ids'].values()) and
            {r['patient_id'] for r in actual} == set(seed['patient_ids']), 'M1 seed does not match this tenant/database')
        patient = seed['patient_ids'][0]
        selected = next(r for r in actual if r['patient_id'] == patient and r['location_id'] == seed['location_ids']['Lince'])
        self.go('/agenda?appointment=' + str(selected['id']))
        with self.page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path.endswith('/telegram-link')) as pending:
            self.page.get_by_role('button', name='Crear enlace de vínculo Telegram', exact=True).click()
        check(pending.value.status == 201, 'Patient link failed')
        link = pending.value.json()
        token = parse_qs(urlsplit(link['deep_link']).query)['start'][0]
        self.e2_text('/start ' + token)
        self.e2_reply('c:' + token + ':yes')
        del token, link
        # Close the drawer before any screenshot: opaque links stay out of evidence.
        self.go('/agenda')
        contact = self.sql('SELECT status,consent_status FROM reminder_contacts WHERE id=:id', {'id': seed['contact_ids']['P']})[0]
        check(contact == {'status': 'linked', 'consent_status': 'opted_in'}, 'Signed link/consent did not persist')
        result['link_and_consent'] = 'PASS'
        if seed['scenario'] == 'adversarial':
            self.e2_adversarial()
        else:
            for site in ('Lince', 'Miraflores'):
                self.e2_prepare(site)
            result['cases']['1'] = 'PASS'
            due = sorted({r['due_at'] for r in self.e2_items() if r['status'] == 'authorized'})
            for index, instant in enumerate(due):
                self.e2_worker(instant + timedelta(seconds=1))
                if index in (0, len(due) - 1):
                    self.e2_worker(instant + timedelta(seconds=1))
                for row in self.e2_items():
                    if row['type'] == 'h1' and row['due_at'] == instant and row['status'] == 'accepted':
                        self.e2_reply(self.e2_callback(row['appointment_id']), duplicate=True)
            proof = self.e2_proof()
            check(len(proof) == 30 and all(r['status'] == 'accepted' and r['calls'] == 1 for r in proof), 'Nominal needs 30 accepted notices and one SQL-proven call each')
            result['cases']['2'] = result['cases']['10'] = 'PASS'
            confirmed = self.sql('SELECT patient_confirmed_at FROM appointments WHERE id=ANY(:ids)', {'ids': seed['appointment_ids']})
            check(all(r['patient_confirmed_at'] is not None for r in confirmed), 'Every test confirmation must persist')
            result['cases']['4'] = 'PASS'
        result['provider_send_count'] = self.e2_proof()
        check(all(r['calls'] <= 1 for r in result['provider_send_count']), 'A reminder called the fake provider twice')
        first = datetime.fromisoformat(self.env['E2_NOW'])
        last = max((row['due_at'] for row in self.e2_items()), default=first)
        end = max(first + timedelta(days=7), last + timedelta(days=1))
        query = f'from={quote((first-timedelta(days=1)).isoformat())}&to={quote(end.isoformat())}'
        totals = {}
        for site, location in seed['location_ids'].items():
            self.choose(self.env['E2_' + site.upper() + '_PERSONA'])
            coverage = self.get(f'/reminders/coverage?location_id={location}&{query}')
            for kind, counts in coverage['totals'].items():
                bucket = totals.setdefault(kind, {key: 0 for key in counts})
                for key, value in counts.items(): bucket[key] += value
            self.go('/agenda?appointment=' + str(next(r['id'] for r in actual if r['location_id'] == location)))
            self.page.reload(wait_until='networkidle')
            expect(self.page.get_by_role('region', name='Cobertura de recordatorios')).to_be_visible()
            if seed['scenario'] == 'nominal':
                expect(self.page.get_by_text('Paciente confirmó', exact=False).first).to_be_visible()
            self.snap(E2, 'coverage-' + site)
        for counts in totals.values():
            counts['percentage'] = 100 * counts['accepted_in_window'] / counts['eligible_due'] if counts['eligible_due'] else None
        result['coverage_by_type'] = totals
        result['accepted_in_window'] = accepted = sum(x['accepted_in_window'] for x in totals.values())
        result['eligible_due'] = eligible = sum(x['eligible_due'] for x in totals.values())
        result['percentage'] = 100 * accepted / eligible if eligible else None
        if seed['scenario'] == 'nominal':
            check(accepted == eligible == 30, 'HTTP coverage must measure 30/30 at the controlled clock; configure E2_CLOCK_FILE in the isolated API')
        if seed['scenario'] == 'nominal':
            with self.page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path.endswith('/opt-out')) as pending:
                self.page.get_by_role('button', name='Registrar baja de recordatorios en toda la clínica', exact=True).evaluate('(b)=>{b.click();b.click()}')
            check(pending.value.status == 200 and pending.value.json()['id'] == seed['contact_ids']['P'], 'Manual opt-out did not use canonical contact_id')
            result['manual_opt_out'] = 'PASS'
        self.go('/agente')
        self.page.locator('.activity-page').get_by_role('combobox', name='Sede', exact=True).select_option(str(seed['location_ids']['Miraflores']))
        expect(self.page.get_by_text('registró la aceptación de un recordatorio por Telegram', exact=False).first).to_be_visible()
        self.snap(E2, 'rastro')
        # Record remaining acceptance explicitly; partial adversarial runs cannot certify H1.
        required = ('3', '4', '5', '6', '7', '8', '9', '11') if seed['scenario'] == 'adversarial' else ('1', '2', '4', '10')
        check(all(result['cases'][case] == 'PASS' for case in required), 'E2 acceptance still has unverified cases')
        result['certification'] = 'PASS_' + seed['scenario'].upper()

    def e2_reschedule_available(self, appointment_id):
        appointment = self.get('/appointments/' + str(appointment_id))
        window_start = datetime.fromisoformat(appointment['start_utc']) + timedelta(minutes=1)
        available = self.api('/slots/query', 'POST', {
            'service_id': appointment['service_id'], 'location_id': appointment['location_id'],
            'window_start': window_start.isoformat(), 'window_end': (window_start + timedelta(days=14)).isoformat(),
        })
        check(available['status'] == 200, f"Availability endpoint rejected the seeded reception: HTTP {available['status']}")
        slots = sorted((slot for slot in available['body'] if slot['practitioner_id'] == appointment['practitioner_id']),
                       key=lambda slot: slot['start'])
        check(slots, 'No available slot for the existing practitioner; never invent a reschedule time')
        chosen = slots[0]
        moved = self.api('/appointments/' + str(appointment_id) + '/reschedule', 'POST', {'new_start': chosen['start']}, str(uuid4()))
        check(moved['status'] == 200, f"Available-slot reschedule failed: HTTP {moved['status']}")
        self.result['journeys'][E2].setdefault('reschedules', []).append({
            'appointment_id': appointment_id, 'previous_start': appointment['start_utc'],
            'new_start': chosen['start'], 'practitioner_id': chosen['practitioner_id'], 'source': '/slots/query'})
        return self.get('/appointments/' + str(appointment_id))

    def e2_adversarial(self):
        """Exercise stale decisions, missed sends, replies and dispatch races via real APIs."""
        from playwright.sync_api import expect
        seed, result = self.reminders, self.result['journeys'][E2]
        labels = seed['appointments_by_label']
        self.choose(self.env['E2_MIRAFLORES_PERSONA'])
        pending_link = self.api(f"/reminders/contacts/{seed['patient_ids'][2]}/telegram-link?location_id={seed['location_ids']['Miraflores']}", 'POST', None, str(uuid4()))
        check(pending_link['status'] == 201, 'Pending-consent patient link failed')
        raw = parse_qs(urlsplit(pending_link['body']['deep_link']).query)['start'][0]
        original_chat = self.e2_chat
        try:
            self.e2_chat += 10000
            self.e2_text('/start ' + raw)
        finally:
            self.e2_chat = original_chat
        del raw, pending_link
        old = self.e2_prepare('Lince', approve=False)
        candidate = old['items'][0]
        changed = self.api('/reminders/items/' + str(candidate['id']), 'PATCH',
            {'expected_revision': candidate['revision'], 'excluded': True, 'reason': 'Prueba E2 de revisión humana'}, str(uuid4()))
        check(changed['status'] == 200, 'E2 reminder edit failed')
        with self.page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path.endswith('/approve')) as pending:
            self.page.get_by_role('button', name='Autorizar envíos futuros', exact=True).click()
        check(pending.value.status == 409 and pending.value.json()['error']['code'] == 'PROPOSAL_SUPERSEDED', 'Old batch must be superseded')
        expect(self.page.get_by_text('Reemplazada:', exact=False).first).to_be_visible()
        result['cases']['9'] = 'PASS'
        self.e2_prepare('Lince', approve=False)
        self.e2_prepare('Miraflores')
        result['cases']['1'] = 'PASS'
        before_day = sorted({r['due_at'] for r in self.e2_items() if r['due_at'] >= datetime.fromisoformat(self.env['E2_NOW']) and (r['type'] == 'd1' or r['appointment_id'] == labels['late-created'])})
        for instant in before_day:
            self.e2_worker(instant + timedelta(seconds=1))
        check(any(r['status'] == 'missed' for r in self.e2_items() if r['appointment_id'] == labels['leave-undecided-missed']), 'Unapproved due reminders must be missed')
        result['cases']['3'] = 'PASS'
        confirm_id, change_id = labels['optout-miraflores-one'], labels['optout-miraflores-two']
        callback = self.e2_callback(confirm_id)
        self.e2_reply(callback, foreign=True)
        check(self.get('/appointments/' + str(confirm_id))['patient_confirmed_at'] is None, 'Forwarded button changed an appointment')
        self.e2_reply(callback)
        fixed = self.get('/appointments/' + str(confirm_id))
        self.e2_reply(callback)
        check(self.get('/appointments/' + str(confirm_id)) == fixed, 'Used button had a second effect')
        result['cases']['6'] = 'PASS'
        self.e2_reply(self.e2_callback(change_id, 'Quiero cambiar'))
        self.e2_text('Necesito revisar mis horarios')
        requests = self.get('/reminders/change-requests?location_id=' + str(seed['location_ids']['Miraflores']))
        check(any(r['source'] == 'button' and r['appointment_id'] == change_id for r in requests) and
              any(r['source'] == 'free_text' and r['appointment_id'] is None and len(r['candidate_appointment_ids']) >= 2 for r in requests), 'Change requests lost their exact/candidate scope')
        self.go('/agenda?appointment=' + str(change_id))
        self.page.reload(wait_until='networkidle')
        expect(self.page.get_by_text('Solicitud de cambio abierta para recepción.', exact=False).first).to_be_visible()
        expect(self.page.get_by_text('ninguna ha sido elegida', exact=False).first).to_be_visible()
        self.snap(E2, 'change-request')
        result['cases']['5'] = 'PASS'
        self.e2_prepare('Lince')
        merged = next(r for r in self.e2_items() if r['appointment_id'] == labels['merged-0930'] and r['type'] == 'h1')
        self.e2_worker(merged['due_at'] + timedelta(seconds=1), target=merged['id'], timeout=True)
        self.e2_worker(merged['due_at'] + timedelta(seconds=1))
        check(next(r for r in self.e2_items() if r['id'] == merged['id'])['status'] == 'uncertain', 'Timeout must remain uncertain without resend')
        cancel = next(r for r in self.e2_items() if r['appointment_id'] == labels['cancel-approved-batch'] and r['type'] == 'h09')
        self.choose(self.env['E2_LINCE_PERSONA'])
        def cancel_now():
            response = self.api('/appointments/' + str(cancel['appointment_id']) + '/cancel', 'POST', {}, str(uuid4()))
            check(response['status'] == 200, 'Cancellation at dispatch barrier failed')
        self.e2_worker(cancel['due_at'] + timedelta(seconds=1), target=cancel['id'], phase='before_call', mutation=cancel_now)
        check(next(r for r in self.e2_proof() if r['id'] == cancel['id'])['calls'] == 0, 'Cancelled reminder reached provider')
        original = labels['confirm-reschedule-old-button']
        callback = self.e2_callback(original)
        self.e2_reply(callback)
        appointment = self.get('/appointments/' + str(original))
        check(appointment['patient_confirmed_at'], 'Patient confirmation not visible')
        self.e2_reschedule_available(original)
        self.e2_reply(callback)
        current = self.get('/appointments/' + str(original))
        check(current['version'] > appointment['version'] and current['patient_confirmed_at'] is None, 'Old-version button survived reschedule')
        # Exact M1 availability may offer only next week's interval. Move the
        # two opt-out appointments to their own real slots as well, so the final
        # BAJA still precedes two future Miraflores sends after the new confirmation.
        new_start = datetime.fromisoformat(current['start_utc'])
        if new_start - datetime.fromisoformat(appointment['start_utc']) > timedelta(days=3):
            self.choose(self.env['E2_MIRAFLORES_PERSONA'])
            self.e2_reschedule_available(confirm_id)
            self.e2_reschedule_available(change_id)
            for instant in sorted({r['due_at'] for r in self.e2_items() if r['status'] == 'authorized'}):
                self.e2_worker(instant + timedelta(seconds=1))
            clock = self.env.get('E2_CLOCK_FILE')
            check(clock and Path(clock).is_absolute(), 'A future reschedule requires the isolated API clock')
            Path(clock).write_text((new_start - timedelta(days=2)).isoformat())
            self.e2_prepare('Lince')
            self.e2_prepare('Miraflores')
        else:
            self.e2_prepare('Lince')
        due = sorted({r['due_at'] for r in self.e2_items() if r['status'] == 'authorized'})
        baja = next(r for r in self.e2_items() if r['appointment_id'] == confirm_id and r['type'] == 'h1' and r['status'] == 'authorized')
        self.choose(self.env['E2_LINCE_PERSONA'])
        for instant in due:
            if instant < baja['due_at']:
                self.e2_worker(instant + timedelta(seconds=1))
                if any(r['appointment_id'] == original and r['status'] == 'accepted' and r['appointment_version'] == current['version'] for r in self.e2_items()):
                    updated = self.get('/appointments/' + str(original))
                    if updated['patient_confirmed_at'] is None: self.e2_reply(self.e2_callback(original), duplicate=True)
        check(self.get('/appointments/' + str(original))['patient_confirmed_at'], 'New-version confirmation did not persist')
        result['cases']['7'] = 'PASS'
        self.e2_worker(baja['due_at'] + timedelta(seconds=1), target=baja['id'], phase='before_call', mutation=lambda: self.e2_text('BAJA'))
        for instant in due:
            if instant >= baja['due_at']:
                self.e2_worker(instant + timedelta(seconds=1))
                self.e2_worker(instant + timedelta(seconds=1))
        check(next(r for r in self.e2_proof() if r['id'] == baja['id'])['calls'] == 0, 'BAJA at dispatch barrier reached provider')
        check(all(r['status'] != 'accepted' for r in self.e2_items() if r['appointment_id'] in (labels['unlinked-Q'], labels['pending-consent-R'])), 'Missing consent/link allowed a send')
        check(any(r['status'] == 'suppressed' and r['type'] == 'h09' for r in self.e2_items() if r['appointment_id'] == confirm_id), 'Confirmation must suppress h09')
        check(self.get('/appointments/' + str(original))['patient_confirmed_at'], 'New-version confirmation did not persist')
        result['cases']['4'] = result['cases']['8'] = result['cases']['10'] = result['cases']['11'] = 'PASS'

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
        check(E2 not in selected or selected == [E2], 'Run E2 alone with its fresh isolated seed')
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
                # Completion can outlive its Page association during navigation.
                self.page.context.on('requestfinished', self.on_request_done)
                self.page.context.on('requestfailed', self.on_request_done)
                self.page.route(re.compile(r'/api/backend/.+/(approve|claim|verification-review)$'),
                                self.on_intent_route)
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
                e2_proof = self.result['journeys'].get(E2, {})
                effects_verified = self.e2 and e2_proof.get('accepted_in_window') == e2_proof.get('eligible_due') == 30 and e2_proof.get('manual_opt_out') == 'PASS'
                if self.args.replay and (not failed or effects_verified):
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
            print('REPLAY | PASS (misma clave/cuerpo; nueva clave rechazada; SQL idéntico)' if self.result['replay'].get('result') == 'PASS' else 'REPLAY | FAIL | ' + self.result['replay'].get('error', 'Not run'))
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
            if args.journeys == E2:
                check(not args.measure_csv, 'E2 does not use E1 measurement CSV')
                seed = reminders_seed(args.seed_summary or args.run_dir / 'recordatorios-seed.json')
                print(json.dumps({'mode': 'DRY_RUN', 'journey': E2, 'run_id': seed['run_id'],
                                  'scenario': seed['scenario'], 'appointment_ids': seed['appointment_ids'],
                                  'cases': {str(number): 'NOT_RUN' for number in range(1, 13)},
                                  'certification': 'NOT_RUN'}, indent=2))
                return 0
            check(args.journeys == E1 and not args.measure_csv, '--dry-run selects one E1 or E2 journey')
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
