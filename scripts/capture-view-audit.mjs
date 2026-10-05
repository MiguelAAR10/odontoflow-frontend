import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.VIEW_AUDIT_BASE_URL ?? "http://127.0.0.1:5173";
const outputDir = resolve(process.env.VIEW_AUDIT_DIR ?? "docs/qa/auditoria-2026-09-28/view-matrix");
const browserPath = process.env.VISUAL_BROWSER_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const routes = {
  owner: [
    ["/", "Inicio"],
    ["/sedes", "Sedes"],
    ["/finanzas", "Finanzas"],
    ["/pacientes", "Pacientes"],
    ["/comercial", "Comercial"],
    ["/produccion", "Producción"],
    ["/inventario", "Inventario"],
    ["/caja", "Cobros"],
    ["/agente", "Guía de flujos"],
  ],
  admin: [
    ["/", "Viernes, 14 de agosto"],
    ["/agenda", "Agenda de citas"],
    ["/pacientes", "Pacientes"],
    ["/visitas/visit-ana", "Registro clínico"],
    ["/caja", "Cobros"],
    ["/inventario", "Inventario"],
    ["/solicitudes", "Solicitudes"],
    ["/chat", "Conversaciones"],
    ["/atencion/visit-ana", "Atención"],
    ["/agente", "Guía de flujos"],
  ],
  collaborator: [
    ["/mi-dia", "Mi día"],
    ["/mis-pacientes", "Mis pacientes"],
    ["/solicitudes", "Solicitudes"],
    ["/visitas/visit-ana", "Ana Beltrán"],
    ["/asistente", "Dictado"],
  ],
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const blockedWriteRequests = [];
const protectWrites = async browserContext => browserContext.route("**/*", async route => {
  const request = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
    blockedWriteRequests.push(`${request.method()} ${request.url()}`);
    await route.abort("blockedbyclient");
    return;
  }
  await route.continue();
});
await protectWrites(context);
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
const results = [];

