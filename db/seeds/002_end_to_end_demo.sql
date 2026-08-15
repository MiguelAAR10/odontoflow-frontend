BEGIN;

INSERT INTO patients (id, display_name, phone) VALUES
  ('31000000-0000-4000-8000-000000000001', 'Ana Demo', '+1-202-555-0110')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO simulation_sessions (id, name, simulated_now) VALUES
  ('51000000-0000-4000-8000-000000000001', 'Demo end-to-end Ana Demo', '2026-08-10 08:55:00-05')
ON CONFLICT (id) DO UPDATE SET simulated_now = EXCLUDED.simulated_now;

INSERT INTO simulated_calendar_events (
  id, simulation_session_id, title, starts_at, ends_at, status
) VALUES (
  '61000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'Cita ficticia Ana Demo',
  '2026-08-11 17:00:00-05',
  '2026-08-11 18:00:00-05',
  'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (
  id, simulation_session_id, patient_id, branch_id, doctor_id, calendar_event_id,
  starts_at, ends_at, appointment_status, followup_status
) VALUES (
  '71000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '2026-08-11 17:00:00-05',
  '2026-08-11 18:00:00-05',
  'SCHEDULED',
  'PENDING'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
