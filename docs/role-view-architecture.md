# Role/View Architecture

> Catalogo vigente del MVP de cinco rutas. El alcance ampliado de [`2026-09-27-plan-frontend-miguel.md`](2026-09-27-plan-frontend-miguel.md) es propuesta y requiere aprobacion expresa de Miguel y Alejandro antes de sustituirlo.

Canonical MVP decision: [`frontend-mvp-decision.md`](frontend-mvp-decision.md).

## Summary

OdontoFlow uses product roles to organize navigation and attention, not to enforce backend security. Backend
authorization remains permission-based.

The MVP has three roles and five surfaces. The design rule is:

> La fila manda.

Do not design a metric, badge, or action unless the data/action exists, can be derived honestly, or is clearly
marked as future.

## Roles

| Role | Scope | First need |
|---|---|---|
| Owner | Three locations | Real exceptions across the business |
| Administrativo | One assigned location | Today's queue and next action |
| Colaborador | Own clinical day | Schedule and next patient |

Reception is the Administrativo of a location. Doctor and specialist share Colaborador. Finance and inventory
are permissions over Caja and Inventario, not separate roles for MVP.

## Surfaces

| Surface | Route | Owner | Administrativo | Colaborador |
|---|---|---:|---:|---:|
| Inicio | `/` | Yes | Yes | Yes |
| Agenda | `/agenda` | Hidden by default | Yes | Hidden by default |
| Pacientes | `/pacientes` | Hidden by default | Yes | Hidden by default |
| Caja | `/caja` | Yes | Yes | Hidden by default |
| Inventario | `/inventario` | Yes | Yes | Hidden by default |

Five surfaces do not mean every role sees five menu items.

## Not MVP Routes

Do not create routes for Confirmaciones, Sedes, Comercial, Producción, Finanzas, Laboratorios, Solicitudes,
Administración, NubeFact, or Copiloto in this phase.

If a concept matters, place it as a small state/section inside an existing surface or document the backend
contract it needs.

## Design Order

1. Inicio Administrativo / Cola del día.
2. Agenda de sede.
3. Pacientes, separating lead and patient.
4. Caja.
5. Inventario.
6. Inicio Owner.
7. Mi día Colaborador.

## Source Rules

- `DESIGN.md` owns the visual contract: dark shell, white canvas, flat data surfaces, brand cyan for identity
  and primary action.
- `frontend-mvp-decision.md` owns MVP scope.
- Backend permissions own authorization; demo roles are not auth.
