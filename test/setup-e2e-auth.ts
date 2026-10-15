/**
 * Integration-suite only (registered in vitest.e2e.config.ts). The Node suite
 * talks to the backend directly (NEXT_PUBLIC_BACKEND_URL), bypassing the BFF,
 * so it attaches the demo bearer itself when the test process has one. Axios
 * instances copy `axios.defaults` at creation, so this must run before
 * `src/contracts/client` is imported — setup files do. Browser runtime code
 * under `src/` never reads this variable.
 */
import axios from "axios";
import { readFileSync } from "node:fs";

const config = process.env.AIRI_E2E_CONFIG;
const token = config ? (JSON.parse(readFileSync(config, "utf8")) as { token: string }).token : process.env.BACKEND_DEMO_TOKEN;
if (token) {
  axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  // Raw fetch journeys use the same temporary identity as Axios adapters.
  process.env.BACKEND_DEMO_TOKEN = token;
}
