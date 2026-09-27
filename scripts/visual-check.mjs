import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const screenshotDir = resolve(process.env.VISUAL_SCREENSHOT_DIR ?? join(repoRoot, "screenshots"));
const externalServer = Boolean(process.env.VISUAL_BASE_URL);
const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5189";
const nextBin = join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const appEnv = { ...process.env, NEXT_PUBLIC_USE_MOCKS: "true" };
const routes = [
  ["agenda", "Agenda de citas"],
  ["pacientes", "Pacientes"],
  ["caja", "Cobros"],
  ["inventario", "Gestión de inventario"],
  ["agente", "Agente IA"],
  ["chat", "Centro de conversaciones"],
  ["configuracion", "Configuración"],
];

async function firstExisting(paths) {
  for (const path of paths.filter(Boolean)) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next browser installation.
    }
  }
  throw new Error("No se encontró Chromium/Chrome/Edge. Define VISUAL_BROWSER_PATH.");
}

async function browserExecutable() {
  return firstExisting([
    process.env.VISUAL_BROWSER_PATH,
    chromium.executablePath(),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ]);
}

async function build() {
  await new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [nextBin, "build"], { cwd: repoRoot, env: appEnv, stdio: "inherit" });
    child.once("error", rejectBuild);
    child.once("exit", (code) => code === 0 ? resolveBuild() : rejectBuild(new Error(`next build terminó con código ${code}`)));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/agenda`)).ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
  }
  throw new Error(`El frontend no respondió en ${baseUrl}`);
}

await mkdir(screenshotDir, { recursive: true });
let server;
let browser;

try {
  if (!externalServer) {
    await build();
    server = spawn(process.execPath, [nextBin, "start", "-p", "5189", "-H", "127.0.0.1"], {
      cwd: repoRoot,
      env: appEnv,
      stdio: "inherit",
    });
    await waitForServer();
  }

  browser = await chromium.launch({ headless: true, executablePath: await browserExecutable() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const [route, heading] of routes) {
    const response = await page.goto(`${baseUrl}/${route}`, { waitUntil: "networkidle" });
    assert.ok(response?.ok(), `/${route}: respuesta HTTP inválida`);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.ok((await page.locator("body").innerText()).trim().length > 100, `/${route}: página vacía`);
    assert.equal(await page.locator("[data-nextjs-dialog], .vite-error-overlay").count(), 0, `/${route}: error visual`);
    await page.screenshot({ path: join(screenshotDir, `${route}.png`) });
    console.log(`OK /${route}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/agenda`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await page.getByRole("link", { name: "Configuración" }).waitFor();
  await page.screenshot({ path: join(screenshotDir, "agenda-mobile.png") });

  assert.deepEqual(errors, [], `Errores del navegador: ${errors.join(" | ")}`);
  console.log(`Capturas actuales: ${screenshotDir}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) server.kill("SIGTERM");
}
