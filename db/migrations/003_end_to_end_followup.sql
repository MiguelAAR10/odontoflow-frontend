BEGIN;

ALTER TABLE appointments
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN reschedule_requested_at timestamptz;

UPDATE appointments SET confirmed_at = updated_at WHERE appointment_status = 'CONFIRMED';
UPDATE appointments SET cancelled_at = updated_at WHERE appointment_status = 'CANCELLED';
UPDATE appointments SET reschedule_requested_at = updated_at
WHERE appointment_status = 'RESCHEDULE_REQUESTED';

ALTER TABLE appointments ADD CONSTRAINT appointments_state_timestamps_check CHECK (
  (appointment_status = 'CONFIRMED') = (confirmed_at IS NOT NULL)
  AND (appointment_status = 'CANCELLED') = (cancelled_at IS NOT NULL)
  AND (appointment_status = 'RESCHEDULE_REQUESTED') = (reschedule_requested_at IS NOT NULL)
);

CREATE TYPE reception_task_type AS ENUM ('RESCHEDULE_REQUEST');
CREATE TYPE reception_task_status AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE simulated_reception_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  task_type reception_task_type NOT NULL,
  status reception_task_status NOT NULL DEFAULT 'OPEN',
  description text NOT NULL CHECK (btrim(description) <> ''),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL)),
  UNIQUE (simulation_session_id, appointment_id, task_type)
);

CREATE INDEX simulated_reception_tasks_open_idx
  ON simulated_reception_tasks (simulation_session_id, created_at)
  WHERE status = 'OPEN';

COMMIT;
