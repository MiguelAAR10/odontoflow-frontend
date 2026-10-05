# Agentic Operations Inspiration Research

Date: 2026-09-24

Purpose: understand the references raised for OdontoFlow before designing the frontend again. This is not a
technology commitment. It is a product/architecture inspiration map.

## Executive Take

The direction should not be "ERP dental dashboard". It should be:

> Clinical operations command center with agentic workflows and human approval.

For the MVP UI, this means:

- show the day as a work queue
- show each row's state and next action
- show tools/integrations as capabilities around the row
- keep critical actions human-confirmed
- keep the backend as source of truth
- use agents as assistants/workers, not as hidden domain authority

## References Reviewed

### CopilotKit

Source: https://github.com/CopilotKit/CopilotKit

CopilotKit describes itself as a frontend stack for agent-native applications. Relevant claims:

- supports generative UI, shared state and human-in-the-loop workflows
- supports React and other surfaces
- agents can render backend tool UI directly in the client
- shared state lets UI and agents read/write the same state
- rich threads persist with generative UI

What OdontoFlow should borrow:

- copilots should live inside operational surfaces, not as a disconnected chat page
- the agent panel should understand the selected row/case
- human-in-the-loop is the default for appointments, payments and invoices
- tool results can be UI, not just text

What not to copy now:

- do not make Copilot the hero before the operational row is right
- do not let agent-generated UI invent domain state
- do not install a framework before the product shape is clear

Product translation:

- right panel: "Copiloto de sede"
- context: selected appointment/patient/charge/product
- output: suggested action, draft message, blocked tool, explanation
- approval: every external/mutating action requires user confirmation

## assistant-ui

Source: https://www.assistant-ui.com/docs

assistant-ui is a React component/runtime system for AI chat interfaces. It emphasizes surfaces, runtimes and
primitives for React, React Native and terminal, and it can connect to several backend runtimes including
LangGraph, LangChain, AG-UI and custom servers.

What OdontoFlow should borrow:

- composable assistant UI primitives
- bring-your-own-backend approach
- thread, tool UI and generative UI concepts

What not to copy now:

- do not make the main experience a ChatGPT clone
- do not hide operational tasks behind free-form chat

Product translation:

- chat is a supporting panel
- the main surface remains rows, queues and forms
- assistant messages should cite the relevant row/action

## MCP / MCP Apps / WebMCP

Sources:

- MCP Apps: https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- WebMCP: https://webmachinelearning.github.io/webmcp/
- MCP tools spec: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx

MCP lets models call structured tools. MCP Apps extends that so tools can return rich interactive UI inside a
conversation. WebMCP explores exposing web app functionality as tools directly from client-side JavaScript.

What OdontoFlow should borrow:

- every important app action should eventually have a typed tool shape
- tools should expose capabilities, preconditions and required approval
- rich tool UI is useful for things like invoice previews, patient review, inventory adjustment confirmation

What not to copy now:

- WebMCP is early and security-sensitive; do not base production workflow on browser-exposed tools yet
- do not expose destructive tools casually
- do not confuse "agent can call tool" with "agent is authorized"

Product translation:

- model future actions as tools:
  - create_visit
  - create_execution
  - create_charge
  - register_payment
  - generate_invoice_draft
  - send_whatsapp_draft
  - reserve_slot
- UI should show tool readiness:
  - ready
  - requires data
  - requires backend
  - requires approval
  - unavailable

## LangGraph / LangChain

Sources:

- https://www.langchain.com/langgraph
- https://langchain-ai.github.io/langgraph/reference/

LangGraph is a low-level orchestration framework for long-running, stateful agents. It is useful when workflows
need deterministic + agentic steps, persistence, memory, human-in-the-loop and fine-grained control.

What OdontoFlow should borrow:

- think in explicit workflow states
- make patient/cita/cobro processes visible as graphs
- long-running follow-up flows can be modeled outside the UI
- state transitions should be observable and resumable

What not to copy now:

- do not implement LangGraph before the first workflow contract is clear
- do not use agent orchestration to bypass backend invariants

Product translation:

- display mini state chains:
  - Lead -> Appointment
  - Appointment -> Visit -> Execution -> Charge -> Payment
  - Charge -> Invoice Draft -> NubeFact -> SUNAT Accepted
  - Product -> Movement -> Balance
- UI language should be "step/state/action", not only "chat"

## n8n

Source: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode

n8n is visually inspiring because it models automations as nodes and flows. On scalability, the nuance matters:
n8n can scale using queue mode with main instances, workers, Redis and Postgres. The official docs call queue
mode its best scalability mode and describe worker processes consuming queued executions.

What OdontoFlow should borrow:

- visual language of connected tools and workflows
- clear node status: pending, running, failed, needs approval, done
- self-hostable automation mindset

What not to copy:

- do not make n8n the system of record
- do not use n8n as the core transactional backend for appointments/payments/inventory
- do not rely on workflow automation for constraints that belong in PostgreSQL/FastAPI

