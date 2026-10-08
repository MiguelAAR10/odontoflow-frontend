#!/usr/bin/env python3
"""I0 browser journeys. Only the local sandbox dispatcher bypasses the BFF."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import sys
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import UUID, uuid4


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
        check(not (self.root / 'journeys.json').exists(), 'Use a new RUN_ID, not an existing journey run')
        self.engine = create_engine(self.env['DATABASE_URL'])
        self.shots = self.root / 'shots'
        self.shots.mkdir(exist_ok=True)
        self.result = {'base': args.base, 'api': args.api, 'journeys': {}, 'intents': [],
                       'responses': [], 'replay': {}, 'started_at': datetime.now(timezone.utc).isoformat()}
        self.person = None
        self.requests = {}
        self.inventory = None
        self.page_errors = []

    def redact(self, value):
        value = str(value)
        for key, secret in self.env.items():
            if secret and any(word in key for word in ('TOKEN', 'SECRET', 'CODE', 'CREDENTIAL', 'URL', 'HUMANS')):
                value = value.replace(secret, '[REDACTED]')
        return re.sub(r'postgres(?:ql)?(?:\+\w+)?://\S+', '[REDACTED_DSN]', value)

    def sql(self, query):
        from sqlalchemy import text
        with self.engine.connect() as connection:
            connection.exec_driver_sql('SET TRANSACTION READ ONLY')
            return [dict(row) for row in connection.execute(text(query)).mappings()]

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
            self.requests[request] = self.person

    def on_response(self, response):
        if '/api/backend/' not in response.url:
            return
        request = response.request
        check('authorization' not in request.headers, 'Browser exposed a bearer credential')
        row = {'path': urlsplit(response.url).path, 'method': request.method, 'status': response.status,
               'requested_as': self.requests.get(request), 'received_as': self.person}
        self.result['responses'].append(row)
        if request.method == 'POST' and re.search(r'/(approve|claim)$', row['path']) and response.status == 200:
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
        if self.page.get_by_role('heading', name='Elige quién eres', exact=True).count() == 0:
            self.page.get_by_role('button', name=re.compile('Cambiar de persona')).click()
        code = self.page.get_by_label('Código de acceso')
        if code.count():
            code.fill(self.env['BFF_ACCESS_CODE'])
        previous = self.person
        # Attribute requests started by the new UI identity to the chosen session.
        self.person = person
        self.page.get_by_role('button', name=re.compile(person)).last.click()
        self.page.wait_for_load_state('networkidle')
        expect(self.page.get_by_role('heading', name='Elige quién eres', exact=True)).to_have_count(0)
        expect(self.page.locator('.persona-switcher__text')).to_contain_text(person)
        start = len(self.result['responses'])
        self.page.wait_for_timeout(2000)
        late = [row for row in self.result['responses'][start:] if row['requested_as'] != person]
        self.result.setdefault('session_switches', []).append({'from': previous, 'to': person, 'wait_ms': 2000, 'late_responses': len(late)})
        check(not late, f'Late responses from previous session: {late}')
        me = self.get('/me')
        check(me['principal']['display_name'] == person and me['principal']['type'] == 'human', f'Wrong /me: {me}')
        return me

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
        self.page.evaluate("async () => { await fetch('/api/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:null})}); }")
        self.person = None
        check(self.api('/me')['status'] == 401, 'Logout must return 401')
        self.go('/agenda')
        expect(self.page.get_by_role('heading', name='Elige quién eres', exact=True)).to_be_visible()
        start = len(self.result['responses'])
        self.page.wait_for_timeout(2000)
        late = self.result['responses'][start:]
        check(not late, f'Late backend responses after logout: {late}')
        self.result['journeys']['J1']['logout'] = {'status': 401, 'wait_ms': 2000, 'late_responses': len(late)}
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

    def replay(self):
        before = self.snapshot()
        results = []
        failure = None
        for intent in list(self.result['intents']):
            self.choose(intent['person'])
            same = self.api(intent['path'], 'POST', intent['body'], intent['key'])
            check(same['status'] == 200 and same['replay'] == 'true', f'Replay failed: {same}')
            check(same['body'] == intent['result'], 'Replay result changed')
            other_key = str(uuid4())
            other = self.api(intent['path'], 'POST', intent['body'], other_key)
            results.append({'path': intent['path'], 'same_key': intent['key'], 'same': same,
                            'new_key': other_key, 'new': other})
            self.result['replay']['requests'] = results
            if other['status'] != 409:
                failure = f"New key must return 409: {other}"
                break
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
        check(all(x in ('J1', 'J2', 'J3', 'J4', 'J5') for x in selected), 'Unknown journey')
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
                self.go('/agenda')
                self.result['initial_sql'] = self.snapshot()
                for journey in selected:
                    self.result['journeys'][journey] = {'result': 'FAIL', 'shots': []}
                    try:
                        getattr(self, journey)()
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
            print('REPLAY | FAIL | ' + self.result['replay'].get('error', 'Not run') if failed else 'REPLAY | PASS (200 true; nueva clave 409; SQL idéntico)')
        self.engine.dispose()
        return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--api', default='http://127.0.0.1:8110')
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--journeys', default='J1,J2,J3,J4,J5')
    parser.add_argument('--replay', action='store_true')
    args = parser.parse_args()
    runner = None
    try:
        runner = Journeys(args)
        return runner.run()
    except Exception as error:
        print('FAIL: ' + (runner.redact(error) if runner else type(error).__name__ + ': check private env and prerequisites'), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