if (process.env.VIEW_AUDIT_ACTIONS_ONLY !== "1") for (const [role, items] of Object.entries(routes)) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption(role);
  for (const [route, heading] of items) {
    const entry = { role, route, heading, desktop: null, mobile: [] };
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + route, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      if (role === "admin" && route.startsWith("/visitas/")) {
        await page.getByText("El registro clínico es confidencial", { exact: true }).waitFor();
        assert.equal(await page.getByText("Sensibilidad leve en tercio cervical. Evolución estable.", { exact: true }).count(), 0);
        assert.equal(await page.locator("textarea").count(), 0);
      }
      if (role === "collaborator" && route.startsWith("/visitas/")) {
        await page.getByLabel("Nota clínica").waitFor();
        assert.match(await page.locator("textarea").inputValue(), /Sensibilidad leve en tercio cervical/);
      }
      if ((role === "admin" || role === "owner") && route === "/pacientes") {
        await page.goto(`${baseUrl}/pacientes?patient=patient-ana`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "Ficha del paciente", exact: true }).waitFor();
        assert.equal(await page.getByText("Sensibilidad leve en tercio cervical. Evolución estable.", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Cerrar modal" }).click();
      }
      if (role === "owner" && route === "/sedes") {
        const metricHeights = await page.locator(".insight-bar__facts strong").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight) })));
        assert.ok(metricHeights.every((metric) => metric.height <= metric.lineHeight * 1.35), `Branch totals should fit on one line: ${JSON.stringify(metricHeights)}`);
      }
      if (role === "owner" && route === "/produccion") {
        assert.match(await page.locator(".workspace-table tbody tr").first().innerText(), /14 ago\./, "Production history starts with the latest execution");
      }
      if (route === "/") {
        const logo = await page.locator(".sidebar-brand img").boundingBox();
        const footer = await page.locator(".sidebar-footer").boundingBox();
        const footerDot = await page.locator(".sidebar-footer__dot").boundingBox();
        assert.ok(logo && footer && footerDot, "Sidebar brand and actor scope should render");
        assert.ok(logo.width >= 210 && logo.height >= 140, `Sidebar logo should use the transparent asset's visible area: ${JSON.stringify(logo)}`);
        assert.ok(footerDot.x >= 60, `Actor scope should clear the development badge: ${JSON.stringify(footerDot)}`);
        entry.sidebar = { logo, footer, footerDot };
      }
      entry.finalUrl = new URL(page.url()).pathname;
      entry.desktop = join(outputDir, role + "-" + (route.replaceAll("/", "_") || "inicio") + "-1440.png");
      await page.screenshot({ path: entry.desktop, fullPage: true });
      const desktopDimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
      entry.desktopDimensions = desktopDimensions;
      entry.overflows = [];
      entry.visualDefects = [];
      if (desktopDimensions.document > desktopDimensions.viewport) entry.overflows.push(desktopDimensions);
      const desktopHelpOverlap = await page.evaluate(() => {
        const help = document.querySelector(".context-help-trigger")?.getBoundingClientRect();
        if (!help) return false;
        return Array.from(document.querySelectorAll(".recharts-responsive-container, .request-chart__plot, .request-age")).some((plot) => {
          const rect = plot.getBoundingClientRect();
          return help.left < rect.right && help.right > rect.left && help.top < rect.bottom && help.bottom > rect.top;
        });
      });
      if (desktopHelpOverlap) entry.visualDefects.push({ width: 1440, issue: "Ayuda overlaps a visualization" });
      for (const width of [1280, 390, 375]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.goto(baseUrl + route, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        if (width < 500) await page.waitForFunction(() => document.querySelector(".app-sidebar")?.getBoundingClientRect().right <= 0);
        await page.waitForTimeout(400);
        const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
        const imagePath = join(outputDir, role + "-" + (route.replaceAll("/", "_") || "inicio") + "-" + width + ".png");
        await page.screenshot({ path: imagePath, fullPage: true });
        const visualAudit = await page.evaluate(() => {
          const help = document.querySelector(".context-help-trigger")?.getBoundingClientRect();
          const helpOverlapsVisualization = Boolean(help && Array.from(document.querySelectorAll(".recharts-responsive-container, .request-chart__plot, .request-age")).some((plot) => {
            const rect = plot.getBoundingClientRect();
            return help.left < rect.right && help.right > rect.left && help.top < rect.bottom && help.bottom > rect.top;
          }));
          const requestTitles = Array.from(document.querySelectorAll(".workspace-page--requests .data-table tbody td:nth-child(2) strong")).map((title) => {
            const rect = title.getBoundingClientRect();
            return { text: title.textContent, clipped: title.scrollWidth > title.clientWidth + 1 || rect.right > window.innerWidth };
          });
          return { helpOverlapsVisualization, requestTitles };
        });
        entry.mobile.push({ width, overflow: dimensions.document > dimensions.viewport, ...dimensions, ...visualAudit, image: imagePath });
        if (dimensions.document > dimensions.viewport) entry.overflows.push({ width, ...dimensions });
        if (visualAudit.helpOverlapsVisualization) entry.visualDefects.push({ width, issue: "Ayuda overlaps a visualization" });
        if (role === "admin" && route === "/solicitudes" && width < 500 && visualAudit.requestTitles.some((title) => title.clipped)) entry.visualDefects.push({ width, issue: "A request title is clipped" });
      }
      entry.status = entry.finalUrl !== route ? "redirected" : entry.overflows.length || entry.visualDefects.length ? "failed" : "captured";
      if (entry.overflows.length || entry.visualDefects.length) entry.error = JSON.stringify({ overflows: entry.overflows, visualDefects: entry.visualDefects });
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : String(error);
      entry.finalUrl = new URL(page.url()).pathname;
      try { entry.desktop ??= join(outputDir, role + "-failed-" + results.length + ".png"); await page.screenshot({ path: entry.desktop, fullPage: true }); } catch {}
    }
    results.push(entry);
  }
}

const actionContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await protectWrites(actionContext);
await actionContext.addInitScript(() => window.localStorage.setItem("odontoflow-demo-role", "admin"));
const actionPage = await actionContext.newPage();
actionPage.setDefaultTimeout(10_000);
const actionErrors = [];
const writeRequests = [];
actionPage.on("pageerror", error => actionErrors.push(error.message));
actionPage.on("console", message => { if (message.type() === "error") actionErrors.push(message.text()); });
actionPage.on("request", request => {
  if (request.method() !== "GET" && request.method() !== "HEAD") writeRequests.push(`${request.method()} ${request.url()}`);
});

const interactions = {};
try {
  await actionPage.goto(`${baseUrl}/agenda`, { waitUntil: "networkidle" });
  await actionPage.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
  await actionPage.getByRole("combobox", { name: "Día de la semana", exact: true }).selectOption("5");
  const fixtureAppointment = actionPage.getByRole("button", { name: /09:00 Carlos Rivas/ });
  await fixtureAppointment.waitFor();
  await fixtureAppointment.click();
  await actionPage.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await actionPage.getByRole("button", { name: "Reprogramar", exact: true }).click();
  await actionPage.getByRole("heading", { name: "Reprogramar cita", exact: true }).waitFor();
  const newSlot = actionPage.getByRole("button", { name: "11:00", exact: true });
  await newSlot.waitFor();
  await newSlot.click();
  assert.equal(await newSlot.getAttribute("aria-pressed"), "true", "The selected reschedule slot should be active");
  await actionPage.getByRole("button", { name: "Confirmar nueva hora", exact: true }).click();
  await actionPage.getByRole("heading", { name: "Reprogramar cita", exact: true }).waitFor({ state: "detached" });
  await actionPage.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await actionPage.getByText("sábado, 15 ago.", { exact: true }).waitFor();
  await actionPage.getByRole("button", { name: "Cerrar", exact: true }).click();
  await actionPage.locator('.sidebar-nav a[href="/"]').click();
  await actionPage.getByRole("heading", { name: "Viernes, 14 de agosto", exact: true }).waitFor();
  await actionPage.locator('.sidebar-nav a[href="/agenda"]').click();
  await actionPage.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
  await actionPage.getByRole("combobox", { name: "Día de la semana", exact: true }).selectOption("5");
  const rescheduledAppointment = actionPage.getByRole("button", { name: /11:00 Carlos Rivas, Ortodoncia/ });
  const wasRescheduled = await rescheduledAppointment.count() > 0;
  interactions.reschedule = { passed: wasRescheduled, before: "sábado 15 ago · 09:00", after: wasRescheduled ? "sábado 15 ago · 11:00" : "la agenda siguió mostrando 09:00" };
  const appointmentForCancellation = wasRescheduled ? rescheduledAppointment : actionPage.getByRole("button", { name: /09:00 Carlos Rivas/ });
  await appointmentForCancellation.waitFor();
  await appointmentForCancellation.click();
  await actionPage.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await actionPage.getByRole("button", { name: "Cancelar cita", exact: true }).click();
  await actionPage.getByRole("heading", { name: "¿Cancelar esta cita?", exact: true }).waitFor();
  await actionPage.getByRole("button", { name: "Cancelar cita", exact: true }).last().click();
  await actionPage.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await actionPage.getByRole("button", { name: "Cerrar", exact: true }).click();
  await actionPage.locator('.sidebar-nav a[href="/"]').click();
  await actionPage.getByRole("heading", { name: "Viernes, 14 de agosto", exact: true }).waitFor();
  await actionPage.locator('.sidebar-nav a[href="/agenda"]').click();
  await actionPage.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
  await actionPage.getByRole("combobox", { name: "Día de la semana", exact: true }).selectOption("5");
  await actionPage.getByRole("combobox", { name: "Estado", exact: true }).selectOption("Cancelada");
  const cancelledRow = actionPage.getByRole("button", { name: wasRescheduled ? /11:00 Carlos Rivas, Ortodoncia, Cancelada/ : /09:00 Carlos Rivas, Ortodoncia, Cancelada/ });
  const cancellationVisible = await cancelledRow.count() > 0;
  interactions.cancel = { passed: cancellationVisible, finalState: cancellationVisible ? "Cancelada" : "la cita no aparece como cancelada" };

  await actionPage.locator('.sidebar-nav a[href="/chat"]').click();
  await actionPage.getByRole("heading", { name: "Conversaciones", exact: true }).waitFor();
  await actionPage.getByRole("button", { name: /Ana Beltrán/ }).click();
  const thread = actionPage.locator(".message-history");
  await thread.getByText("Perfecto, gracias.", { exact: true }).waitFor();
  const originalCount = await thread.locator("[data-contact-id='patient:patient-ana']").count();
  const testMessage = "Prueba local aislada de Codex";
  await actionPage.getByRole("textbox", { name: "Mensaje para añadir a la demo", exact: true }).fill(testMessage);
  await actionPage.getByRole("button", { name: "Añadir mensaje a la demo", exact: true }).click();
  await thread.getByText(testMessage, { exact: true }).waitFor();
  assert.equal(await thread.locator("[data-contact-id='patient:patient-ana']").count(), originalCount + 1);
  await actionPage.getByRole("button", { name: "Restablecer conversación demo", exact: true }).click();
  await thread.getByText(testMessage, { exact: true }).waitFor({ state: "detached" });
  assert.equal(await thread.locator("[data-contact-id='patient:patient-ana']").count(), originalCount);
  interactions.chat = { passed: true, sentLocally: true, reset: true, originalMessageCount: originalCount };
} catch (error) {
  interactions.error = error instanceof Error ? error.message : String(error);
  try {
    interactions.pageText = (await actionPage.locator("body").innerText()).slice(0, 4000);
    await actionPage.screenshot({ path: join(outputDir, "interaction-failure.png"), fullPage: true });
  } catch {}
} finally {
  interactions.writeRequests = writeRequests;
  interactions.pageErrors = actionErrors;
  await actionContext.close();
}

