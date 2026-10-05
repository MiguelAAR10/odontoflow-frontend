import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const outDir = fileURLToPath(new URL("../.audit/passed-refs/", import.meta.url));
await mkdir(outDir, { recursive: true });

const chromeCandidates = [
  process.env.VISUAL_BROWSER_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  chromium.executablePath(),
].filter(Boolean);

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("No Chrome/Chromium found. Set VISUAL_BROWSER_PATH.");
}

const executablePath = await findChrome();
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "es-PE",
});
const page = await context.newPage();

const report = [];

async function capture(name, url, waitMs = 4000) {
  const entry = { name, url, status: "unknown", title: "", text: "", screenshot: "" };
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    entry.http = response?.status() ?? null;
    await page.waitForTimeout(waitMs);
    entry.title = await page.title();
    entry.text = (await page.locator("body").innerText()).slice(0, 2500);
    const file = `${name}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: false });
    entry.screenshot = file;
    const blocked = /accede a tu cuenta|sign in|iniciar sesi[oó]n/i.test(`${entry.title}\n${entry.text}`);
    entry.status = blocked ? "blocked_login" : "ok";
  } catch (error) {
    entry.status = "failed";
    entry.error = error instanceof Error ? error.message : String(error);
  }
  report.push(entry);
  console.log(JSON.stringify({ name: entry.name, status: entry.status, title: entry.title, http: entry.http }));
}

await capture("01-stitch", "https://stitch.withgoogle.com/projects/17269846140884745911", 6000);
await capture(
  "02-tldraw",
  "https://www.tldraw.com/f/wcWOOEUrfsKVLqIUaSqSF?d=v761.5880.4509.4354.page",
  12000,
);
await capture("03-copilotkit-github", "https://github.com/CopilotKit/CopilotKit", 5000);
await capture("04-copilotkit-docs", "https://www.copilotkit.ai/", 5000);
await capture("05-local-home", "http://127.0.0.1:5173/", 3000);
await capture("06-local-agenda", "http://127.0.0.1:5173/agenda", 3000);
await capture("07-local-chat", "http://127.0.0.1:5173/chat", 3000);
await capture("08-local-agente", "http://127.0.0.1:5173/agente", 3000);

await browser.close();
await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`wrote ${join(outDir, "report.json")}`);
