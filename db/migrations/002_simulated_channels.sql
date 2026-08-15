BEGIN;

CREATE TYPE simulated_delivery_status AS ENUM ('DELIVERED_SIMULATED');
CREATE TYPE simulated_response_action AS ENUM (
  'CONFIRM', 'REQUEST_RESCHEDULE', 'CANCEL', 'NO_RESPONSE'
);
CREATE TYPE simulated_call_result AS ENUM (
  'ANSWERED_CONFIRMED', 'ANSWERED_CANCELLED', 'ANSWERED_RESCHEDULE',
  'NO_ANSWER', 'WRONG_NUMBER', 'PENDING'
);

CREATE TABLE simulated_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulated_message_id text NOT NULL UNIQUE CHECK (btrim(simulated_message_id) <> ''),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  contact_attempt_id uuid NOT NULL,
  patient_name text NOT NULL CHECK (btrim(patient_name) <> ''),
  recipient_phone text NOT NULL CHECK (recipient_phone ~ '^\+1-202-555-01[0-9]{2}$'),
  branch_name text NOT NULL CHECK (btrim(branch_name) <> ''),
  attempt_type contact_attempt_type NOT NULL,
  message_text text NOT NULL CHECK (btrim(message_text) <> ''),
  delivery_status simulated_delivery_status NOT NULL DEFAULT 'DELIVERED_SIMULATED',
  sent_at timestamptz NOT NULL,
  response_action simulated_response_action,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_attempt_id, simulation_session_id)
    REFERENCES contact_attempts(id, simulation_session_id) ON DELETE CASCADE,
  CHECK ((response_action IS NULL) = (responded_at IS NULL)),
  UNIQUE (simulation_session_id, appointment_id, attempt_type),
  UNIQUE (id, simulation_session_id)
);

CREATE TABLE simulated_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  contact_attempt_id uuid NOT NULL,
  patient_name text NOT NULL CHECK (btrim(patient_name) <> ''),
  phone text NOT NULL CHECK (phone ~ '^\+1-202-555-01[0-9]{2}$'),
  attempt_type contact_attempt_type NOT NULL,
  attempted_at timestamptz NOT NULL,
  result simulated_call_result NOT NULL DEFAULT 'PENDING',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_attempt_id, simulation_session_id)
    REFERENCES contact_attempts(id, simulation_session_id) ON DELETE CASCADE,
  UNIQUE (simulation_session_id, appointment_id, attempt_type),
  UNIQUE (id, simulation_session_id)
);

CREATE TABLE simulated_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  simulated_event_id text NOT NULL CHECK (btrim(simulated_event_id) <> ''),
  message_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  action simulated_response_action NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (message_id, simulation_session_id)
    REFERENCES simulated_whatsapp_messages(id, simulation_session_id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  UNIQUE (simulation_session_id, simulated_event_id)
);

CREATE INDEX simulated_whatsapp_inbox_idx
  ON simulated_whatsapp_messages (simulation_session_id, sent_at DESC);
CREATE INDEX simulated_calls_inbox_idx
  ON simulated_call_attempts (simulation_session_id, attempted_at DESC);
CREATE INDEX simulated_inbound_appointment_idx
  ON simulated_inbound_events (appointment_id, occurred_at DESC);

CREATE TRIGGER simulated_call_attempts_updated_at
BEFORE UPDATE ON simulated_call_attempts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
