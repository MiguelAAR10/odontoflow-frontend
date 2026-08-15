import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CONTACT_ATTEMPT_TYPES,
  type SimulatedCallResult,
  type SimulatedResponseAction,
} from "./domain/types.js";
import { PostgresSimulationRepository } from "./simulation/PostgresSimulationRepository.js";
import { ReminderScheduler } from "./simulation/ReminderScheduler.js";
import { SimulatedEventProcessor } from "./simulation/SimulatedEventProcessor.js";
import { SimulationClock } from "./simulation/SimulationClock.js";
import { FollowupEngine } from "./simulation/FollowupEngine.js";
import { inboxHtml } from "./ui.js";

const sessionId = process.env.SIMULATION_SESSION_ID ?? "51000000-0000-4000-8000-000000000001";
const connectionString = process.env.DATABASE_URL;
const repository = PostgresSimulationRepository.connect(connectionString);
const clock = new SimulationClock(await repository.getSimulationTime(sessionId));
const scheduler = new ReminderScheduler(repository, clock);
const events = new SimulatedEventProcessor(repository, clock);
const followup = new FollowupEngine();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    json(response, 400, { error: message });
  }
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(inboxHtml);
    return;
  }
  if (method === "GET" && url.pathname === "/api/state") {
    await sendState(response);
    return;
  }
  if (method === "POST" && url.pathname === "/api/scheduler/run") {
    await scheduler.run(sessionId);
    await sendState(response);
    return;
  }
  if (method === "POST" && url.pathname === "/api/demo/run") {
    await runRequiredDemo();
    await sendState(response);
    return;
  }
  if (method === "POST" && url.pathname === "/api/appointments") {
    const body = await readJson(request);
    await repository.createAppointment({
      simulationSessionId: sessionId,
      patientId: requiredString(body.patientId, "patientId"),
      branchId: requiredString(body.branchId, "branchId"),
      doctorId: requiredString(body.doctorId, "doctorId"),
      title: requiredString(body.title, "title"),
      startsAt: requiredDate(body.startsAt, "startsAt"),
      endsAt: requiredDate(body.endsAt, "endsAt"),
    });
    await sendState(response);
    return;
  }
  if (method === "POST" && url.pathname === "/api/clock") {
    const body = await readJson(request);
    if (typeof body.time === "string") clock.setTime(new Date(body.time));
    if (typeof body.minutes === "number") clock.advanceMinutes(body.minutes);
    if (typeof body.hours === "number") clock.advanceHours(body.hours);
    if (typeof body.days === "number") clock.advanceDays(body.days);
    await repository.setSimulationTime(sessionId, clock.now());
    await scheduler.run(sessionId);
    await sendState(response);
    return;
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/response$/);
  if (method === "POST" && messageMatch?.[1]) {
    const body = await readJson(request);
    const action = assertResponseAction(body.action);
    await events.processWhatsAppResponse({
      eventId: typeof body.eventId === "string" ? body.eventId : `sim-event-${randomUUID()}`,
      messageId: messageMatch[1],
      action,
    });
    await sendState(response);
    return;
  }

  const appointmentEditMatch = url.pathname.match(/^\/api\/appointments\/([^/]+)$/);
  if (method === "PUT" && appointmentEditMatch?.[1]) {
    const body = await readJson(request);
    await repository.editAppointment(appointmentEditMatch[1], {
      startsAt: requiredDate(body.startsAt, "startsAt"),
      endsAt: requiredDate(body.endsAt, "endsAt"),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
    });
    await sendState(response);
    return;
  }

  const appointmentCancelMatch = url.pathname.match(/^\/api\/appointments\/([^/]+)\/cancel$/);
  if (method === "POST" && appointmentCancelMatch?.[1]) {
    const body = await readJson(request);
    await repository.cancelAppointment(
      appointmentCancelMatch[1], requiredString(body.reason, "reason"), clock.now(),
    );
    await sendState(response);
    return;
  }

  const callMatch = url.pathname.match(/^\/api\/calls\/([^/]+)\/result$/);
  if (method === "POST" && callMatch?.[1]) {
    const body = await readJson(request);
    await events.updateCallResult(callMatch[1], assertCallResult(body.result));
    await sendState(response);
    return;
  }

  json(response, 404, { error: "Not found" });
}

async function sendState(response: ServerResponse): Promise<void> {
  const [appointments, messages, calls, tracking, closingSummary, metrics, tasks, catalogs] = await Promise.all([
    repository.listAppointments(sessionId),
    repository.listWhatsAppMessages(sessionId),
    repository.listCallAttempts(sessionId),
    followup.tracking(repository, sessionId, clock.now()),
    followup.closingSummary(repository, sessionId, clock.now()),
    followup.metrics(repository, sessionId),
    repository.listReceptionTasks(sessionId),
    repository.getCatalogs(),
  ]);
  json(response, 200, {
    sessionId,
    simulationTime: clock.now(),
    appointments,
    messages,
    calls,
    tracking,
    closingSummary,
    metrics,
    tasks,
    catalogs,
    supportedAttemptTypes: CONTACT_ATTEMPT_TYPES,
  });
}

async function runRequiredDemo(): Promise<void> {
  const steps = [
    "2026-08-10T09:00:00-05:00",
    "2026-08-10T12:00:00-05:00",
    "2026-08-10T16:00:00-05:00",
  ];
  const initial = new Date("2026-08-10T08:55:00-05:00");
  await repository.resetSession(sessionId, initial);
  clock.setTime(initial);
  for (const step of steps) {
    clock.setTime(new Date(step));
    await repository.setSimulationTime(sessionId, clock.now());
    await scheduler.run(sessionId);
  }
  const call = (await repository.listCallAttempts(sessionId)).find(
    item => item.attemptType === "DAY_BEFORE_CALL_04PM",
  );
  if (!call) throw new Error("The 16:00 simulated call was not generated");
  await events.updateCallResult(call.id, "ANSWERED_CONFIRMED");
  for (const step of ["2026-08-11T09:00:00-05:00", "2026-08-11T16:00:00-05:00"]) {
    clock.setTime(new Date(step));
    await repository.setSimulationTime(sessionId, clock.now());
    await scheduler.run(sessionId);
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function assertResponseAction(value: unknown): SimulatedResponseAction {
  const allowed: SimulatedResponseAction[] = ["CONFIRM", "REQUEST_RESCHEDULE", "CANCEL", "NO_RESPONSE"];
  if (!allowed.includes(value as SimulatedResponseAction)) throw new Error("Invalid response action");
  return value as SimulatedResponseAction;
}

function assertCallResult(value: unknown): SimulatedCallResult {
  const allowed: SimulatedCallResult[] = [
    "ANSWERED_CONFIRMED", "ANSWERED_CANCELLED", "ANSWERED_RESCHEDULE",
    "NO_ANSWER", "WRONG_NUMBER", "PENDING",
  ];
  if (!allowed.includes(value as SimulatedCallResult)) throw new Error("Invalid call result");
  return value as SimulatedCallResult;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

function requiredDate(value: unknown, field: string): Date {
  const date = new Date(requiredString(value, field));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`Odonto Smart simulator: http://127.0.0.1:${port}`);
  console.log("Local simulation only; no external messages or calls are sent.");
});

async function shutdown(): Promise<void> {
  server.close();
  await repository.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
