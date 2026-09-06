import assert from "node:assert/strict";
import { access, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5189";
const screenshotDir = process.env.VISUAL_SCREENSHOT_DIR
  ? resolve(process.env.VISUAL_SCREENSHOT_DIR)
  : fileURLToPath(new URL("../screenshots/", import.meta.url));
await mkdir(screenshotDir, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 5189, strictPort: true } });
await vite.listen();

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
    .map((entry) => join(browserCache, entry.name, "chrome-linux", "chrome"))
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

await test("Caja: pestañas, búsqueda y formularios", async () => {
  await openAndCapture("/caja", "caja.png", "Control de caja");
  await page.getByRole("button", { name: "Comisiones", exact: true }).click();
  await page.getByRole("heading", { name: "Comisiones", exact: true }).waitFor();
  await page.getByRole("button", { name: "Movimientos", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar movimiento" }).fill("Ana");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("textbox", { name: "Buscar movimiento" }).fill("");
  await page.getByRole("button", { name: "Nuevo ingreso" }).click();
  await page.getByLabel("Paciente", { exact: true }).fill("Paciente de caja");
  await page.getByLabel("Concepto").fill("Evaluación");
  await page.getByLabel("Monto (S/)").fill("90");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByText("Paciente de caja", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await page.getByRole("heading", { name: "Cerrar caja" }).waitFor();
  await page.getByRole("button", { name: "Cancelar" }).click();
});

await test("Inventario: filtros, paginación, producto y compra", async () => {
  await openAndCapture("/inventario", "inventario.png", "Gestión de inventario");
  await page.getByRole("combobox", { name: "Sede", exact: true }).last().selectOption("Lince");
  assert.ok(await page.locator("tbody tr").count() >= 1);
  await page.getByRole("combobox", { name: "Sede", exact: true }).last().selectOption("Todas las sedes");
  await page.getByRole("button", { name: "2", exact: true }).click();
  assert.ok(await page.locator("tbody tr").count() >= 1);
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("Nombre del producto").fill("Cemento temporal");
  await page.getByLabel("Stock inicial").fill("25");
  await page.getByLabel("Stock mínimo").fill("10");
  await page.getByLabel("Unidad de medida").fill("unidades");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByText("Cemento temporal", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByLabel("Cantidad recibida").fill("5");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar compra", exact: true }).click();
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
await vite.close();
const failed = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({ results, pageErrors }, null, 2));
if (failed.length || pageErrors.length) process.exitCode = 1;
