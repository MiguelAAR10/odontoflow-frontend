-- SOLO para la base local odonto_simulator. Ejecutar con:
-- psql ... -v CONFIRM_SIMULATION_RESET=true -f db/reset.sql
\if :{?CONFIRM_SIMULATION_RESET}
\if :CONFIRM_SIMULATION_RESET
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
\ir migrations/001_initial.sql
\ir migrations/002_simulated_channels.sql
\ir migrations/003_end_to_end_followup.sql
\ir seeds/001_simulated.sql
\ir seeds/002_end_to_end_demo.sql
\else
\echo 'Confirmación inválida; no se realizó ningún cambio.'
\endif
\else
\echo 'Falta -v CONFIRM_SIMULATION_RESET=true; no se realizó ningún cambio.'
\endif
