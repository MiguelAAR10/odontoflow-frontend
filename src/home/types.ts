/**
 * The narrow patient projection that Home is allowed to display.
 *
 * Home deliberately does not reuse the wider Patients view model here: that
 * model contains fields that are derived or mock-only for the directory. The
 * contextual surface only carries the canonical identity fields needed to
 * identify a person and hand off to the patients module.
 */
export interface HomePatient {
  id: string;
  name: string;
  dni: string | null;
  phone: string | null;
}
