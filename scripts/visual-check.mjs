import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5189";
const reuseExistingServer = process.env.VISUAL_USE_EXISTING_SERVER === "1";
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

let nextServer;
if (!reuseExistingServer) {
  // Webpack keeps this isolated runner deterministic when Turbopack's CSS worker cannot bind.
  await runNext(["build", "--webpack"]);
  nextServer = spawn(process.execPath, [nextBin, "start", "-p", "5189", "-H", "127.0.0.1"], { stdio: "inherit", env: process.env });
  process.once("exit", () => { if (nextServer.exitCode === null) nextServer.kill("SIGTERM"); });
}
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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const blockedWriteRequests = [];
const protectWrites = async (browserContext) => browserContext.route("**/*", async (route) => {
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
page.setDefaultTimeout(8_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });

const results = [];
const test = async (name, task) => {
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1440, height: 900 });
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

await test("Inicio administrativo: jornada y siguiente acción", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("admin");
  await openAndCapture("/", "inicio-admin.png", "Viernes, 14 de agosto");
  assert.ok(await page.getByRole("link", { name: "Agenda", exact: true }).count() > 0);
  await page.getByText("Sin llegada · próximas 48 h", { exact: true }).waitFor();
  await page.getByRole("heading", { name: /3 citas programadas hoy/ }).waitFor();
});

await test("Owner: cifras, filtros y origen del gráfico demo", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("owner");
  await openAndCapture("/", "inicio-owner.png", "Inicio");
  await page.getByLabel("Periodo", { exact: true }).selectOption("early");
  await page.getByText("Cargos creados, por día", { exact: true }).waitFor();
  await page.getByLabel("Periodo", { exact: true }).selectOption("late");
  await page.getByText("Ver valores y detalle diario", { exact: true }).click();
  await page.getByRole("button", { name: /Abrir cargos creados del/ }).first().click();
  await page.getByText("Detalle · Cargos creados", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("admin");
});

