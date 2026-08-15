import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  AppointmentStatus,
  FollowupStatus,
  SimulatedCallAttempt,
  SimulatedCallResult,
  SimulatedResponseAction,
  SimulatedWhatsAppMessage,
  SimulationAppointment,
  ReceptionTask,
  SimulationCatalogs,
  AppointmentStatusChange,
} from "../domain/types.js";
import type {
  NewCallAttempt,
  NewWhatsAppMessage,
  SimulationRepository,
} from "./SimulationRepository.js";

export class PostgresSimulationRepository implements SimulationRepository {
  constructor(private readonly pool: Pool) {}

  static connect(connectionString?: string): PostgresSimulationRepository {
    return new PostgresSimulationRepository(new Pool(connectionString ? { connectionString } : undefined));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getSimulationTime(simulationSessionId: string): Promise<Date> {
    const result = await this.pool.query(
      "SELECT simulated_now FROM simulation_sessions WHERE id = $1",
      [simulationSessionId],
    );
    if (!result.rows[0]) throw new Error(`Simulation session not found: ${simulationSessionId}`);
    return new Date(result.rows[0].simulated_now as string | Date);
  }

  async setSimulationTime(simulationSessionId: string, instant: Date): Promise<void> {
    const result = await this.pool.query(
      "UPDATE simulation_sessions SET simulated_now = $2 WHERE id = $1",
      [simulationSessionId, instant],
    );
    if (!result.rowCount) throw new Error(`Simulation session not found: ${simulationSessionId}`);
  }

  async resetSession(simulationSessionId: string, instant: Date): Promise<void> {
    await this.transaction(async client => {
      await client.query("DELETE FROM contact_attempts WHERE simulation_session_id = $1", [simulationSessionId]);
      await client.query("DELETE FROM simulated_reception_tasks WHERE simulation_session_id = $1", [simulationSessionId]);
      await client.query(
        `UPDATE appointments SET appointment_status = 'SCHEDULED', followup_status = 'PENDING',
         cancellation_reason = NULL, confirmed_at = NULL, cancelled_at = NULL,
         reschedule_requested_at = NULL, version = version + 1
         WHERE simulation_session_id = $1`,
        [simulationSessionId],
      );
      await client.query(
        "UPDATE simulated_calendar_events SET status = 'ACTIVE', version = version + 1 WHERE simulation_session_id = $1",
        [simulationSessionId],
      );
      await client.query("UPDATE simulation_sessions SET simulated_now = $2 WHERE id = $1", [simulationSessionId, instant]);
    });
  }

  async listAppointments(simulationSessionId: string): Promise<SimulationAppointment[]> {
    const result = await this.pool.query(appointmentSelect("WHERE a.simulation_session_id = $1"), [
      simulationSessionId,
    ]);
    return result.rows.map(mapAppointment);
  }

  async getAppointment(id: string): Promise<SimulationAppointment | undefined> {
    const result = await this.pool.query(appointmentSelect("WHERE a.id = $1"), [id]);
    return result.rows[0] ? mapAppointment(result.rows[0]) : undefined;
  }

  async updateAppointmentState(
    id: string,
    appointmentStatus: AppointmentStatus,
    followupStatus: FollowupStatus,
    cancellationReason?: string,
    changedAt = new Date(),
  ): Promise<SimulationAppointment> {
    const result = await this.pool.query(
      `UPDATE appointments
       SET appointment_status = $2::appointment_status,
           followup_status = $3::followup_status,
           cancellation_reason = CASE WHEN $2::appointment_status = 'CANCELLED' THEN $4::text ELSE NULL END,
           confirmed_at = CASE WHEN $2::appointment_status = 'CONFIRMED' THEN COALESCE(confirmed_at, $5::timestamptz) ELSE NULL END,
           cancelled_at = CASE WHEN $2::appointment_status = 'CANCELLED' THEN COALESCE(cancelled_at, $5::timestamptz) ELSE NULL END,
           reschedule_requested_at = CASE WHEN $2::appointment_status = 'RESCHEDULE_REQUESTED' THEN COALESCE(reschedule_requested_at, $5::timestamptz) ELSE NULL END,
           version = version + 1
       WHERE id = $1 RETURNING id`,
      [id, appointmentStatus, followupStatus, cancellationReason ?? null, changedAt],
    );
    if (!result.rowCount) throw new Error(`Appointment not found: ${id}`);
    const updated = await this.getAppointment(id);
    if (!updated) throw new Error(`Appointment not found after update: ${id}`);
    return updated;
  }

  async createAppointment(input: {
    simulationSessionId: string; patientId: string; branchId: string; doctorId: string;
    title: string; startsAt: Date; endsAt: Date;
  }): Promise<SimulationAppointment> {
    if (input.endsAt <= input.startsAt) throw new Error("Appointment end must be after start");
    const id = await this.transaction(async client => {
      const event = await client.query(
        `INSERT INTO simulated_calendar_events (simulation_session_id, title, starts_at, ends_at)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [input.simulationSessionId, input.title, input.startsAt, input.endsAt],
      );
      const eventId = String(event.rows[0].id);
      const appointment = await client.query(
        `INSERT INTO appointments (
           simulation_session_id, patient_id, branch_id, doctor_id, calendar_event_id, starts_at, ends_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.simulationSessionId, input.patientId, input.branchId, input.doctorId, eventId, input.startsAt, input.endsAt],
      );
      return String(appointment.rows[0].id);
    });
    const created = await this.getAppointment(id);
    if (!created) throw new Error("Appointment was not found after creation");
    return created;
  }

  async editAppointment(
    id: string,
    input: { startsAt: Date; endsAt: Date; title?: string },
  ): Promise<SimulationAppointment> {
    if (input.endsAt <= input.startsAt) throw new Error("Appointment end must be after start");
    await this.transaction(async client => {
      const appointment = await client.query(
        "SELECT calendar_event_id, appointment_status FROM appointments WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!appointment.rows[0]) throw new Error(`Appointment not found: ${id}`);
      if (appointment.rows[0].appointment_status === "CANCELLED") throw new Error("Cancelled appointment cannot be edited");
      await client.query(
        `UPDATE simulated_calendar_events
         SET starts_at = $2, ends_at = $3, title = COALESCE($4, title), version = version + 1
         WHERE id = $1`,
        [appointment.rows[0].calendar_event_id, input.startsAt, input.endsAt, input.title ?? null],
      );
      await client.query(
        "UPDATE appointments SET starts_at = $2, ends_at = $3, version = version + 1 WHERE id = $1",
        [id, input.startsAt, input.endsAt],
      );
    });
    const updated = await this.getAppointment(id);
    if (!updated) throw new Error(`Appointment not found: ${id}`);
    return updated;
  }

  async cancelAppointment(id: string, reason: string, cancelledAt: Date): Promise<SimulationAppointment> {
    if (!reason.trim()) throw new Error("Cancellation reason is required");
    await this.transaction(async client => {
      const appointment = await client.query(
        "SELECT calendar_event_id FROM appointments WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!appointment.rows[0]) throw new Error(`Appointment not found: ${id}`);
      await client.query(
        `UPDATE appointments SET appointment_status = 'CANCELLED', followup_status = 'CLOSED',
         cancellation_reason = $2, confirmed_at = NULL, reschedule_requested_at = NULL,
         cancelled_at = $3, version = version + 1 WHERE id = $1`,
        [id, reason, cancelledAt],
      );
      await client.query(
        "UPDATE simulated_calendar_events SET status = 'CANCELLED', version = version + 1 WHERE id = $1",
        [appointment.rows[0].calendar_event_id],
      );
    });
    const updated = await this.getAppointment(id);
    if (!updated) throw new Error(`Appointment not found: ${id}`);
    return updated;
  }

  async getCatalogs(): Promise<SimulationCatalogs> {
    const [patients, branches, doctors] = await Promise.all([
      this.pool.query("SELECT id, display_name AS name, phone FROM patients ORDER BY display_name"),
      this.pool.query("SELECT id, name FROM branches ORDER BY name"),
      this.pool.query("SELECT id, branch_id, display_name AS name FROM doctors ORDER BY display_name"),
    ]);
    return {
      patients: patients.rows.map(row => ({ id: String(row.id), name: String(row.name), phone: String(row.phone) })),
      branches: branches.rows.map(row => ({ id: String(row.id), name: String(row.name) })),
      doctors: doctors.rows.map(row => ({ id: String(row.id), branchId: String(row.branch_id), name: String(row.name) })),
    };
  }

  async listStatusHistory(appointmentId: string): Promise<AppointmentStatusChange[]> {
    const result = await this.pool.query(
      "SELECT * FROM appointment_status_history WHERE appointment_id = $1 ORDER BY changed_at",
      [appointmentId],
    );
    return result.rows.map(row => ({
      appointmentId: String(row.appointment_id),
      ...(row.from_appointment_status ? { fromAppointmentStatus: row.from_appointment_status as AppointmentStatus } : {}),
      toAppointmentStatus: row.to_appointment_status as AppointmentStatus,
      ...(row.from_followup_status ? { fromFollowupStatus: row.from_followup_status as FollowupStatus } : {}),
      toFollowupStatus: row.to_followup_status as FollowupStatus,
      reason: String(row.reason ?? "STATUS_CHANGED"),
      changedAt: new Date(row.changed_at as string | Date),
    }));
  }

  async createReceptionTask(input: {
    simulationSessionId: string; appointmentId: string; description: string; createdAt: Date;
  }): Promise<ReceptionTask> {
    const result = await this.pool.query(
      `INSERT INTO simulated_reception_tasks (
         simulation_session_id, appointment_id, task_type, description, created_at
       ) VALUES ($1,$2,'RESCHEDULE_REQUEST',$3,$4)
       ON CONFLICT (simulation_session_id, appointment_id, task_type)
       DO UPDATE SET description = simulated_reception_tasks.description RETURNING *`,
      [input.simulationSessionId, input.appointmentId, input.description, input.createdAt],
    );
    return mapTask(result.rows[0]);
  }

  async listReceptionTasks(simulationSessionId: string): Promise<ReceptionTask[]> {
    const result = await this.pool.query(
      "SELECT * FROM simulated_reception_tasks WHERE simulation_session_id = $1 ORDER BY created_at DESC",
      [simulationSessionId],
    );
    return result.rows.map(mapTask);
  }

  async createWhatsAppMessage(input: NewWhatsAppMessage): Promise<SimulatedWhatsAppMessage> {
    return this.transaction(async client => {
      const contactAttemptId = await upsertContactAttempt(client, input, "WHATSAPP");
      const result = await client.query(
        `INSERT INTO simulated_whatsapp_messages (
           simulated_message_id, simulation_session_id, appointment_id, contact_attempt_id,
           patient_name, recipient_phone, branch_name, attempt_type, message_text, sent_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (simulation_session_id, appointment_id, attempt_type)
         DO UPDATE SET message_text = simulated_whatsapp_messages.message_text
         RETURNING *`,
        [
          `sim-wa-${randomUUID()}`,
          input.simulationSessionId,
          input.appointmentId,
          contactAttemptId,
          input.patientName,
          input.recipientPhone,
          input.branchName,
          input.attemptType,
          input.text,
          input.sentAt,
        ],
      );
      return mapMessage(result.rows[0]);
    });
  }

  async listWhatsAppMessages(simulationSessionId: string): Promise<SimulatedWhatsAppMessage[]> {
    const result = await this.pool.query(
      "SELECT * FROM simulated_whatsapp_messages WHERE simulation_session_id = $1 ORDER BY sent_at DESC",
      [simulationSessionId],
    );
    return result.rows.map(mapMessage);
  }

  async getWhatsAppMessage(id: string): Promise<SimulatedWhatsAppMessage | undefined> {
    const result = await this.pool.query("SELECT * FROM simulated_whatsapp_messages WHERE id = $1", [id]);
    return result.rows[0] ? mapMessage(result.rows[0]) : undefined;
  }

  async setWhatsAppResponse(
    id: string,
    response: SimulatedResponseAction,
    respondedAt: Date,
  ): Promise<SimulatedWhatsAppMessage> {
    const result = await this.pool.query(
      `UPDATE simulated_whatsapp_messages SET response_action = $2, responded_at = $3
       WHERE id = $1 RETURNING *`,
      [id, response, respondedAt],
    );
    if (!result.rows[0]) throw new Error(`Simulated message not found: ${id}`);
    return mapMessage(result.rows[0]);
  }

  async createCallAttempt(input: NewCallAttempt): Promise<SimulatedCallAttempt> {
    return this.transaction(async client => {
      const contactAttemptId = await upsertContactAttempt(client, input, "CALL");
      const result = await client.query(
        `INSERT INTO simulated_call_attempts (
           simulation_session_id, appointment_id, contact_attempt_id, patient_name,
           phone, attempt_type, attempted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (simulation_session_id, appointment_id, attempt_type)
         DO UPDATE SET patient_name = simulated_call_attempts.patient_name
         RETURNING *`,
        [
          input.simulationSessionId,
          input.appointmentId,
          contactAttemptId,
          input.patientName,
          input.phone,
          input.attemptType,
          input.attemptedAt,
        ],
      );
      return mapCall(result.rows[0]);
    });
  }

  async listCallAttempts(simulationSessionId: string): Promise<SimulatedCallAttempt[]> {
    const result = await this.pool.query(
      "SELECT * FROM simulated_call_attempts WHERE simulation_session_id = $1 ORDER BY attempted_at DESC",
      [simulationSessionId],
    );
    return result.rows.map(mapCall);
  }

  async getCallAttempt(id: string): Promise<SimulatedCallAttempt | undefined> {
    const result = await this.pool.query("SELECT * FROM simulated_call_attempts WHERE id = $1", [id]);
    return result.rows[0] ? mapCall(result.rows[0]) : undefined;
  }

  async updateCallResult(id: string, resultValue: SimulatedCallResult): Promise<SimulatedCallAttempt> {
    const result = await this.pool.query(
      "UPDATE simulated_call_attempts SET result = $2 WHERE id = $1 RETURNING *",
      [id, resultValue],
    );
    if (!result.rows[0]) throw new Error(`Simulated call not found: ${id}`);
    return mapCall(result.rows[0]);
  }

  async recordInboundEvent(input: {
    simulationSessionId: string;
    eventId: string;
    messageId: string;
    appointmentId: string;
    action: SimulatedResponseAction;
    occurredAt: Date;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO simulated_inbound_events (
         simulation_session_id, simulated_event_id, message_id, appointment_id, action, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (simulation_session_id, simulated_event_id) DO NOTHING
       RETURNING id`,
      [
        input.simulationSessionId,
        input.eventId,
        input.messageId,
        input.appointmentId,
        input.action,
        input.occurredAt,
      ],
    );
    return Boolean(result.rowCount);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function upsertContactAttempt(
  client: PoolClient,
  input: NewWhatsAppMessage | NewCallAttempt,
  channel: "WHATSAPP" | "CALL",
): Promise<string> {
  const attemptedAt = "sentAt" in input ? input.sentAt : input.attemptedAt;
  const result = await client.query(
    `INSERT INTO contact_attempts (
       simulation_session_id, appointment_id, reminder_rule_id, attempt_type, channel,
       status, scheduled_for, attempted_at, idempotency_key, result_detail
     )
     SELECT $1, $2, id, $3, $4, $5, $6, $6, $7, $8
     FROM reminder_rules WHERE attempt_type = $3
     ON CONFLICT (appointment_id, attempt_type)
     DO UPDATE SET idempotency_key = contact_attempts.idempotency_key
     RETURNING id`,
    [
      input.simulationSessionId,
      input.appointmentId,
      input.attemptType,
      channel,
      channel === "WHATSAPP" ? "SENT" : "PENDING",
      attemptedAt,
      `${input.simulationSessionId}:${input.appointmentId}:${input.attemptType}`,
      channel === "WHATSAPP" ? "DELIVERED_SIMULATED" : "PENDING",
    ],
  );
  if (!result.rows[0]) throw new Error(`Reminder rule not found for ${input.attemptType}`);
  return result.rows[0].id as string;
}

function appointmentSelect(where: string): string {
  return `SELECT a.*, p.display_name AS patient_name, p.phone AS patient_phone, b.name AS branch_name
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          JOIN branches b ON b.id = a.branch_id ${where}`;
}

function mapAppointment(row: Record<string, unknown>): SimulationAppointment {
  return {
    id: String(row.id),
    simulationSessionId: String(row.simulation_session_id),
    patientId: String(row.patient_id),
    branchId: String(row.branch_id),
    doctorId: String(row.doctor_id),
    calendarEventId: String(row.calendar_event_id),
    startsAt: new Date(row.starts_at as string | Date),
    endsAt: new Date(row.ends_at as string | Date),
    appointmentStatus: row.appointment_status as AppointmentStatus,
    followupStatus: row.followup_status as FollowupStatus,
    ...(row.cancellation_reason ? { cancellationReason: String(row.cancellation_reason) } : {}),
    ...(row.confirmed_at ? { confirmedAt: new Date(row.confirmed_at as string | Date) } : {}),
    ...(row.cancelled_at ? { cancelledAt: new Date(row.cancelled_at as string | Date) } : {}),
    ...(row.reschedule_requested_at
      ? { rescheduleRequestedAt: new Date(row.reschedule_requested_at as string | Date) }
      : {}),
    version: Number(row.version),
    patientName: String(row.patient_name),
    patientPhone: String(row.patient_phone),
    branchName: String(row.branch_name),
  };
}

function mapMessage(row: Record<string, unknown>): SimulatedWhatsAppMessage {
  return {
    id: String(row.id),
    simulatedMessageId: String(row.simulated_message_id),
    simulationSessionId: String(row.simulation_session_id),
    appointmentId: String(row.appointment_id),
    patientName: String(row.patient_name),
    recipientPhone: String(row.recipient_phone),
    branchName: String(row.branch_name),
    attemptType: row.attempt_type as SimulatedWhatsAppMessage["attemptType"],
    text: String(row.message_text),
    status: "DELIVERED_SIMULATED",
    sentAt: new Date(row.sent_at as string | Date),
    ...(row.response_action ? { response: row.response_action as SimulatedResponseAction } : {}),
    ...(row.responded_at ? { respondedAt: new Date(row.responded_at as string | Date) } : {}),
  };
}

function mapCall(row: Record<string, unknown>): SimulatedCallAttempt {
  return {
    id: String(row.id),
    simulationSessionId: String(row.simulation_session_id),
    appointmentId: String(row.appointment_id),
    patientName: String(row.patient_name),
    phone: String(row.phone),
    attemptType: row.attempt_type as SimulatedCallAttempt["attemptType"],
    attemptedAt: new Date(row.attempted_at as string | Date),
    result: row.result as SimulatedCallResult,
  };
}

function mapTask(row: Record<string, unknown>): ReceptionTask {
  return {
    id: String(row.id), simulationSessionId: String(row.simulation_session_id),
    appointmentId: String(row.appointment_id), taskType: "RESCHEDULE_REQUEST",
    status: row.status as ReceptionTask["status"], description: String(row.description),
    createdAt: new Date(row.created_at as string | Date),
    ...(row.resolved_at ? { resolvedAt: new Date(row.resolved_at as string | Date) } : {}),
  };
}