const summary = {
  baseUrl,
  screenshots: outputDir,
  routes: results,
  interactions: { ...interactions, blockedWriteRequests },
  pageErrors,
  failures: results.filter(item => item.status !== "captured").length,
  mobileOverflows: results.flatMap(item => item.mobile).filter(item => item.overflow),
  allOverflows: results.flatMap(item => item.overflows ?? []),
  visualDefects: results.flatMap(item => item.visualDefects ?? []),
};
await writeFile(join(outputDir, "report.json"), JSON.stringify(summary, null, 2) + String.fromCharCode(10));
await browser.close();
console.log(JSON.stringify({ screenshots: outputDir, routes: results.length, failures: summary.failures, mobileOverflows: summary.mobileOverflows.length, pageErrors }, null, 2));
assert.equal(summary.failures, 0, "A route did not render its expected heading");
assert.deepEqual(summary.mobileOverflows, [], "A view overflows on mobile");
assert.deepEqual(summary.allOverflows, [], "A view overflows at one or more audited widths");
assert.deepEqual(summary.visualDefects, [], "A fixed control overlaps a visualization or clips key mobile content");
assert.deepEqual(pageErrors, [], "The browser reported a page error");
assert.ok(interactions.reschedule?.passed, "Appointment rescheduling did not pass");
assert.ok(interactions.cancel?.passed, "Appointment cancellation did not pass");
assert.ok(interactions.chat?.passed, "Local chat send/reset did not pass");
assert.deepEqual(interactions.writeRequests, [], "A demo action attempted to write to the backend");
assert.deepEqual(blockedWriteRequests, [], "A test attempted an HTTP write that the QA guard had to block");
assert.deepEqual(interactions.pageErrors, [], "An interaction reported a browser error");
