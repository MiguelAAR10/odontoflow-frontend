import type {
  AppointmentStatus,
  ContactAttemptType,
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

export interface NewWhatsAppMessage {
  simulationSessionId: string;
  appointmentId: string;
  patientName: string;
  recipientPhone: string;
  branchName: string;
  attemptType: ContactAttemptType;
  text: string;
  sentAt: Date;
}

export interface NewCallAttempt {
  simulationSessionId: string;
  appointmentId: string;
  patientName: string;
  phone: string;
  attemptType: ContactAttemptType;
  attemptedAt: Date;
}

export interface SimulationRepository {
  getSimulationTime(simulationSessionId: string): Promise<Date>;
  setSimulationTime(simulationSessionId: string, instant: Date): Promise<void>;
  resetSession(simulationSessionId: string, instant: Date): Promise<void>;
  listAppointments(simulationSessionId: string): Promise<SimulationAppointment[]>;
  getAppointment(id: string): Promise<SimulationAppointment | undefined>;
  updateAppointmentState(
    id: string,
    appointmentStatus: AppointmentStatus,
    followupStatus: FollowupStatus,
    cancellationReason?: string,
    changedAt?: Date,
  ): Promise<SimulationAppointment>;
  createAppointment(input: {
    simulationSessionId: string;
    patientId: string;
    branchId: string;
    doctorId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<SimulationAppointment>;
  editAppointment(id: string, input: { startsAt: Date; endsAt: Date; title?: string }): Promise<SimulationAppointment>;
  cancelAppointment(id: string, reason: string, cancelledAt: Date): Promise<SimulationAppointment>;
  getCatalogs(): Promise<SimulationCatalogs>;
  listStatusHistory(appointmentId: string): Promise<AppointmentStatusChange[]>;
  createReceptionTask(input: {
    simulationSessionId: string;
    appointmentId: string;
    description: string;
    createdAt: Date;
  }): Promise<ReceptionTask>;
  listReceptionTasks(simulationSessionId: string): Promise<ReceptionTask[]>;
  createWhatsAppMessage(input: NewWhatsAppMessage): Promise<SimulatedWhatsAppMessage>;
  listWhatsAppMessages(simulationSessionId: string): Promise<SimulatedWhatsAppMessage[]>;
  getWhatsAppMessage(id: string): Promise<SimulatedWhatsAppMessage | undefined>;
  setWhatsAppResponse(
    id: string,
    response: SimulatedResponseAction,
    respondedAt: Date,
  ): Promise<SimulatedWhatsAppMessage>;
  createCallAttempt(input: NewCallAttempt): Promise<SimulatedCallAttempt>;
  listCallAttempts(simulationSessionId: string): Promise<SimulatedCallAttempt[]>;
  getCallAttempt(id: string): Promise<SimulatedCallAttempt | undefined>;
  updateCallResult(id: string, result: SimulatedCallResult): Promise<SimulatedCallAttempt>;
  recordInboundEvent(input: {
    simulationSessionId: string;
    eventId: string;
    messageId: string;
    appointmentId: string;
    action: SimulatedResponseAction;
    occurredAt: Date;
  }): Promise<boolean>;
}
