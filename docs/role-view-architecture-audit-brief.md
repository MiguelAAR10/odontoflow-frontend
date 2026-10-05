# Role/View Architecture Audit Brief

## Purpose

This document is a neutral brief for an independent agent to audit the proposed role/view architecture for
OdontoFlow / Odonto Smart.

The goal is not to approve the current proposal. The goal is to test whether it is correct, complete,
well-prioritized, and implementable for the actual business and codebase.

## Request To Auditor

Audit the current role/view architecture and provide a verdict.

Please identify:

1. What is strong or directionally correct.
2. What is wrong, unsupported, vague, overbuilt, or premature.
3. What is missing from the role model.
4. What is missing from the view map.
5. Which views should be merged, renamed, delayed, or removed.
6. Which proposed metrics/actions are not supported by the current backend.
7. Which parts should be designed now versus documented for later.
8. A recommended revised structure of roles, views, and responsibilities.

Do not assume the existing proposal is correct. Prefer evidence from the project files and business context.

## Business Context

Odonto Smart is a dental clinic group with three Lima locations:

- Lince
- Jesús María
- Magdalena

The business has manual operational processes around:

- WhatsApp communication
- lead follow-up
- appointment scheduling
- confirmations and reminders
- no-shows and cancellations
- patient reactivation
- doctor/specialist coordination
- payments and cash closing
- inventory between locations
- management visibility

The product direction is an operational system for clinic workflows. The backend is intended to remain the
source of truth for domain rules, authorization, idempotency, and audit.

## User Input That Triggered This Work

The user described three product roles:

- Owner
- Administrativo
- Colaboradores

The user’s rough intended structure:

- Owner should have a home page showing:
  - sales by location
  - attendance rate
  - lead conversion
  - quantity of services
  - specialties

- Administrativo should have a per-location view showing:
  - calendar of the day
  - patient
  - doctor
  - confirmation status
  - generate payment event
  - name
  - payment method
  - treatment
  - optional NubeFact
  - create new patient

- Colaboradores/doctors should have:
  - schedule
  - patients

The user also provided a hand-drawn/whiteboard-style screenshot with the same rough grouping. Treat the
screenshot as business context, not as a final UI specification.

## Current Proposal To Audit

The current proposal is documented here:

- `docs/role-view-architecture.md`

Summary of that proposal:

### Roles

1. Owner
2. Administrativo
3. Colaborador

### Proposed Owner Views

1. Inicio ejecutivo
2. Sedes
3. Comercial
4. Producción
5. Finanzas
6. Inventario
7. Administración

### Proposed Administrativo Views

1. Inicio sede
2. Agenda
3. Confirmaciones
4. Pacientes/Leads
5. Atención y cobro
6. Caja
7. Inventario sede
8. Laboratorios

### Proposed Colaborador Views

1. Mi día
2. Mis pacientes
3. Registro clínico
4. Solicitudes

Total proposed primary views: 19 if counted per role, with overlap; 15 distinct conceptual views were
summarized conversationally before this brief. Please audit the counting and whether these should be distinct
views or reused modules.

## Implementation Already Started

A lightweight demo implementation was added to visualize the concept:

- `src/roles.ts`
- `src/components/Topbar.tsx`
- `src/components/LocationContext.tsx`
- `src/views/HomePage.tsx`
- `src/index.css`

What it does:

- Adds a local `Rol demo` selector using `localStorage`.
- Makes `/` render a role-adaptive Home:
  - Owner dashboard
  - Administrativo operational queue
  - Colaborador clinical day

This is exploratory UI scaffolding, not final auth/permissions.

## Important Backend Constraints

The backend does not authorize by literal role names. It uses permission codes.

Relevant source:

- `../OdontoFlow/docs/rules-and-permissions.md`

Important rule:

- Do not build backend/security assumptions around `if role == "owner"`.
- Product roles may map to navigation and default scopes, but actual permission enforcement should be
  permission-based.

Existing permission examples include:

- `appointments.read/create/reschedule/cancel`
- `patients.read/create`
- `visits.read/create`
- `executions.read/create`
- `services.read/manage`
- `leads.read/create`
- `locations.read/manage`
- `practitioners.read/manage`
- `capabilities.read/manage`
- `availability.read/manage`
- `products.read/create`
- `consumptions.read/create`
- `charges.read/create`
- `payments.read/create`
- `movements.read/create`
- `audit.read`

## Current Product/Backend Reality To Consider

Please verify this from the repo rather than trusting this summary.

Likely current state:

- Agenda/Scheduling exists and is real.
- Leads exist at least partially.
- Patients, charges/payments, inventory have frontend adapters and may have backend support depending on
  current branch state.
- Chat, Agent, voice, NubeFact, follow-up automation, no-show attribution, and full clinical recording may
  still be prototype/future areas.

Relevant sources:

- `README.md`
- `docs/frontend-architecture.md`
- `../OdontoFlow/docs/flows.md`
- `../OdontoFlow/docs/product-vision.md`
- `../OdontoFlow/docs/integration/frontend-backend-contract.md`
- `PROJECT_CONTEXT.md — Contexto general del proyecto Odonto Smart.md`

## Questions For Auditor

### Role Model

1. Are Owner, Administrativo, and Colaborador sufficient?
2. Should “Colaborador” be split into Doctor, Especialista, Asistente, or Recepción?
3. Is “Administrativo” actually a branch receptionist/operator, or a broader finance/admin role?
4. Should there be a Superadmin/system role, or is that only internal?
5. Should access be scoped by location, practitioner, or both?

### View Model

1. Are there too many views?
2. Which views should be top-level navigation versus sections inside a dashboard?
3. Are Confirmaciones, Agenda, and Inicio sede separate views or one operational workbench?
4. Are Atención y cobro and Caja separate enough to deserve separate views?
5. Should Laboratorios be part of MVP or later?
6. Should Inventario appear for Administrativo, Owner, both, or only a specific inventory role?
7. Should Colaborador have only “Mi día” at first?

### Metrics

1. Can sales by location be computed today?
2. Can attendance rate be computed today, or does it need Visit/no-show instrumentation?
3. Can lead conversion be computed today?
4. Can quantity of services/specialties be computed today?
5. Which metrics are real, derived, prototype, or future?

### Workflow Fit

1. Does the proposed structure match the actual clinic workflows?
2. Does it reduce manual work or just re-label existing screens?
3. Does it help prevent lost leads, no-shows, empty slots, missed payments, and inventory mismatches?
4. Does it create unnecessary complexity before the backend supports it?

### UI/UX Fit

1. Does the proposed navigation match daily user priorities?
2. Is the Owner home too dashboard-heavy or appropriate?
3. Is the Administrativo home actionable enough?
4. Is the Colaborador home too sparse or too broad?
5. What should the first screen be for each role?

## Desired Auditor Output

Please produce:

1. A concise verdict: accept, revise, or reject.
2. Major findings, ordered by severity.
3. A corrected role list.
4. A corrected view list by role.
5. A table of each view with:
   - purpose
   - primary user
   - data needed
   - current backend support
   - MVP / later classification
6. Any recommended changes to the current demo implementation.

## Non-Goals For Auditor

Do not implement UI changes unless explicitly asked later.

Do not assume every proposed view must exist as a route.

Do not optimize for agreeing with the current proposal.

Do not ignore backend constraints.

Do not treat the screenshot as a pixel-perfect design.

