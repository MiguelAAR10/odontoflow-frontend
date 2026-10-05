import { describe, expect, it } from "vitest";
import {
  MockDemoRepository,
  ApiRepository,
  RepositoryError,
  confirmationQueue,
  createDemoSnapshot,
  DEMO_FINANCIAL_PERIODS,
  financialSummary,
  noShows,
  DEMO_NOW,
  toMoneyCents,
} from "../src/api";

describe("OdontoFlow domain repository", () => {
  it("mantiene el snapshot clínico demo en memoria y permite reiniciar la sesión", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("admin");
    await repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 20, method: "Yape", idempotencyKey: "reset-demo" });

    repository.resetDemo();

    const snapshot = repository.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.payments.some((payment) => payment.idempotencyKey === "reset-demo")).toBe(false);
    expect(snapshot.payments.find((payment) => payment.id === "pay-ana-1")?.amount).toBe(280);
  });

  it("inicia API sin fixtures ni capacidades derivadas del selector demo", () => {
    const repository = new ApiRepository();
    const snapshot = repository.getServerSnapshot();

    expect(snapshot.status).toBe("loading");
    expect(snapshot.appointments).toEqual([]);
    expect(snapshot.patients).toEqual([]);
    expect(snapshot.clinicalRecords).toEqual([]);
    expect(snapshot.actor.capabilities).toEqual([]);
    expect(() => repository.resetDemo()).toThrowError(RepositoryError);
  });

  it("expone un estado vacío intencional distinto de un fallo de carga", () => {
    const repository = new MockDemoRepository();
    repository.setScenario("empty");
    const empty = repository.getSnapshot();

    expect(empty.status).toBe("ready");
    expect(empty.appointments).toEqual([]);
    expect(empty.leads).toEqual([]);
    expect(empty.products).toEqual([]);
    expect(empty.errorMessage).toBeNull();
  });

  it("ofrece estados demo aislados para carga y error sin escribirlos a Web Storage", () => {
    const repository = new MockDemoRepository();
    repository.setScenario("loading");
    expect(repository.getSnapshot().status).toBe("loading");
    repository.setScenario("error");
    expect(repository.getSnapshot().status).toBe("error");
    expect(repository.getSnapshot().errorMessage).toContain("No se pudo cargar");
  });

  it("convierte decimales de API a centavos enteros antes de sumar", () => {
    expect(toMoneyCents("420.015")).toBe(42_002);
    expect(toMoneyCents("0.10")).toBe(10);
    expect(toMoneyCents("-12.34")).toBe(-1_234);
  });

  it("reconcilia Inicio y Finanzas con fechas y saldo vigente separados", () => {
    const snapshot = createDemoSnapshot();
    const all = financialSummary(snapshot, DEMO_FINANCIAL_PERIODS.all);
    const early = financialSummary(snapshot, DEMO_FINANCIAL_PERIODS.early);
    const lince = all.byLocation.find((item) => item.location.id === "lince");

    expect(all).toMatchObject({ chargeCents: 216_000, paymentCents: 167_000, outstandingCents: 49_000 });
    expect(lince).toMatchObject({ chargeCents: 144_000, paymentCents: 95_000, outstandingCents: 49_000 });
    expect(all.byLocation.reduce((sum, item) => sum + item.chargeCents, 0)).toBe(all.chargeCents);
    expect(all.byLocation.reduce((sum, item) => sum + item.paymentCents, 0)).toBe(all.paymentCents);
    expect(early).toMatchObject({ chargeCents: 146_000, paymentCents: 121_000, outstandingCents: 49_000 });
  });

  it("traza el lead desde su alta hasta paciente sin asignarle una sede implícita", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("admin");
    const created = await repository.dispatch({ type: "createLead", name: "Verónica Díaz", phone: "+51 900 000 001", source: "Referido", need: "Evaluación" });
    const lead = repository.getSnapshot().leads.find((item) => item.id === created.id);
    expect(lead).toMatchObject({ name: "Verónica Díaz", locationId: null, patientId: null, status: "new" });

    await repository.dispatch({ type: "assignLeadLocation", leadId: created.id, locationId: "lince" });
    await repository.dispatch({ type: "promoteLeadToPatient", leadId: created.id, locationId: "lince" });
    const snapshot = repository.getSnapshot();
    const linkedLead = snapshot.leads.find((item) => item.id === created.id);
    const patient = snapshot.patients.find((item) => item.leadId === created.id);
    expect(linkedLead?.patientId).toBe(patient?.id);
    expect(patient?.locationId).toBe("lince");
  });

  it("no inventa en API la asignación de sede de leads que no tiene contrato", async () => {
    const repository = new ApiRepository();
    await expect(repository.dispatch({ type: "assignLeadLocation", leadId: "12", locationId: "1" })).rejects.toMatchObject<RepositoryError>({ code: "UNSUPPORTED" });
  });

  it("persiste cambios de ficha en el snapshot demo", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("admin");

    await repository.dispatch({ type: "updatePatient", patientId: "patient-ana", name: "Ana Beltrán Rojas", phone: "+51 900 000 010" });

    expect(repository.getSnapshot().patients.find((patient) => patient.id === "patient-ana")).toMatchObject({ name: "Ana Beltrán Rojas", phone: "+51 900 000 010" });
  });

  it("separa confirmaciones futuras de no-shows vencidos", () => {
    const snapshot = createDemoSnapshot();
    const missed = noShows(snapshot).map((appointment) => appointment.id);
    const pending = confirmationQueue(snapshot).map((appointment) => appointment.id);

    expect(missed).toContain("apt-demo-ricardo-14");
    expect(pending).toEqual(expect.arrayContaining(["apt-jose", "apt-carlos"]));
    expect(pending).not.toContain("apt-demo-ricardo-14");
  });

  it("crea visita y cargo por ejecución, sin duplicar el mismo servicio", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("collaborator");

    const visit = await repository.dispatch({ type: "registerVisit", appointmentId: "apt-jose", patientId: "patient-jose" });
    const first = await repository.dispatch({ type: "completeService", visitId: visit.id, serviceId: "svc-implante", serviceName: "Implante", price: 850 });
    const second = await repository.dispatch({ type: "completeService", visitId: visit.id, serviceId: "svc-implante", serviceName: "Implante", price: 850 });
    const snapshot = repository.getSnapshot();

    expect(first.id).toBe(second.id);
    expect(snapshot.visits.find((item) => item.id === visit.id)?.startedAt).toBe(DEMO_NOW);
    expect(snapshot.executions.filter((execution) => execution.visitId === visit.id)).toHaveLength(1);
    expect(snapshot.charges.filter((charge) => charge.executionId === first.id)).toHaveLength(1);
  });

  it("permite pago parcial, pero rechaza sobrepago", async () => {
    const repository = new MockDemoRepository();
    const key = "test-payment-1";

    await repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 100, method: "Yape", idempotencyKey: key });
    await expect(repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 400, method: "Yape", idempotencyKey: "test-payment-2" })).rejects.toMatchObject<RepositoryError>({ code: "OVERPAYMENT" });
    await repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 40, method: "Tarjeta", idempotencyKey: "test-payment-3" });
    const retry = await repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 100, method: "Yape", idempotencyKey: key });
    const repeated = await repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 100, method: "Yape", idempotencyKey: key });

    expect(retry.message).toContain("ya registrado");
    expect(repeated.id).toBe(retry.id);
    expect(repository.getSnapshot().payments.filter((payment) => payment.idempotencyKey === key)).toHaveLength(1);
    expect(repository.getSnapshot().payments.filter((payment) => payment.chargeId === "charge-ana").reduce((sum, payment) => sum + payment.amount, 0)).toBe(420);
    expect(repository.getSnapshot().payments.find((payment) => payment.idempotencyKey === key)?.paidAt).toBe(DEMO_NOW);
  });

  it("transfiere stock con historia enlazada en ambas sedes", async () => {
    const repository = new MockDemoRepository();

    const result = await repository.dispatch({ type: "moveStock", kind: "transfer", productId: "prod-guantes", locationId: "lince", destinationLocationId: "jesus-maria", quantity: 10, reason: "Reposición" });

    const snapshot = repository.getSnapshot();
    expect(snapshot.balances["prod-guantes:lince"]).toBe(170);
    expect(snapshot.balances["prod-guantes:jesus-maria"]).toBe(70);
    expect(snapshot.stockMovements.filter((movement) => movement.transferId === result.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "transfer_out", locationId: "lince", destinationLocationId: "jesus-maria", quantity: 10 }),
      expect.objectContaining({ type: "transfer_in", locationId: "jesus-maria", destinationLocationId: "lince", quantity: 10 }),
    ]));
  });

  it("exige motivo de ajuste y protege de saldos negativos", async () => {
    const repository = new MockDemoRepository();

    await expect(repository.dispatch({ type: "moveStock", kind: "adjustment", productId: "prod-resina", locationId: "lince", quantity: -1, reason: " " })).rejects.toMatchObject<RepositoryError>({ code: "REASON_REQUIRED" });
    await expect(repository.dispatch({ type: "moveStock", kind: "adjustment", productId: "prod-resina", locationId: "lince", quantity: -13, reason: "Conteo" })).rejects.toMatchObject<RepositoryError>({ code: "INSUFFICIENT_STOCK" });
    expect(repository.getSnapshot().balances["prod-resina:lince"]).toBe(12);

    await repository.dispatch({ type: "moveStock", kind: "adjustment", productId: "prod-resina", locationId: "lince", quantity: -2, reason: "Merma" });
    expect(repository.getSnapshot().balances["prod-resina:lince"]).toBe(10);
  });

  it("mantiene Caja fuera del alcance del Doctor", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("collaborator");

    await expect(repository.dispatch({ type: "registerPayment", chargeId: "charge-ana", amount: 20, method: "Yape", idempotencyKey: "doctor-payment" })).rejects.toMatchObject<RepositoryError>({ code: "FORBIDDEN" });
  });

  it("limita llegada, nota clínica y solicitudes a la jornada del Doctor", async () => {
    const repository = new MockDemoRepository();
    repository.setActor("collaborator");
    repository.getSnapshot().visits.push({ id: "visit-mateo", appointmentId: "apt-carlos", patientId: "patient-carlos", locationId: "lince", practitionerId: "mateo", startedAt: "2026-08-15T14:00:00.000Z", closedAt: null });

    await expect(repository.dispatch({ type: "registerVisit", appointmentId: "apt-carlos", patientId: "patient-carlos" })).rejects.toMatchObject<RepositoryError>({ code: "PRACTITIONER_SCOPE" });
    await expect(repository.dispatch({ type: "updateClinicalRecord", visitId: "visit-mateo", patientId: "patient-carlos", note: "Nota ajena", consent: "recorded" })).rejects.toMatchObject<RepositoryError>({ code: "PRACTITIONER_SCOPE" });
    await expect(repository.dispatch({ type: "createRequest", patientId: "patient-carlos", requestType: "clinical", title: "Solicitud ajena" })).rejects.toMatchObject<RepositoryError>({ code: "PRACTITIONER_SCOPE" });
    expect(repository.getSnapshot().clinicalRecords.some((item) => item.visitId === "visit-mateo")).toBe(false);
  });
});