Product translation:

- n8n-like visualization for automation health/future workflows
- "manual now, automatable later" chips
- keep domain state in OdontoFlow, not in an automation tool

## Grok Bot / Persistent Agent Teammates

Sources:

- https://docs.x.ai/grok-bot/bots
- https://x.ai/bot
- https://www.youtube.com/watch?v=F1_0Lkp16Rc

Grok Bot frames agents as durable teammates with a name, a job, a conversation and persistent working context.
Official docs recommend creating separate bots by goal, ownership, tool set, working style, approval boundary
and recurring schedule.

What OdontoFlow should borrow:

- durable specialized helpers, not one generic helper
- explicit job descriptions and approval boundaries
- agent memory is useful but not source of truth
- group/handoff model can inspire staff + automation visibility

What not to copy:

- do not give hidden agents broad clinic permissions
- do not rely on agent memory for patient/cash/inventory facts
- do not create many bots in MVP

Product translation:

- future named assistants:
  - Confirmaciones
  - Cobros pendientes
  - Inventario crítico
  - Facturación
- MVP should show these as future capabilities around the work queue, not as active autonomous workers.

## NubeFact / Facturas Electronicas / Boletas

Sources:

- NubeFact API integration blog: https://blog.nubefact.com/nubefact/integracion-api-nubefact-facturacion-electronica-sin-limites-de-lenguaje-de-programacion
- SUNAT boleta electronica: https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta
- SUNAT factura electronica: https://cpe.sunat.gob.pe/tipos_de_comprobantes/factura

NubeFact says API integration needs a route, auth token and JSON/TXT payload, and returns PDF/XML, sends to
SUNAT and stores CDR. SUNAT rules distinguish facturas, boletas, summaries, cancellation and consultation.

What OdontoFlow should borrow:

- invoice/boleta is a downstream document from a real charge/payment context
- UI must show the compliance state, not just "paid"
- PDF/XML/CDR are artifacts that should be stored/viewable

What not to do now:

- do not put "NubeFact" as a shiny module before charge/payment is solid
- do not draw "Emitir boleta" from a bare appointment
- do not assume factura and boleta have same flow

Product translation:

- Caja row may later show:
  - Charge created
  - Payment registered
  - Comprobante draft
  - Sent to NubeFact
  - SUNAT accepted/rejected
  - PDF/XML/CDR available
- For MVP, mark NubeFact as future unless the backend contract exists.

## VPS / Self-hosting

Sources:

- Dokploy docs: https://docs.dokploy.com/docs/core
- Dokploy Docker Hub: https://hub.docker.com/r/dokploy/dokploy
- CapRover docs: https://caprover.com/docs/get-started
- n8n queue mode docs above

Dokploy and CapRover are self-hostable PaaS options on VPS. Dokploy positions itself as an open-source
alternative to Heroku/Vercel/Netlify using Docker/Traefik and supports apps/databases/backups.

What OdontoFlow should borrow:

- boring deploys
- Postgres, Redis, app, workers as explicit services
- backups and observability from day one if self-hosting

What not to do now:

- do not let infra choices drive UI
- do not add n8n/Redis/workers before a workload needs it

Product translation:

- future architecture may be:
  - Next frontend
  - FastAPI backend
  - PostgreSQL
  - Redis for queues if needed
  - background worker for reminders/facturacion
  - object storage for PDFs/XML/CDR
  - optional n8n for non-core automations

## Grobo

The reference "grobo" is ambiguous. Search results did not produce a clearly relevant product matching the
rest of the stack. It may have meant Grok Bot, Groq, or another automation/agent product. Treat this as
unresolved until clarified.

## Design Implications

The next Figma screen should not be a generic table. It should be a clinical command center:

1. Work queue as the center.
2. Selected row has a state chain.
3. Tool/integration rail shows what can help:
   - WhatsApp
   - Agenda
   - Caja
   - Inventario
   - NubeFact
   - Copiloto
4. Every tool/action has a status:
   - ready
   - needs approval
   - blocked
   - future
5. The assistant panel is contextual to the selected row.
6. Critical actions are explicit confirmations, never hidden automation.

## Proposed Product Metaphor

> OdontoFlow is not a dashboard. It is an operations cockpit where rows become workflows and assistants help
> humans move them forward safely.

## Recommended Next Figma Direction

Screen: `Inicio Administrativo / Hoy en Lince`

Layout:

- dark shell
- top search/context
- center: "Hoy en Lince" with selected next patient
- below/left: work queue
- right: tools/agent rail
- bottom/right: mini workflow chain for selected row

Visual language:

- compact operational cards, not Excel table
- n8n-like step chips/connectors only for selected row
- CopilotKit-like agent rail, but subordinate to the row
- status honesty chips: real, derived, future, blocked

Avoid:

- KPI strip
- generic dashboard cards
- fully free-form chat hero
- autonomous bot roster
- percentages without data

