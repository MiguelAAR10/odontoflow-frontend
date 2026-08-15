import type { ContactAttemptType, SimulationAppointment } from "../domain/types.js";

export type MessageTemplate = (appointment: SimulationAppointment) => string;

export const messageTemplates: Record<
  Extract<ContactAttemptType, "DAY_BEFORE_09AM" | "SAME_DAY_09AM" | "ONE_HOUR_BEFORE">,
  MessageTemplate
> = {
  DAY_BEFORE_09AM: appointment => reminderText(appointment, "manana"),
  SAME_DAY_09AM: appointment => reminderText(appointment, "hoy"),
  ONE_HOUR_BEFORE: appointment =>
    `Hola ${appointment.patientName}. Tu cita ficticia comienza en una hora. Sede: ${appointment.branchName}.`,
};

function reminderText(appointment: SimulationAppointment, when: string): string {
  const local = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(appointment.startsAt);
  return `Hola ${appointment.patientName}. Te recordamos tu cita de prueba ${when}: ${local}. Sede: ${appointment.branchName}. [Confirmar] [Reprogramar] [Cancelar]`;
}
