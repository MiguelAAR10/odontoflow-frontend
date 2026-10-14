import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { PersonaProvider, usePersona } from "../src/components/PersonaContext";
import { ShellProvider } from "../src/components/shell/ShellContext";
import { agentController, useAgent } from "../src/agui/useAgent";

const model = vi.hoisted(() => ({ choose: vi.fn(), stop: vi.fn(), observed: [] as string[] }));
vi.mock("../src/components/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("../src/api", () => ({
  useMocks: false,
  toApiError: (error: Error) => ({ message: error.message }),
  loadPersonas: async () => ({ personas: [], current: "primera-persona", requiresCode: false }),
  loadIdentity: async () => ({ principalType: "human", displayName: "Persona real", organizationName: "Clínica", roles: [], permissions: [] }),
  choosePersona: (...args: unknown[]) => model.choose(...args),
}));
vi.mock("../src/agui/index", () => ({ getAgentSource: async () => ({ run: () => new Promise<void>(() => {}), stop: model.stop }) }));

function Session() {
  const agent = useAgent();
  const persona = usePersona();
  model.observed.push(JSON.stringify(agent.thread));
  return <div data-session>
    <p>{JSON.stringify(agent.thread)}</p>
    <button data-send onClick={() => { void agent.send("Consulta confidencial", { role: "admin", view: "home", viewing: "Inicio" }); }}>Preguntar</button>
    <button data-switch onClick={() => { void persona.switchTo("segunda-persona"); }}>Cambiar persona</button>
  </div>;
}
let view: ReactTestRenderer | undefined;
afterEach(() => { act(() => { view?.unmount(); }); agentController.reset(); });

it("PersonaGate desmonta el shell y la nueva persona nunca recibe el hilo anterior", async () => {
  agentController.reset();
  model.stop.mockClear(); model.observed.length = 0;
  let resolve!: (session: { personas: []; current: string }) => void;
  model.choose.mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(async () => { view = create(<PersonaProvider><ShellProvider><Session /></ShellProvider></PersonaProvider>); });
  await act(async () => { view!.root.findByProps({ "data-send": true }).props.onClick(); });
  expect(view!.root.findByType("p").children.join("")).toContain("Consulta confidencial");
  await act(async () => { view!.root.findByProps({ "data-switch": true }).props.onClick(); });
  expect(view!.root.findAllByProps({ "data-session": true })).toHaveLength(0);
  expect(view!.root.findByType("h1").children.join("")).toBe("Elige quién eres");
  const remount = model.observed.length;
  await act(async () => { resolve({ personas: [], current: "segunda-persona" }); });
  expect(view!.root.findAllByProps({ "data-session": true })).toHaveLength(1);
  expect(model.observed.slice(remount).every(thread => !thread.includes("Consulta confidencial"))).toBe(true);
  expect(model.stop).toHaveBeenCalledOnce();
});