await test("Finanzas: periodo compartido y conciliación con Owner", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("owner");
  await openAndCapture("/finanzas", "finanzas.png", "Finanzas");
  const sprint5QaDir = fileURLToPath(new URL("../docs/qa/sprint-5/screenshots/", import.meta.url));
  await mkdir(sprint5QaDir, { recursive: true });
  await page.screenshot({ path: join(sprint5QaDir, "finanzas-1440.png"), fullPage: false });

  const period = page.getByRole("combobox", { name: "Periodo", exact: true });
  const financeBalance = await page.locator(".workspace-finance-summary strong").innerText();
  const financeChart = page.getByRole("img", { name: /Cargos creados y cobros recibidos por fecha/ });
  const initialFinanceChart = await financeChart.getAttribute("aria-label");
  await period.selectOption("early");
  assert.match(await financeChart.getAttribute("aria-label"), /10–12 ago/);
  assert.notEqual(await financeChart.getAttribute("aria-label"), initialFinanceChart);
  assert.equal(await page.locator(".workspace-finance-summary strong").innerText(), financeBalance, "current balance is not a period flow");
  await period.selectOption("all");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Finanzas 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await page.screenshot({ path: join(sprint5QaDir, "finanzas-390.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".topbar-brand").click();
  await page.getByRole("heading", { name: "Inicio", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Saldo vigente" }).locator("strong").innerText(), financeBalance);
});

await test("Ayuda contextual: contexto de fila y borrador editable", async () => {
  const helpDir = fileURLToPath(new URL("../docs/qa/sprint-7/screenshots/", import.meta.url));
  await mkdir(helpDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/pacientes`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Pacientes", exact: true }).waitFor();
  const anaRow = page.locator("tbody tr").filter({ hasText: "Ana Beltrán" });
  await anaRow.locator("td").first().click();
  await page.getByRole("button", { name: "Abrir ayuda contextual", exact: true }).click();
  const helpPanel = page.getByRole("complementary", { name: "Ayuda contextual" });
  await helpPanel.getByText("Ana Beltrán", { exact: true }).waitFor();
  assert.match(await helpPanel.getByRole("link", { name: "Abrir fuente" }).getAttribute("href"), /patient=patient-ana/);
  await helpPanel.getByRole("button", { name: "Preparar borrador", exact: true }).click();
  const draft = helpPanel.getByLabel("Borrador editable", { exact: false });
  await draft.waitFor();
  assert.match(await draft.inputValue(), /Ana Beltrán.*Blanqueamiento/);
  await draft.fill("Borrador revisado en esta prueba demo.");
  assert.equal(await draft.inputValue(), "Borrador revisado en esta prueba demo.");
  await page.screenshot({ path: join(helpDir, "help-patient-1440.png"), fullPage: false });

  const carlosRow = page.locator("tbody tr").filter({ hasText: "Carlos Rivas" });
  await carlosRow.locator("td").first().click();
  await helpPanel.getByText("Carlos Rivas", { exact: true }).waitFor();
  assert.equal(await helpPanel.locator("textarea").count(), 0, "changing the selected row clears the old draft");
  const listBox = await page.locator(".table-scroll").boundingBox();
  const panelBox = await helpPanel.boundingBox();
  assert.ok(listBox && panelBox && panelBox.x >= listBox.x + listBox.width - 1, "the contextual panel reserves a side column next to the visible list");

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Ayuda 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await helpPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(helpDir, "help-patient-390.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar ayuda contextual", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/caja`, { waitUntil: "networkidle" });
  const anaCharge = page.locator(".table-scroll tbody tr").filter({ hasText: "Ana Beltrán" }).first();
  await anaCharge.locator("td").first().click();
  await page.getByRole("button", { name: "Abrir ayuda contextual", exact: true }).click();
  await helpPanel.getByText(/Cargo S\/ 420\.00 · Pagado S\/ 280\.00 · Pendiente S\/ 140\.00/).waitFor();
  await helpPanel.getByRole("button", { name: "Preparar borrador", exact: true }).click();
  assert.match(await helpPanel.locator("textarea").inputValue(), /S\/ 140\.00/);
  await page.screenshot({ path: join(helpDir, "help-cash-1440.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar ayuda contextual", exact: true }).click();

  await page.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
  const gloveRow = page.locator(".inventory-table tbody tr").filter({ hasText: "Guantes de nitrilo" });
  await gloveRow.locator("td").first().click();
  await page.getByRole("button", { name: "Abrir ayuda contextual", exact: true }).click();
  await helpPanel.getByText("Guantes de nitrilo · Lince · Saldo demo 180 cajas", { exact: true }).waitFor();
  await helpPanel.getByRole("button", { name: "Preparar borrador", exact: true }).click();
  assert.equal(await helpPanel.locator("textarea").inputValue(), "Guantes de nitrilo: ");
  await page.screenshot({ path: join(helpDir, "help-inventory-1440.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar ayuda contextual", exact: true }).click();
});

await test("Pantallas maestras: cuatro anchos, sin desbordes", async () => {
  const masterScreenshotDir = fileURLToPath(new URL("../docs/qa/sprint-1/screenshots/", import.meta.url));
  await mkdir(masterScreenshotDir, { recursive: true });
  const roleSelect = page.getByRole("combobox", { name: "Rol demo", exact: true });
  const viewports = [1440, 1280, 390, 375];
  for (const role of ["admin", "owner", "collaborator"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await roleSelect.selectOption(role);
    const heading = role === "admin" ? "Viernes, 14 de agosto" : role === "collaborator" ? "Mi día" : "Inicio";
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    for (const width of viewports) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      if (role === "admin") {
        await page.getByRole("img", { name: /Ritmo de atención/ }).waitFor();
        await page.getByRole("img", { name: /Minutos de citas confirmadas por profesional/ }).waitFor();
      }
      if (role === "collaborator") {
        await page.getByRole("img", { name: /Ritmo de la semana/ }).waitFor();
        await page.getByRole("img", { name: /Agenda por servicio/ }).waitFor();
      }
      if (role === "admin" && width < 500) {
        await page.getByRole("button", { name: "Nueva cita", exact: true }).waitFor();
        const actionLayout = await page.locator(".mobile-appointment-action").evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const heading = document.querySelector(".page-heading h1")?.getBoundingClientRect();
          return { position: getComputedStyle(button).position, bottom: rect.bottom, headingTop: heading?.top ?? Number.NEGATIVE_INFINITY };
        });
        assert.equal(actionLayout.position, "static", `Admin mobile CTA must remain in document flow: ${JSON.stringify(actionLayout)}`);
        assert.ok(actionLayout.bottom <= actionLayout.headingTop, `Admin mobile CTA must not overlap the page heading: ${JSON.stringify(actionLayout)}`);
        const patientNameWidth = await page.locator(".workspace-table--compact tbody tr").first().locator("td").nth(1).evaluate((cell) => cell.getBoundingClientRect().width);
        assert.ok(patientNameWidth >= 280, `Admin mobile queue must give the patient identity enough width: ${patientNameWidth}px`);
      }
      const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `${role} ${width}px: overflow ${dimensions.document}/${dimensions.viewport}`);
      await page.screenshot({ path: join(masterScreenshotDir, `${role}-${width}.png`), fullPage: false });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("admin");
});

await test("Accesibilidad: foco de teclado y movimiento reducido por rol", async () => {
  for (const role of ["owner", "admin", "collaborator"]) {
    const isolatedContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await protectWrites(isolatedContext);
    await isolatedContext.addInitScript((savedRole) => window.localStorage.setItem("odontoflow-demo-role", savedRole), role);
    const accessibilityPage = await isolatedContext.newPage();
    accessibilityPage.setDefaultTimeout(8_000);
    const heading = role === "collaborator" ? "Mi día" : role === "admin" ? "Viernes, 14 de agosto" : "Inicio";
    await accessibilityPage.goto(baseUrl, { waitUntil: "networkidle" });
    await accessibilityPage.getByRole("heading", { name: heading, exact: true }).waitFor();
    await accessibilityPage.keyboard.press("Tab");
    await accessibilityPage.waitForFunction(() => {
      const link = document.querySelector(".skip-link");
      return link && link.getBoundingClientRect().top >= 0;
    });
    const focusState = await accessibilityPage.evaluate(() => {
      const active = document.activeElement;
      const link = document.querySelector(".skip-link");
      const sidebarItem = document.querySelector(".sidebar-item");
      return {
        skipLinkFocused: active === link,
        focusVisible: active?.matches(":focus-visible") ?? false,
        skipLinkTop: link?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        skipLinkTransition: link ? getComputedStyle(link).transitionDuration : null,
        sidebarTransition: sidebarItem ? getComputedStyle(sidebarItem).transitionProperty : null,
      };
    });
    assert.equal(focusState.skipLinkFocused, true, `${role}: first keyboard stop should be the skip link`);
    assert.equal(focusState.focusVisible, true, `${role}: skip link must expose keyboard focus`);
    assert.ok(focusState.skipLinkTop >= 0, `${role}: focused skip link must be visible`);
    assert.equal(focusState.reducedMotion, true, `${role}: reduced-motion preference was not applied`);
    assert.ok(Number.parseFloat(focusState.skipLinkTransition ?? "1") <= 0.001, `${role}: skip link transition should be effectively disabled`);
    assert.equal(focusState.sidebarTransition, "none", `${role}: sidebar motion should be disabled`);
    await isolatedContext.close();
  }
});

await test("Alcance: las rutas ajenas al rol redirigen", async () => {
  const deniedRoutes = [
    { role: "owner", route: "/administracion", landing: "/", heading: "Inicio" },
    { role: "admin", route: "/finanzas", landing: "/", heading: "Viernes, 14 de agosto" },
    { role: "admin", route: "/sedes", landing: "/", heading: "Viernes, 14 de agosto" },
    { role: "collaborator", route: "/agenda", landing: "/mi-dia", heading: "Mi día" },
    { role: "collaborator", route: "/caja", landing: "/mi-dia", heading: "Mi día" },
  ];
  for (const item of deniedRoutes) {
    const isolatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await protectWrites(isolatedContext);
    await isolatedContext.addInitScript((savedRole) => window.localStorage.setItem("odontoflow-demo-role", savedRole), item.role);
    const scopePage = await isolatedContext.newPage();
    scopePage.setDefaultTimeout(8_000);
    await scopePage.goto(`${baseUrl}${item.route}`, { waitUntil: "networkidle" });
    await scopePage.getByRole("heading", { name: item.heading, exact: true }).waitFor();
    assert.equal(new URL(scopePage.url()).pathname, item.landing, `${item.role} must be redirected from ${item.route}`);
    if (item.role === "owner") assert.equal(await scopePage.getByRole("link", { name: "Administración", exact: true }).count(), 0);
    await isolatedContext.close();
  }
});

await test("Pantallas maestras: estados vacío, carga y error", async () => {
  const stateDir = fileURLToPath(new URL("../docs/qa/sprint-1/screenshots/", import.meta.url));
  for (const role of ["owner", "admin"]) {
    for (const scenario of ["empty", "loading", "error"]) {
      const isolatedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      await protectWrites(isolatedContext);
      await isolatedContext.addInitScript((savedRole) => window.localStorage.setItem("odontoflow-demo-role", savedRole), role);
      const statePage = await isolatedContext.newPage();
      statePage.setDefaultTimeout(8_000);
      const stateErrors = [];
      statePage.on("pageerror", (error) => stateErrors.push(error.message));
      statePage.on("console", (message) => { if (message.type() === "error") stateErrors.push(message.text()); });
      await statePage.goto(`${baseUrl}/?demo=${scenario}`, { waitUntil: "domcontentloaded" });
      if (scenario === "empty") {
        await statePage.getByText(role === "owner" ? "Sin cargos creados en este filtro" : "Agenda vacía", { exact: false }).waitFor();
      } else if (scenario === "loading") {
        await statePage.getByText(role === "owner" ? "Preparando la lectura del periodo…" : "Preparando la jornada…", { exact: true }).waitFor();
      } else {
        await statePage.getByText(role === "owner" ? "No se pudo cargar la analítica" : "No se pudo cargar la jornada", { exact: true }).waitFor();
      }
      await statePage.screenshot({ path: join(stateDir, `${role}-${scenario}-390.png`), fullPage: false });
      const dimensions = await statePage.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `${role} ${scenario}: overflow ${dimensions.document}/${dimensions.viewport}`);
      assert.deepEqual(stateErrors, [], `${role} ${scenario}: browser errors ${JSON.stringify(stateErrors)}`);
      await isolatedContext.close();
    }
  }
});

await test("Rutas operativas: carga y error compartidos fuera de Inicio", async () => {
  const stateDir = fileURLToPath(new URL("../docs/qa/sprint-2/screenshots/", import.meta.url));
  await mkdir(stateDir, { recursive: true });
  for (const scenario of ["loading", "error"]) {
    const isolatedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await protectWrites(isolatedContext);
    await isolatedContext.addInitScript(() => window.localStorage.setItem("odontoflow-demo-role", "admin"));
    const statePage = await isolatedContext.newPage();
    statePage.setDefaultTimeout(8_000);
    const stateErrors = [];
    statePage.on("pageerror", (error) => stateErrors.push(error.message));
    statePage.on("console", (message) => { if (message.type() === "error") stateErrors.push(message.text()); });
    await statePage.goto(`${baseUrl}/agenda?demo=${scenario}`, { waitUntil: "domcontentloaded" });
    const message = scenario === "loading" ? "Preparando los datos demo…" : "No se pudo cargar el escenario demo";
    await statePage.getByRole(scenario === "loading" ? "status" : "alert").getByText(message, { exact: true }).waitFor();
    await statePage.screenshot({ path: join(stateDir, `agenda-${scenario}-390.png`), fullPage: false });
    assert.ok(await statePage.getByRole("button", { name: "Volver al escenario demo", exact: true }).count());
    const dimensions = await statePage.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `Agenda ${scenario}: overflow ${dimensions.document}/${dimensions.viewport}`);
    assert.deepEqual(stateErrors, [], `Agenda ${scenario}: browser errors ${JSON.stringify(stateErrors)}`);
    if (scenario === "error") {
      await statePage.getByRole("button", { name: "Volver al escenario demo", exact: true }).click();
      await statePage.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
    }
    await isolatedContext.close();
  }
});

await test("Agenda: carga, filtros, detalle y nueva cita", async () => {
  await openAndCapture("/agenda", "agenda.png", "Agenda de citas");
  assert.equal(await page.getByRole("button", { name: /Paciente de prueba/ }).count(), 0);
  await page.getByRole("button", { name: /15:30 Paola Herrera/ }).click();
  await page.getByRole("heading", { name: "Detalle de la cita", exact: true }).waitFor();
  await page.locator(".drawer").getByRole("button", { name: "Cerrar detalle" }).click();
  await page.getByRole("combobox", { name: "Sede", exact: true }).first().selectOption("Lince");
  assert.ok(await page.getByRole("button", { name: /Paola Herrera/ }).count() >= 1);
  await page.getByRole("button", { name: "Nueva cita", exact: true }).click();
  await page.getByRole("combobox", { name: "Paciente o lead", exact: true }).selectOption({ label: "Carlos Rivas" });
  await page.getByRole("combobox", { name: "Servicio", exact: true }).selectOption("svc-evaluacion");
  await page.getByRole("combobox", { name: "Sede", exact: true }).last().selectOption("lince");
  await page.getByRole("combobox", { name: "Odontólogo", exact: true }).last().selectOption("mateo");
  await page.getByLabel("Fecha", { exact: true }).fill("2026-08-14");
  await page.getByLabel("Hora", { exact: true }).fill("13:30");
  await page.getByLabel("Precio acordado · S/", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Crear cita", exact: true }).click();
  await page.getByText("Cita creada correctamente", { exact: true }).waitFor();
  await page.getByRole("button", { name: /13:30 Carlos Rivas, Evaluación/ }).waitFor();
  await page.locator(".topbar-brand").click();
  await page.getByText("Evaluación · Dr. Mateo Ruiz", { exact: true }).waitFor();
  await page.locator('.sidebar-nav a[href="/pacientes"]').click();
  await page.getByRole("heading", { name: "Pacientes", exact: true }).waitFor();
  const carlosRow = page.locator("tbody tr").filter({ hasText: "Carlos Rivas" });
  await carlosRow.waitFor();
  assert.match(await carlosRow.innerText(), /14 ago.*13:30/s, "Patients should show the same new appointment for Carlos");
});

await test("Guía de flujos: ayuda mock y navegación a tareas reales", async () => {
  await openAndCapture("/agente", "agente.png", "Guía de flujos");
  await page.getByRole("button", { name: /cita/i }).first().click();
  await page.getByRole("log", { name: "Conversación con el asistente mock" }).getByText(/cita/i).waitFor();
  await page.getByRole("button", { name: /Agenda/ }).first().click();
  await page.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
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

await test("Tablas móviles: ficha de paciente y acciones de solicitudes visibles", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/pacientes`, { waitUntil: "networkidle" });
  const ana = page.locator("tbody tr").filter({ hasText: "Ana Beltrán" });
  const patientAction = ana.getByRole("button", { name: "Ver ficha", exact: true });
  await patientAction.waitFor({ state: "visible" });
  const patientActionBox = await patientAction.boundingBox();
  assert.ok(patientActionBox && patientActionBox.x + patientActionBox.width <= 390, `Patient action must fit on mobile: ${JSON.stringify(patientActionBox)}`);
  await patientAction.click();
  await page.getByRole("heading", { name: "Ficha del paciente" }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();

  await page.goto(`${baseUrl}/solicitudes`, { waitUntil: "networkidle" });
  const labRequest = page.locator(".workspace-table tbody tr").filter({ hasText: "Solicitar modelo de estudio" });
  await labRequest.getByText("Solicitar modelo de estudio", { exact: true }).waitFor({ state: "visible" });
  const requestRow = await labRequest.boundingBox();
  assert.ok(requestRow && requestRow.x + requestRow.width <= 390, `Request row must fit on mobile: ${JSON.stringify(requestRow)}`);
  await labRequest.getByText("Orden enviada", { exact: true }).waitFor({ state: "visible" });
  const openRequest = page.locator(".workspace-table tbody tr").filter({ hasText: "Completar indicaciones de evaluación" });
  assert.ok(await openRequest.getByRole("button", { name: "Avanzar", exact: true }).isVisible(), "request action remains visible on mobile");
});

await test("Leads: consulta, asignación, contacto y promoción trazable", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAndCapture("/pacientes?tab=leads", "leads.png", "Pacientes");
  await page.getByText("María Loayza", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ficha", exact: true }).count(), 4);
  const leadQaDir = fileURLToPath(new URL("../docs/qa/sprint-3/screenshots/", import.meta.url));
  await mkdir(leadQaDir, { recursive: true });
  await page.screenshot({ path: join(leadQaDir, "leads-1440.png"), fullPage: false });
  const mobileDir = join(leadQaDir, "leads-390.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Pacientes", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Nueva cita", exact: true }).count(), 0, "appointment action is hidden from the unrelated Leads surface");
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Leads 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await page.screenshot({ path: mobileDir, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  const unassigned = page.locator("article").filter({ hasText: "Diego Salazar" });
  await unassigned.getByRole("button", { name: "Ficha" }).click();
  await page.getByRole("heading", { name: "Ficha del lead" }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();
  await page.getByRole("combobox", { name: "Filtrar leads por estado" }).selectOption("new");
  await page.getByRole("button", { name: "Nuevo lead" }).click();
  await page.getByLabel("Nombre completo").fill("Verónica Díaz");
  await page.getByLabel("Teléfono", { exact: true }).fill("+51 900 000 001");
  await page.getByLabel("Necesidad de servicio").fill("Evaluación");
  await page.getByRole("button", { name: "Registrar lead" }).click();
  await page.getByText("Lead creado en demo", { exact: true }).waitFor();
  const newLead = page.locator("article").filter({ hasText: "Verónica Díaz" });
  await newLead.getByRole("combobox", { name: "Sede de Verónica Díaz" }).selectOption("lince");
  await newLead.getByRole("button", { name: "Contactar" }).click();
  await page.getByText("Contacto registrado en demo", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Filtrar leads por estado" }).selectOption("all");
  await newLead.getByRole("button", { name: "Promover" }).click();
  await page.getByText("Paciente creado", { exact: true }).waitFor();
  await newLead.getByRole("button", { name: "Ficha" }).click();
  await page.getByRole("heading", { name: "Ficha del lead" }).waitFor();
  await page.getByRole("link", { name: /Abrir paciente/ }).waitFor();
});

await test("Caja: búsqueda y cobro", async () => {
  await openAndCapture("/caja", "caja.png", "Cobros");
  const sprint4QaDir = fileURLToPath(new URL("../docs/qa/sprint-4/screenshots/", import.meta.url));
  await mkdir(sprint4QaDir, { recursive: true });
  await page.screenshot({ path: join(sprint4QaDir, "cash-1440.png"), fullPage: false });
  const actionGeometry = await page.evaluate(() => {
    const table = document.querySelector(".cash-desktop-table");
    const action = document.querySelector(".cash-desktop-table tbody tr:first-child td:last-child button");
    if (!table || !action) return null;
    const tableRect = table.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return { tableRight: tableRect.right, actionRight: actionRect.right, tableWidth: table.clientWidth, scrollWidth: table.scrollWidth };
  });
  assert.ok(actionGeometry && actionGeometry.actionRight <= actionGeometry.tableRight + 1, `Caja desktop row action must fit without clipping: ${JSON.stringify(actionGeometry)}`);
  await page.getByRole("textbox", { name: "Buscar cargo", exact: true }).fill("Ana Beltrán");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("textbox", { name: "Buscar cargo", exact: true }).fill("");
  const chargeRow = page.locator("tbody tr").filter({ hasText: "Ana Beltrán" });
  const roleSelect = page.getByRole("combobox", { name: "Rol demo", exact: true });
  await roleSelect.selectOption("owner");
  await chargeRow.getByRole("button", { name: "Ver pagos", exact: true }).waitFor();
  assert.equal(await chargeRow.getByRole("button", { name: "Cobrar", exact: true }).count(), 0, "Owner must not see a payment action");
  await roleSelect.selectOption("admin");
  await chargeRow.getByRole("button", { name: "Cobrar", exact: true }).click();
  await page.getByRole("heading", { name: /Ana Beltrán · Blanqueamiento/ }).waitFor();
  const chargeDialog = page.getByRole("dialog");
  await chargeDialog.getByRole("button", { name: "Pagar todo", exact: true }).click();
  await chargeDialog.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await page.getByRole("heading", { name: /Ana Beltrán · Blanqueamiento/ }).waitFor({ state: "detached" });
  for (const width of [390, 375]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => document.querySelector(".app-sidebar")?.getBoundingClientRect().right <= 0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator(".table-scroll").first().evaluate((table) => { table.scrollLeft = 0; });
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `Caja ${width}px: overflow ${dimensions.document}/${dimensions.viewport}`);
    const firstMobileAction = page.locator('[class*="mobileCharge"]').first().getByRole("button").first();
    const firstMobileActionBox = await firstMobileAction.boundingBox();
    const firstMobileActionBottom = firstMobileActionBox && firstMobileActionBox.y + firstMobileActionBox.height;
    assert.ok(firstMobileActionBottom !== null && firstMobileActionBottom <= 844, `Caja ${width}px: first charge action should appear above the fold: ${JSON.stringify(firstMobileActionBox)}`);
    await page.screenshot({ path: join(sprint4QaDir, `cash-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

await test("Inventario: saldo y trazabilidad de transferencia en ambas sedes", async () => {
  await openAndCapture("/inventario", "inventario.png", "Inventario");
  const sprint4QaDir = fileURLToPath(new URL("../docs/qa/sprint-4/screenshots/", import.meta.url));
  await mkdir(sprint4QaDir, { recursive: true });
  const locationFilter = page.getByRole("combobox", { name: "Sede", exact: true }).last();
  const linceValue = await locationFilter.locator("option", { hasText: "Lince" }).getAttribute("value");
  assert.ok(linceValue, "La sede Lince debe exponer un valor de opción");
  await locationFilter.selectOption(linceValue);
  assert.ok(await page.locator("tbody tr").count() >= 1);
  assert.equal(await locationFilter.locator("option").count(), 1, "Administrativo solo opera en la sede asignada");
  await page.getByRole("button", { name: /Ver kardex/ }).first().click();
  await page.getByRole("heading", { name: /Kardex/ }).waitFor();
  await page.getByRole("button", { name: "Cerrar modal" }).click();

  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("owner");
  await locationFilter.locator('option[value="jesus-maria"]').waitFor({ state: "attached" });
  await locationFilter.selectOption("lince");
  const glovesRow = page.locator("tbody tr").filter({ hasText: "Guantes de nitrilo" });
  await glovesRow.getByRole("button", { name: "Transferir Guantes de nitrilo" }).click();
  await page.getByRole("heading", { name: /Transferir · Guantes de nitrilo/ }).waitFor();
  await page.locator('select[name="destination"]').selectOption("jesus-maria");
  await page.locator('input[name="quantity"]').fill("10");
  await page.locator('input[name="reason"]').fill("Reposición");
  await page.getByRole("button", { name: "Realizar transferencia" }).click();
  await page.getByRole("heading", { name: /Transferir · Guantes de nitrilo/ }).waitFor({ state: "detached" });
  await page.getByText("170 cajas", { exact: true }).waitFor();

  await locationFilter.selectOption("jesus-maria");
  await page.getByText("70 cajas", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Ver kardex de Guantes de nitrilo" }).click();
  await page.getByText("Entrada por transferencia", { exact: true }).waitFor();
  await page.getByText("+10 cajas", { exact: true }).waitFor();
  await page.screenshot({ path: join(sprint4QaDir, "inventory-transfer-destination-1440.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar modal" }).click();

  await locationFilter.selectOption("lince");
  await page.getByRole("button", { name: "Ver kardex de Guantes de nitrilo" }).click();
  await page.getByText("Salida por transferencia", { exact: true }).waitFor();
  await page.getByText("-10 cajas", { exact: true }).waitFor();
  await page.screenshot({ path: join(sprint4QaDir, "inventory-transfer-origin-1440.png"), fullPage: false });
  await page.getByRole("button", { name: "Cerrar modal" }).click();
  for (const width of [1440, 1280, 390, 375]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.locator(".table-scroll").first().evaluate((table) => { table.scrollLeft = 0; });
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `Inventario ${width}px: overflow ${dimensions.document}/${dimensions.viewport}`);
    await page.screenshot({ path: join(sprint4QaDir, `inventory-owner-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

await test("Inventario: conteo escrito revisable y ajuste demo por sede", async () => {
  const countDir = fileURLToPath(new URL("../docs/qa/sprint-8/screenshots/", import.meta.url));
  await mkdir(countDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAndCapture("/inventario", "inventory-count-entry-1440.png", "Inventario");
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("owner");
  const locationFilter = page.getByRole("combobox", { name: "Sede", exact: true }).last();
  await locationFilter.selectOption("lince");
  await page.getByRole("button", { name: "Revisar conteo", exact: true }).click();
  const countDialog = page.getByRole("dialog", { name: "Revisar conteo escrito" });
  const countText = countDialog.getByRole("textbox", { name: "Texto del conteo", exact: true });
  assert.equal(await countText.evaluate((element) => element === document.activeElement), true, "opening the count dialog focuses its text field");

  await countText.fill("Producto desconocido: 4 cajas");
  await countDialog.getByRole("button", { name: "Interpretar texto", exact: true }).click();
  await countDialog.getByText("No identifiqué un producto exacto. Conservé el texto para que lo corrijas.", { exact: true }).waitFor();
  assert.equal(await countText.inputValue(), "Producto desconocido: 4 cajas", "un fallo de interpretación conserva el texto original");

  await countText.fill("Guantes de nitrilo: 58 cajas");
  await countDialog.getByRole("button", { name: "Interpretar texto", exact: true }).click();
  await countDialog.getByRole("combobox", { name: "Sede del conteo", exact: true }).selectOption("jesus-maria");
  await countDialog.getByText("60 cajas", { exact: true }).waitFor();
  const countedQuantity = countDialog.getByRole("spinbutton", { name: "Cantidad contada", exact: true });
  await countedQuantity.waitFor();
  assert.equal(await countedQuantity.inputValue(), "58");
  await countDialog.getByText("-2 cajas", { exact: true }).waitFor();
  await countDialog.getByLabel("Motivo del ajuste", { exact: true }).fill("Conteo físico demo");
  await page.screenshot({ path: join(countDir, "inventory-count-review-1440.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Revisión de conteo 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await page.screenshot({ path: join(countDir, "inventory-count-review-390.png"), fullPage: false });
  const confirm = countDialog.getByRole("button", { name: "Confirmar ajuste demo", exact: true });
  await confirm.scrollIntoViewIfNeeded();
  await confirm.click();
  await countDialog.waitFor({ state: "detached" });

  await locationFilter.selectOption("jesus-maria");
  await page.getByText("58 cajas", { exact: true }).waitFor();
  await locationFilter.selectOption("lince");
  await page.getByText("180 cajas", { exact: true }).waitFor();
  await locationFilter.selectOption("jesus-maria");
  await page.getByRole("button", { name: "Ver kardex de Guantes de nitrilo" }).click();
  await page.getByText("-2 cajas", { exact: true }).waitFor();
  await page.screenshot({ path: join(countDir, "inventory-count-kardex-390.png"), fullPage: false });
});

if (process.env.NEXT_PUBLIC_ENABLE_VOICE_DRAFTS === "true" && process.env.NEXT_PUBLIC_USE_MOCKS !== "false") {
  const voiceServiceUrl = (process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
  const voiceReply = {
    sesion_id: "synthetic-session",
    flujo: "inventario",
    terminado: false,
    paso: 1,
    total_pasos: 1,
    pasos: [],
    pregunta: null,
    mensajes: [{
      de: "bot",
      texto: "Synthetic catalog output",
      ts: "2026-09-27T00:00:00Z",
      adjunto: { tipo: "inventario", filas: [{ codigo: "VOICE-SYNTH-999", nombre: "Guantes de nitrilo", anterior: 180, contado: 999, diferencia: 819, estado: "contado" }], contados: 1, total: 1 },
    }],
    transcripcion: { texto: "Guantes de nitrilo: 175 cajas", segundos_audio: 3.4, segundos_proceso: 0.8, modelo: "small" },
  };
  const newVoicePage = async (mode, viewport = { width: 1440, height: 900 }) => {
    const isolatedContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await protectWrites(isolatedContext);
    await isolatedContext.addInitScript((scenario) => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (scenario === "denied") throw new DOMException("Permission denied", "NotAllowedError");
            return { getTracks: () => [{ stop() {} }] };
          },
        },
      });
      class StubMediaRecorder {
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable = null;
        onstop = null;
        onerror = null;
        constructor(_stream) {}
        start() { this.state = "recording"; }
        stop() {
          this.state = "inactive";
          const data = scenario === "empty" ? new Blob([], { type: this.mimeType }) : new Blob(["simulated audio"], { type: this.mimeType });
          this.ondataavailable?.({ data });
          queueMicrotask(() => this.onstop?.(new Event("stop")));
        }
      }
      window.MediaRecorder = StubMediaRecorder;
      window.localStorage.setItem("odontoflow-demo-role", "owner");
    }, mode);
    const voiceRequests = [];
    const erpRequests = [];
    await isolatedContext.route("**/*", async (route) => {
      const request = route.request();
      if (request.url().startsWith(`${voiceServiceUrl}/audio`)) {
        if (request.method() === "OPTIONS") return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": baseUrl,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
        voiceRequests.push({ method: request.method(), url: request.url() });
        if (mode === "service-down") return route.abort();
        if (mode === "success") return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": baseUrl },
          body: JSON.stringify(voiceReply),
        });
        return route.abort();
      }
      if (request.method() !== "GET" && request.method() !== "HEAD") {
        erpRequests.push({ method: request.method(), url: request.url() });
        return route.abort();
      }
      return route.continue();
    });
    const voicePage = await isolatedContext.newPage();
    voicePage.setDefaultTimeout(8_000);
    return { context: isolatedContext, page: voicePage, voiceRequests, erpRequests };
  };

  await test("Inventario: voz llena un borrador editable sin leer filas sintéticas ni ajustar stock", async () => {
    const voiceDir = fileURLToPath(new URL("../docs/qa/sprint-8/screenshots/", import.meta.url));
    await mkdir(voiceDir, { recursive: true });
    const { context: voiceContext, page: voicePage, voiceRequests, erpRequests } = await newVoicePage("success");
    try {
      await voicePage.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
      await voicePage.getByRole("heading", { name: "Inventario", exact: true }).waitFor();
      const glovesRow = voicePage.locator("tbody tr").filter({ hasText: "Guantes de nitrilo" });
      await glovesRow.getByText("180 cajas", { exact: true }).waitFor();
      await voicePage.getByRole("button", { name: "Conteo por voz", exact: true }).click();
      const countDialog = voicePage.getByRole("dialog", { name: "Revisar conteo escrito" });
      await countDialog.getByRole("button", { name: "Grabar conteo", exact: true }).click();
      await countDialog.getByRole("button", { name: "Detener y transcribir", exact: true }).click();
      const countText = countDialog.getByRole("textbox", { name: "Texto del conteo", exact: true });
      await countText.waitFor({ state: "visible" });
      await voicePage.getByRole("status").getByText("Transcripción small", { exact: false }).waitFor();
      assert.equal(await countText.inputValue(), "Guantes de nitrilo: 175 cajas");
      assert.equal(await countDialog.getByText("Producto detectado", { exact: true }).count(), 0, "transcription does not interpret or accept the service catalog row automatically");
      assert.equal(await countDialog.getByText("VOICE-SYNTH-999", { exact: true }).count(), 0, "synthetic SKU is discarded");
      assert.equal(await countDialog.getByText("999 cajas", { exact: true }).count(), 0, "synthetic count is discarded");
      await countDialog.getByRole("button", { name: "Interpretar texto", exact: true }).click();
      await countDialog.getByText("Producto detectado", { exact: true }).waitFor();
      await countDialog.locator(".inventory-count-product").getByText("Guantes de nitrilo", { exact: true }).waitFor();
      assert.equal(await countDialog.getByRole("spinbutton", { name: "Cantidad contada", exact: true }).inputValue(), "175");
      await countDialog.getByText("180 cajas", { exact: true }).waitFor();
      await countDialog.getByText("-5 cajas", { exact: true }).waitFor();
      await glovesRow.getByText("180 cajas", { exact: true }).waitFor();
      assert.equal(await countDialog.getByRole("button", { name: "Confirmar ajuste demo", exact: true }).isDisabled(), true, "voice draft cannot be confirmed until the user supplies a reason");
      assert.equal(voiceRequests.length, 1);
      assert.equal(voiceRequests[0].method, "POST");
      assert.equal(new URL(voiceRequests[0].url).pathname, "/audio");
      assert.deepEqual(erpRequests, [], "transcription and interpretation make no ERP request");
      await voicePage.screenshot({ path: join(voiceDir, "inventory-voice-review-1440.png"), fullPage: false });

      await voicePage.setViewportSize({ width: 390, height: 844 });
      const dimensions = await voicePage.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `Voice draft 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
      await countDialog.getByRole("spinbutton", { name: "Cantidad contada", exact: true }).scrollIntoViewIfNeeded();
      await voicePage.screenshot({ path: join(voiceDir, "inventory-voice-review-390.png"), fullPage: false });
      assert.deepEqual(erpRequests, [], "no ERP request was made and confirmation was not submitted");
      await countDialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await glovesRow.getByText("180 cajas", { exact: true }).waitFor();
    } finally {
      await voiceContext.close();
    }
  });

  await test("Inventario: micrófono denegado deja operativo el conteo escrito", async () => {
    const { context: voiceContext, page: voicePage, voiceRequests, erpRequests } = await newVoicePage("denied");
    try {
      await voicePage.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
      await voicePage.getByRole("button", { name: "Conteo por voz", exact: true }).click();
      const countDialog = voicePage.getByRole("dialog", { name: "Revisar conteo escrito" });
      await countDialog.getByRole("button", { name: "Grabar conteo", exact: true }).click();
      await countDialog.getByRole("alert").getByText("No se permitió el micrófono", { exact: false }).waitFor();
      const countText = countDialog.getByRole("textbox", { name: "Texto del conteo", exact: true });
      await countText.fill("Guantes de nitrilo: 175 cajas");
      await countDialog.getByRole("button", { name: "Interpretar texto", exact: true }).click();
      assert.equal(await countDialog.getByRole("spinbutton", { name: "Cantidad contada", exact: true }).inputValue(), "175");
      assert.equal(voiceRequests.length, 0, "permission denial never contacts the voice service");
      assert.deepEqual(erpRequests, []);
    } finally {
      await voiceContext.close();
    }
  });

  await test("Inventario: servicio de voz caído conserva el texto que ya estaba escrito", async () => {
    const { context: voiceContext, page: voicePage, voiceRequests, erpRequests } = await newVoicePage("service-down");
    try {
      await voicePage.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
      await voicePage.getByRole("button", { name: "Conteo por voz", exact: true }).click();
      const countDialog = voicePage.getByRole("dialog", { name: "Revisar conteo escrito" });
      const countText = countDialog.getByRole("textbox", { name: "Texto del conteo", exact: true });
      await countText.fill("Texto escrito antes del audio: 2 cajas");
      await countDialog.getByRole("button", { name: "Grabar conteo", exact: true }).click();
      await countDialog.getByRole("button", { name: "Detener y transcribir", exact: true }).click();
      await countDialog.getByRole("alert").getByText("El servicio de transcripción no respondió", { exact: false }).waitFor();
      assert.equal(await countText.inputValue(), "Texto escrito antes del audio: 2 cajas");
      assert.equal(voiceRequests.length, 1);
      assert.deepEqual(erpRequests, []);
    } finally {
      await voiceContext.close();
    }
  });

  await test("Inventario: audio vacío se rechaza sin llamar al servicio", async () => {
    const { context: voiceContext, page: voicePage, voiceRequests, erpRequests } = await newVoicePage("empty");
    try {
      await voicePage.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
      await voicePage.getByRole("button", { name: "Conteo por voz", exact: true }).click();
      const countDialog = voicePage.getByRole("dialog", { name: "Revisar conteo escrito" });
      await countDialog.getByRole("button", { name: "Grabar conteo", exact: true }).click();
      await countDialog.getByRole("button", { name: "Detener y transcribir", exact: true }).click();
      await countDialog.getByRole("alert").getByText("La grabación está vacía", { exact: false }).waitFor();
      assert.equal(voiceRequests.length, 0, "empty audio is rejected before POST /audio");
      assert.deepEqual(erpRequests, []);
    } finally {
      await voiceContext.close();
    }
  });
}

await test("Chat → Agenda → Inicio: cita demo compartida", async () => {
  const sprint7QaDir = fileURLToPath(new URL("../docs/qa/sprint-7/screenshots/", import.meta.url));
  await mkdir(sprint7QaDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const roleSelect = page.getByRole("combobox", { name: "Rol demo", exact: true });
  await roleSelect.selectOption("owner");
  await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conversaciones", exact: true }).waitFor();
  await page.getByRole("button", { name: "Leads", exact: true }).click();
  await page.getByRole("button", { name: /Diego Salazar/ }).waitFor();
  await page.getByRole("button", { name: /María Loayza/ }).waitFor();
  assert.equal(await page.locator(".conversation-item").count(), 2, "Owner sees the two unconverted demo leads");
  assert.equal(await page.getByRole("button", { name: /Carlos Rojas|Lucía Pérez|Ana Torres/ }).count(), 0, "legacy chat identities are gone");
  assert.equal(await page.getByRole("button", { name: "Crear cita", exact: true }).count(), 0, "Owner cannot create appointments without the capability");

  await roleSelect.selectOption("admin");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: /Ana Beltrán/ }).click();
  await page.locator(".message-panel").getByRole("heading", { name: "Ana Beltrán", exact: true }).waitFor();
  assert.equal(await page.getByText("Sin cita futura confirmada.", { exact: true }).count(), 1);
  const desktopThread = page.locator(".message-history");
  assert.equal(await desktopThread.getAttribute("data-thread-contact-id"), "patient:patient-ana", "thread is keyed by the shared patient ID");
  assert.equal(await desktopThread.locator("[data-contact-id='patient:patient-ana']").count(), 3, "a demo conversation is seeded for Ana's shared identity");
  const nonReadRequests = [];
  const recordNonReadRequest = (request) => { if (request.method() !== "GET" && request.method() !== "HEAD") nonReadRequests.push(request.url()); };
  page.on("request", recordNonReadRequest);
  const desktopDraft = page.getByRole("textbox", { name: "Mensaje para añadir a la demo", exact: true });
  await desktopDraft.fill("Mensaje reversible de escritorio");
  await page.getByRole("button", { name: "Añadir mensaje a la demo", exact: true }).click();
  await desktopThread.getByText("Mensaje reversible de escritorio", { exact: true }).waitFor();
  assert.equal(await desktopThread.locator("[data-contact-id='patient:patient-ana']").count(), 4);
  await page.getByRole("button", { name: "Restablecer conversación demo", exact: true }).click();
  await desktopThread.getByText("Mensaje reversible de escritorio", { exact: true }).waitFor({ state: "detached" });
  assert.equal(await desktopThread.locator("[data-contact-id='patient:patient-ana']").count(), 3, "reset restores the original conversation");
  await page.locator(".conversation-list .conversation-item").filter({ hasText: "Carlos Rivas" }).click();
  await page.waitForFunction(() => document.querySelector(".message-history")?.getAttribute("data-thread-contact-id") === "patient:patient-carlos");
  assert.equal(await page.locator(".message-history").locator("[data-contact-id='patient:patient-carlos']").count(), 3, "conversation identity switches by patient ID");
  await page.locator(".conversation-list .conversation-item").filter({ hasText: "Ana Beltrán" }).click();
  await page.waitForFunction(() => document.querySelector(".message-history")?.getAttribute("data-thread-contact-id") === "patient:patient-ana");
  assert.deepEqual(nonReadRequests, [], "local message send and reset make no external request");
  await page.screenshot({ path: join(sprint7QaDir, "chat-1440.png"), fullPage: false });

  await page.getByRole("button", { name: "Crear cita", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Crear cita desde el contacto" });
  await createDialog.waitFor();
  assert.equal(await createDialog.getByLabel("Servicio", { exact: true }).inputValue(), "svc-blanqueamiento", "service defaults to the treatment recorded on the selected patient");
  assert.equal(await createDialog.getByLabel("Sede", { exact: true }).inputValue(), "lince");
  assert.equal(await createDialog.getByLabel("Odontólogo", { exact: true }).inputValue(), "valeria", "provider is compatible with the service/location pair in the shared snapshot");
  await createDialog.getByLabel("Fecha", { exact: true }).fill("2026-08-14");
  await createDialog.getByLabel("Hora", { exact: true }).fill("15:30");
  await createDialog.getByRole("button", { name: "Crear cita en demo", exact: true }).click();
  await page.getByRole("status").getByText("Cita creada en el escenario demo", { exact: true }).waitFor();
  const agendaLink = page.locator(".message-panel").getByRole("button", { name: "Ver en agenda", exact: true });
  await agendaLink.waitFor();
  await page.screenshot({ path: join(sprint7QaDir, "chat-appointment-1440.png"), fullPage: false });
  await agendaLink.click();
  await page.getByRole("heading", { name: "Agenda de citas", exact: true }).waitFor();
  const appointmentDetail = page.getByRole("dialog", { name: "Detalle de la cita" });
  await appointmentDetail.getByText("Ana Beltrán", { exact: true }).waitFor();
  await appointmentDetail.getByText("Blanqueamiento", { exact: true }).waitFor();
  await appointmentDetail.getByText("Lince", { exact: true }).waitFor();
  await appointmentDetail.getByRole("button", { name: "Cerrar detalle", exact: true }).click();
  await appointmentDetail.waitFor({ state: "detached" });
  await page.waitForURL((url) => !url.searchParams.has("appointment"));

  await page.locator(".topbar-brand").click();
  await page.getByRole("heading", { name: "Viernes, 14 de agosto", exact: true }).waitFor();
  const newAppointmentRow = page.getByRole("row", { name: /15:30 Ana Beltrán/ });
  await newAppointmentRow.getByText("Blanqueamiento · Dra. Valeria Soto", { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Abrir navegación" });
  await menu.click();
  await page.getByRole("link", { name: "Conversaciones", exact: true }).click();
  await page.getByRole("heading", { name: "Conversaciones", exact: true }).waitFor();
  await page.locator(".sidebar-backdrop").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector(".app-sidebar")?.getBoundingClientRect().right <= 0);
  assert.equal(await menu.getAttribute("aria-expanded"), "false", "mobile navigation is closed before capture");
  const mobileControls = page.locator(".chat-mobile-toggle");
  await mobileControls.nth(0).waitFor();
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".chat-mobile-toggle")).every((button) => button.getAttribute("aria-expanded") === "false"));
  const mobileThread = page.locator(".message-history");
  assert.equal(await mobileThread.getAttribute("data-thread-contact-id"), "patient:patient-ana");
  assert.equal(await mobileThread.locator("[data-contact-id='patient:patient-ana']").count(), 3, "mobile opens the conversation for the shared contact ID");
  const mobileDraft = page.getByRole("textbox", { name: "Mensaje para añadir a la demo", exact: true });
  await mobileDraft.fill("Mensaje reversible de móvil");
  await page.getByRole("button", { name: "Añadir mensaje a la demo", exact: true }).click();
  await mobileThread.getByText("Mensaje reversible de móvil", { exact: true }).waitFor();
  assert.equal(await mobileThread.locator("[data-contact-id='patient:patient-ana']").count(), 4);
  await page.getByRole("button", { name: "Restablecer conversación demo", exact: true }).click();
  await mobileThread.getByText("Mensaje reversible de móvil", { exact: true }).waitFor({ state: "detached" });
  assert.equal(await mobileThread.locator("[data-contact-id='patient:patient-ana']").count(), 3);
  assert.deepEqual(nonReadRequests, [], "mobile demo messages remain local too");
  await mobileControls.nth(1).click();
  await page.getByRole("button", { name: "Crear cita", exact: true }).waitFor();
  await mobileControls.nth(1).click();
  await mobileControls.nth(0).click();
  await page.getByRole("group", { name: "Filtrar contactos", exact: true }).getByRole("button", { name: "Pacientes", exact: true }).click();
  const contactSearch = page.getByRole("textbox", { name: "Buscar contacto", exact: true });
  await contactSearch.fill("Ana Beltrán");
  assert.equal(await page.locator(".conversation-item").count(), 1, "mobile contact search works after opening the compact list");
  await contactSearch.fill("");
  await page.getByRole("group", { name: "Filtrar contactos", exact: true }).getByRole("button", { name: "Todos", exact: true }).click();
  await mobileControls.nth(0).click();
  assert.equal(await mobileControls.nth(0).getAttribute("aria-expanded"), "false", "the contact list returns to its compact state");
  assert.equal(await page.locator(".conversation-panel__content").evaluate((element) => getComputedStyle(element).display), "none");
  assert.equal(await page.locator(".chat-channel-note").count(), 0, "thread uses compact local demo status instead of the old disconnected placeholder");
  assert.equal(await page.locator(".chat-thread-empty").count(), 0, "the empty-thread placeholder is removed");
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Chat 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await page.screenshot({ path: join(sprint7QaDir, "chat-390.png"), fullPage: false });
  const sprint8QaDir = fileURLToPath(new URL("../docs/qa/sprint-8/screenshots/", import.meta.url));
  await mkdir(sprint8QaDir, { recursive: true });
  await page.screenshot({ path: join(sprint8QaDir, "chat-focus-390.png"), fullPage: false });
  page.off("request", recordNonReadRequest);
});

await test("Responsive: 1024 px y móvil 390 px", async () => {
  await page.setViewportSize({ width: 1024, height: 929 });
  await page.goto(`${baseUrl}/inventario`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Inventario" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/agenda`, { waitUntil: "networkidle" });
  const menu = page.getByRole("button", { name: "Abrir navegación" });
  await menu.waitFor();
  await menu.click();
  await page.getByRole("link", { name: "Inventario" }).waitFor();
  await page.screenshot({ path: join(screenshotDir, "agenda-mobile.png"), fullPage: false });
});

await test("Doctor: jornada, llegada y cierre clínico demo", async () => {
  const doctorDir = fileURLToPath(new URL("../docs/qa/sprint-6/screenshots/", import.meta.url));
  await mkdir(doctorDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/agenda`, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("admin");
  await page.getByRole("button", { name: "Nueva cita", exact: true }).click();
  await page.getByRole("combobox", { name: "Paciente o lead", exact: true }).selectOption({ label: "Ana Beltrán" });
  await page.getByRole("combobox", { name: "Servicio", exact: true }).selectOption("svc-evaluacion");
  await page.getByRole("combobox", { name: "Sede", exact: true }).last().selectOption("lince");
  await page.getByRole("combobox", { name: "Odontólogo", exact: true }).last().selectOption("valeria");
  await page.getByLabel("Fecha", { exact: true }).fill("2026-08-14");
  await page.getByLabel("Hora", { exact: true }).fill("13:00");
  await page.getByLabel("Precio acordado · S/", { exact: true }).fill("250");
  await page.getByRole("button", { name: "Crear cita", exact: true }).click();
  await page.getByText("Cita creada correctamente", { exact: true }).waitFor();
  await page.locator(".topbar-brand").click();
  await page.getByRole("combobox", { name: "Rol demo", exact: true }).selectOption("collaborator");
  await page.getByRole("heading", { name: "Mi día", exact: true }).waitFor();
  const currentAppointment = page.locator("[data-help-id]").filter({ hasText: "Ana Beltrán" }).filter({ hasText: "13:00" });
  await currentAppointment.waitFor();
  await currentAppointment.getByRole("button", { name: "Registrar llegada", exact: true }).click();
  await page.getByText("Llegada registrada", { exact: true }).waitFor();
  const doctorAgendaRows = page.locator("#agenda-clinica [data-help-id]");
  const focusRow = doctorAgendaRows.first();
  assert.match(await focusRow.getAttribute("data-help-label"), /^Ana Beltrán/);
  assert.match(await focusRow.innerText(), /Atención en curso/);
  assert.equal(await page.locator('#agenda-clinica [data-help-label="Ana Beltrán · Evaluación"]').count(), 1, "The active evaluation appears once, as the primary action");
  const rowLabels = await doctorAgendaRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-help-label") ?? ""));
  assert.ok(rowLabels.findIndex((label) => label.startsWith("José Molina")) > 0, "The next scheduled patient follows the active visit");
  const openRecord = currentAppointment.getByRole("link", { name: "Abrir registro", exact: true });
  await openRecord.waitFor();
  await page.screenshot({ path: join(doctorDir, "doctor-mi-dia-1440.png"), fullPage: false });
  await openRecord.click();
  await page.getByRole("heading", { name: "Ana Beltrán", exact: true }).waitFor();
  await page.getByLabel("Nota clínica", { exact: true }).fill("Validación demo, sin información clínica real.");
  await page.getByRole("button", { name: "Guardar evolución", exact: true }).click();
  await page.getByRole("status").getByText("Registro clínico actualizado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Completar servicio", exact: true }).click();
  await page.getByRole("heading", { name: "Servicio completado", exact: true }).waitFor();
  await page.screenshot({ path: join(doctorDir, "doctor-registro-1440.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector(".app-sidebar")?.getBoundingClientRect().right <= 0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recordDimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(recordDimensions.document <= recordDimensions.viewport, `Registro clínico 390px: overflow ${recordDimensions.document}/${recordDimensions.viewport}`);
  await page.screenshot({ path: join(doctorDir, "doctor-registro-390.png"), fullPage: false });
  await page.goto(`${baseUrl}/mi-dia`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Mi día", exact: true }).waitFor();
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport, `Doctor 390px: overflow ${dimensions.document}/${dimensions.viewport}`);
  await page.screenshot({ path: join(doctorDir, "doctor-mi-dia-390.png"), fullPage: false });

  const isolatedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await protectWrites(isolatedContext);
  await isolatedContext.addInitScript(() => window.localStorage.setItem("odontoflow-demo-role", "collaborator"));
  const emptyPage = await isolatedContext.newPage();
  emptyPage.setDefaultTimeout(8_000);
  await emptyPage.goto(`${baseUrl}/mi-dia?demo=empty`, { waitUntil: "networkidle" });
  await emptyPage.getByText("No hay citas en tu agenda", { exact: true }).waitFor();
  await emptyPage.screenshot({ path: join(doctorDir, "doctor-mi-dia-empty-390.png"), fullPage: false });
  await isolatedContext.close();
});

await browser.close();
if (nextServer && nextServer.exitCode === null) nextServer.kill("SIGTERM");
const failed = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({ results, pageErrors }, null, 2));
console.log(JSON.stringify({ blockedWriteRequests }, null, 2));
if (failed.length || pageErrors.length || blockedWriteRequests.length) process.exitCode = 1;
