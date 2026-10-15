"""Mint test-only human credentials, optionally seed the real AIRI journey."""
import argparse
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("backend", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--scenario", action="store_true")
args = parser.parse_args()
root = args.backend.resolve()
sys.path[:0] = [str(root), str(root / "tests")]

from sqlalchemy.engine import make_url

database = make_url(os.environ["DATABASE_URL"]).database or ""
if not (database == "odontoflow_e2e" or database.startswith("odontoflow_test_")):
    raise SystemExit("El seed AIRI E2E solo admite bases de pruebas.")

from app.db import SessionLocal
from app.iam.credentials import issue_credential
from app.iam.permissions import PERMISSION_CODES
from app.iam.service import add_membership, assign_role, create_principal, create_role, grant_permission
from app.tenancy import BOOTSTRAP_ORGANIZATION_ID
from airi_agent.scenarios import SCENARIOS

with SessionLocal() as session:
    if args.scenario:
        from test_kinds_agenda import _agenda
        _agenda(session)
    principal = create_principal(session, display_name="Persona E2E AIRI", principal_type="human")
    membership = add_membership(session, organization_id=BOOTSTRAP_ORGANIZATION_ID, principal_id=principal.id)
    role = create_role(session, organization_id=BOOTSTRAP_ORGANIZATION_ID, code=f"e2e-{uuid4().hex}", name="E2E")
    for code in PERMISSION_CODES:
        grant_permission(session, role_id=role.id, permission_code=code)
    assign_role(session, organization_id=BOOTSTRAP_ORGANIZATION_ID, membership_id=membership.id, role_id=role.id)
    _, token = issue_credential(session, organization_id=BOOTSTRAP_ORGANIZATION_ID, principal_id=principal.id, name="E2E")
    session.commit()
args.output.touch(mode=0o600, exist_ok=True)
args.output.write_text(json.dumps({"token": token, "ask": SCENARIOS["admin-confirma"].ask}))
