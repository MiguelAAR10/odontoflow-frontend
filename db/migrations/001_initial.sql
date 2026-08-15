BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE appointment_status AS ENUM (
  'SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED',
  'CANCELLED', 'COMPLETED', 'NO_SHOW'
);
CREATE TYPE followup_status AS ENUM (
  'PENDING', 'WHATSAPP_SENT', 'CALL_REQUIRED', 'CONTACTED',
  'CONFIRMED', 'NO_RESPONSE', 'CLOSED'
);
CREATE TYPE contact_attempt_type AS ENUM (
  'DAY_BEFORE_09AM', 'DAY_BEFORE_CALL_12PM',
  'DAY_BEFORE_CALL_04PM', 'SAME_DAY_09AM', 'ONE_HOUR_BEFORE'
);
CREATE TYPE contact_channel AS ENUM ('WHATSAPP', 'CALL');
CREATE TYPE contact_attempt_status AS ENUM ('PENDING', 'SENT', 'ANSWERED', 'FAILED', 'SKIPPED');
CREATE TYPE whatsapp_direction AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE calendar_event_status AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^\+1-202-555-01[0-9]{2}$'),
  is_fictitious boolean NOT NULL DEFAULT true CHECK (is_fictitious),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  time_zone text NOT NULL DEFAULT 'America/Lima' CHECK (time_zone = 'America/Lima'),
  is_fictitious boolean NOT NULL DEFAULT true CHECK (is_fictitious),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  specialty text,
  is_fictitious boolean NOT NULL DEFAULT true CHECK (is_fictitious),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, display_name),
  UNIQUE (id, branch_id)
);

CREATE TABLE simulation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  time_zone text NOT NULL DEFAULT 'America/Lima' CHECK (time_zone = 'America/Lima'),
  simulated_now timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE simulated_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status calendar_event_status NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (id, simulation_session_id)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  doctor_id uuid NOT NULL,
  calendar_event_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  appointment_status appointment_status NOT NULL DEFAULT 'SCHEDULED',
  followup_status followup_status NOT NULL DEFAULT 'PENDING',
  cancellation_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((appointment_status = 'CANCELLED') = (cancellation_reason IS NOT NULL)),
  FOREIGN KEY (doctor_id, branch_id) REFERENCES doctors(id, branch_id),
  FOREIGN KEY (calendar_event_id, simulation_session_id)
    REFERENCES simulated_calendar_events(id, simulation_session_id),
  UNIQUE (calendar_event_id),
  UNIQUE (id, simulation_session_id)
);

CREATE TABLE reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_type contact_attempt_type NOT NULL,
  channel contact_channel NOT NULL,
  day_offset integer NOT NULL CHECK (day_offset IN (-1, 0)),
  local_time time,
  minutes_before integer CHECK (minutes_before > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((local_time IS NOT NULL)::int + (minutes_before IS NOT NULL)::int = 1),
  UNIQUE (attempt_type),
  UNIQUE (id, attempt_type, channel)
);

CREATE TABLE contact_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  reminder_rule_id uuid,
  attempt_type contact_attempt_type NOT NULL,
  channel contact_channel NOT NULL,
  status contact_attempt_status NOT NULL DEFAULT 'PENDING',
  scheduled_for timestamptz NOT NULL,
  attempted_at timestamptz,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  result_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  FOREIGN KEY (reminder_rule_id, attempt_type, channel)
    REFERENCES reminder_rules(id, attempt_type, channel),
  UNIQUE (simulation_session_id, idempotency_key),
  UNIQUE (appointment_id, attempt_type),
  UNIQUE (id, simulation_session_id)
);

CREATE TABLE whatsapp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid,
  contact_attempt_id uuid,
  simulated_external_event_id text NOT NULL CHECK (btrim(simulated_external_event_id) <> ''),
  direction whatsapp_direction NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_attempt_id, simulation_session_id)
    REFERENCES contact_attempts(id, simulation_session_id) ON DELETE SET NULL (contact_attempt_id),
  UNIQUE (simulation_session_id, simulated_external_event_id)
);

CREATE TABLE appointment_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  simulation_session_id uuid NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  from_appointment_status appointment_status,
  to_appointment_status appointment_status NOT NULL,
  from_followup_status followup_status,
  to_followup_status followup_status NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, simulation_session_id)
    REFERENCES appointments(id, simulation_session_id) ON DELETE CASCADE
);

CREATE INDEX appointments_upcoming_idx
  ON appointments (simulation_session_id, starts_at)
  WHERE appointment_status NOT IN ('CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE INDEX appointments_branch_start_idx ON appointments (branch_id, starts_at);
CREATE INDEX appointments_followup_idx ON appointments (simulation_session_id, followup_status, starts_at);
CREATE INDEX contact_attempts_due_idx ON contact_attempts (simulation_session_id, scheduled_for)
  WHERE status = 'PENDING';
CREATE INDEX whatsapp_events_appointment_idx ON whatsapp_events (appointment_id, occurred_at);
CREATE INDEX appointment_history_lookup_idx ON appointment_status_history (appointment_id, changed_at DESC);
CREATE INDEX calendar_events_upcoming_idx ON simulated_calendar_events (simulation_session_id, starts_at)
  WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_appointment_status_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
     OLD.appointment_status IS DISTINCT FROM NEW.appointment_status OR
     OLD.followup_status IS DISTINCT FROM NEW.followup_status THEN
    INSERT INTO appointment_status_history (
      simulation_session_id, appointment_id,
      from_appointment_status, to_appointment_status,
      from_followup_status, to_followup_status, reason, changed_at
    ) VALUES (
      NEW.simulation_session_id, NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.appointment_status END,
      NEW.appointment_status,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.followup_status END,
      NEW.followup_status,
      CASE WHEN TG_OP = 'INSERT' THEN 'APPOINTMENT_CREATED' ELSE 'STATUS_CHANGED' END,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_history_trigger
AFTER INSERT OR UPDATE OF appointment_status, followup_status ON appointments
FOR EACH ROW EXECUTE FUNCTION record_appointment_status_history();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'patients', 'branches', 'doctors', 'simulation_sessions',
    'simulated_calendar_events', 'appointments', 'reminder_rules', 'contact_attempts'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

COMMIT;
