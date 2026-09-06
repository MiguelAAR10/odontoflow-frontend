import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5189";
const screenshotDir = process.env.VISUAL_SCREENSHOT_DIR
  ? resolve(process.env.VISUAL_SCREENSHOT_DIR)
  : fileURLToPath(new URL("../screenshots/", import.meta.url));
await mkdir(screenshotDir, { recursive: true });

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const runNext = (args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [nextBin, ...args], { stdio: "inherit", env: process.env });
  child.once("error", rejectRun);
  child.once("exit", (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`next ${args.join(" ")} exited with ${code ?? signal}`));
  });
});

const waitForServer = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/agenda`);
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The Next process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Next server did not become ready at ${baseUrl}`);
};

await runNext(["build"]);
const nextServer = spawn(process.execPath, [nextBin, "start", "-p", "5189", "-H", "127.0.0.1"], { stdio: "inherit", env: process.env });
process.once("exit", () => { if (nextServer.exitCode === null) nextServer.kill("SIGTERM"); });
await waitForServer();

const findChromiumExecutable = async () => {
  if (process.env.VISUAL_BROWSER_PATH) return process.env.VISUAL_BROWSER_PATH;

  const expectedPath = chromium.executablePath();
  try {
    await access(expectedPath);
    return expectedPath;
  } catch {
    // The npm package and the shared Playwright browser cache can be on
    // different revisions in this WSL workspace. Fall through to an
    // installed Chromium revision before asking callers for an override.
  }

  const configuredCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const browserCache = configuredCache && configuredCache !== "0"
    ? configuredCache
    : join(homedir(), ".cache", "ms-playwright");
  let entries = [];
  try {
    entries = await readdir(browserCache, { withFileTypes: true });
  } catch {
    // The final error below includes the supported override.
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
    .flatMap((entry) => ["chrome-linux", "chrome-linux64"].map((platformDirectory) => join(browserCache, entry.name, platformDirectory, "chrome")))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed revision.
    }
  }
  throw new Error(`No Chromium executable found. Set VISUAL_BROWSER_PATH (expected ${expectedPath}).`);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: await findChromiumExecutable(),
});
const context = await browser.newContext({ viewport: { width: 1692, height: 929 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });

const results = [];
const test = async (name, task) => {
  try {
    await task();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
};

const openAndCapture = async (route, file, heading) => {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  await page.screenshot({ path: join(screenshotDir, file), fullPage: false });
};

await test("Agenda: carga, filtros, detalle y nueva cita", async () => {
  await openAndCapture("/agenda", "agenda.png", "Agenda de citas");
  assert.equal(await page.getByRole("button", { name: /Paciente de prueba/ }).count(), 0);
  await page.getByRole("button", { name: /09:00 Ana Torres/ }).click();
  await page.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();
  await page.getByRole("combobox", { name: "Sede", exact: true }).first().selectOption("Lince");
  assert.equal(await page.getByRole("button", { name: /Ana Torres/ }).count(), 1);
  await page.getByRole("button", { name: "Nueva cita", exact: true }).click();
  await page.getByRole("textbox", { name: "Paciente", exact: true }).fill("Paciente de prueba");
  await page.getByRole("combobox", { name: "Tratamiento", exact: true }).selectOption("Evaluación");
  await page.getByRole("button", { name: "Crear cita", exact: true }).click();
  await page.getByText("Cita creada correctamente", { exact: true }).waitFor();
});

await test("Agente IA: pestañas, fecha, configuración y derivación", async () => {
  await openAndCapture("/agente", "agente.png", "Agente IA");
  await page.getByRole("button", { name: "Citas", exact: true }).click();
  assert.equal(await page.locator(".activity-row").count(), 2);
  await page.getByLabel("Filtrar por fecha").selectOption("Esta semana");
  await page.getByRole("button", { name: "Configurar agente" }).click();
  await page.getByRole("heading", { name: "Configurar agente" }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();
  await page.getByRole("button", { name: "Tomar conversación" }).first().click();
  await page.getByRole("heading", { name: "Conversación asignada" }).waitFor();
  await page.getByRole("button", { name: "Entendido" }).click();
});

await test("Pacientes: búsqueda, filtros, ficha y registro", async () => {
  await openAndCapture("/pacientes", "pacientes.png", "Pacientes");
  await page.getByRole("textbox", { name: "Buscar pacientes" }).fill("Ana");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("textbox", { name: "Buscar pacientes" }).fill("");
  await page.getByRole("button", { name: "Ver ficha" }).first().click();
  await page.getByRole("heading", { name: "Ficha del paciente" }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  await page.getByLabel("Nombre completo").fill("Elena Soto");
  await page.getByLabel("DNI", { exact: true }).fill("73456789");
  await page.getByLabel("Teléfono", { exact: true }).fill("+51 955 444 333");
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await page.getByText("Elena Soto", { exact: true }).waitFor();
});

await test("Caja: búsqueda y cobro", async () => {
  await openAndCapture("/caja", "caja.png", "Cobros");
  await page.getByRole("textbox", { name: "Buscar cargo", exact: true }).fill("#2");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("textbox", { name: "Buscar cargo", exact: true }).fill("");
  const chargeRow = page.locator("tbody tr").filter({ hasText: "#2" });
  await chargeRow.getByRole("button", { name: "Cobrar", exact: true }).click();
  await page.getByRole("heading", { name: "Cobrar cargo #2", exact: true }).waitFor();
  const chargeDialog = page.getByRole("dialog");
  await chargeDialog.getByRole("button", { name: "Pagar todo", exact: true }).click();
  await chargeDialog.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await page.getByRole("heading", { name: "Cobrar cargo #2", exact: true }).waitFor({ state: "detached" });
});

await test("Inventario: filtros, producto y entrada de stock", async () => {
  await openAndCapture("/inventario", "inventario.png", "Gestión de inventario");
  const locationFilter = page.getByRole("combobox", { name: "Sede", exact: true }).last();
  const linceValue = await locationFilter.locator("option", { hasText: "Lince" }).getAttribute("value");
  assert.ok(linceValue, "La sede Lince debe exponer un valor de opción");
  await locationFilter.selectOption(linceValue);
  assert.ok(await page.locator("tbody tr").count() >= 1);
  const jesusMariaValue = await locationFilter.locator("option", { hasText: "Jesús María" }).getAttribute("value");
  assert.ok(jesusMariaValue, "La sede Jesús María debe exponer un valor de opción");
  await locationFilter.selectOption(jesusMariaValue);
  assert.ok(await page.locator("tbody tr").count() >= 1);
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("Nombre del producto").fill("Cemento temporal");
  await page.getByLabel("Unidad de medida").fill("unidades");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByText("Cemento temporal", { exact: true }).waitFor();
  const productRow = page.locator("tbody tr").filter({ hasText: "Cemento temporal" });
  await productRow.getByRole("button", { name: "Entrada", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Cantidad", { exact: true }).fill("5");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar entrada", exact: true }).click();
});

await test("Chat: selección, filtros, transferencia y mensaje local", async () => {
  await openAndCapture("/chat", "chat.png", "Centro de conversaciones");
  await page.getByRole("button", { name: /Carlos Rojas/ }).click();
  await page.getByRole("button", { name: "Leads", exact: true }).click();
  assert.ok(await page.locator(".conversation-item").count() >= 1);
  await page.getByPlaceholder("Escribe un mensaje").fill("¿Te ayudo a reservar un horario?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await page.locator(".message-bubble p").getByText("¿Te ayudo a reservar un horario?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Transferir a humano" }).click();
  await page.getByText("Atención humana activa", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Crear cita" }).click();
  await page.getByRole("heading", { name: "Crear cita desde la conversación" }).waitFor();
  await page.getByRole("button", { name: "Cancelar" }).click();
});

await test("Responsive: 1024 px y móvil 390 px", async () => {
  await page.setViewportSize({ width: 1024, height: 929 });
  await page.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Gestión de inventario" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/agenda`, { waitUntil: "networkidle" });
  const menu = page.getByRole("button", { name: "Abrir navegación" });
  await menu.waitFor();
  await menu.click();
  await page.getByRole("link", { name: "Inventario" }).waitFor();
  await page.screenshot({ path: join(screenshotDir, "agenda-mobile.png"), fullPage: false });
});

await browser.close();
if (nextServer.exitCode === null) nextServer.kill("SIGTERM");
const failed = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({ results, pageErrors }, null, 2));
if (failed.length || pageErrors.length) process.exitCode = 1;
