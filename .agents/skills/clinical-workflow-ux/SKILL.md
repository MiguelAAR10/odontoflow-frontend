---
name: clinical-workflow-ux
description: Design clear, low-friction clinic workflows for Owner, Administrative, and Doctor roles in OdontoFlow. Use when changing navigation, queues, forms, detail panels, status transitions, patient handoffs, or role-specific home views.
---

# Clinical Workflow UX

Make the next safe action obvious to a busy clinic team. Reduce memory burden, prevent role confusion, and keep the work anchored to the patient, appointment, visit, or stock item the user selected.

## Start from the person's job

- Owner: understand multi-location performance and exceptions, then decide where to intervene.
- Administrative: keep today's clinic moving; resolve confirmations, arrivals, delays, follow-ups, payments, and stock tasks that are actually in scope.
- Doctor: prepare for the next patient, complete the clinical encounter, review active treatment and open clinical work. Payment is not a Doctor action.

For every route, identify the role, starting context, primary question, one main action, likely next step, and any action the role must not see. Do not make all roles share one generic dashboard with different headings.

## Interaction rules

- Preserve context across navigation and detail: selected patient, date, location, service, and amount should stay visibly attached to the action.
- Use a queue/list when users must identify and resolve specific records. Use a chart when comparison, trend, composition, or load is the task. Pair charts with exact records only when both add value.
- Make action labels describe outcomes (`Registrar llegada`, `Reprogramar cita`, `Registrar pago`), and keep the same terminology through confirmation and completion feedback.
- Put detail in a side panel or focused route when it helps a fast comparison; use a modal only for a short, interruptive decision. Do not hide the work surface behind an oversized panel.
- Ask for confirmation only when the action is consequential or hard to reverse. Show what will change, preserve input after recoverable errors, and prevent accidental double submission.
- Keep safe actions reversible where the domain permits. Never promise undo or rollback unless implemented.
- Keep status vocabulary identical across home, agenda, notifications, and details. A date/time must include the correct day and timezone when it is not the current day.
- Prefer progressive disclosure over explanatory paragraphs. Hide secondary metadata until requested, but keep the identity and consequence of an action visible.
- Empty states should state the useful condition and offer a valid next step; they must not imitate activity with fabricated records.

## Role and privacy boundaries

Navigation visibility is not authorization. Enforce existing capabilities and route guards, and do not create new role permissions in the client. Clinical notes must only be visible/editable where the existing product policy allows. Never expose payment controls in Doctor workflows. Do not allow a row action to silently target a different patient or charge.

## Before calling a flow usable

Test its happy path, validation failure, recoverable server error, repeated submission, keyboard-only operation, mobile layout, and return path in an isolated scenario. Check that a user can answer: what happened, what changed, and what should I do next? Record unsupported states as unavailable rather than simulating them as real.
