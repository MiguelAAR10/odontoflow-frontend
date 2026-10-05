"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useDemoRole } from "../roles";
import { useMocks } from "./transport";
import { apiRepository, mockRepository, repository, type OdontoCommand, type OdontoSnapshot, type CommandResult, type OdontoRepository } from "./repository";

const RepositoryContext = createContext<OdontoRepository | null>(null);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [role, , ready] = useDemoRole();
  useEffect(() => {
    void repository.hydrate();
    if (!useMocks) return;
    const scenario = new URLSearchParams(window.location.search).get("demo");
    if (scenario === "empty" || scenario === "loading" || scenario === "error") mockRepository.setScenario(scenario);
  }, []);
  useEffect(() => { if (ready) repository.setActor(role); }, [role, ready]);
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useOdontoRepository(): { snapshot: OdontoSnapshot; dispatch: (command: OdontoCommand) => Promise<CommandResult>; resetDemo: () => void; repository: OdontoRepository } {
  const current = useContext(RepositoryContext);
  if (!current) throw new Error("useOdontoRepository debe vivir dentro de RepositoryProvider");
  const snapshot = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getServerSnapshot);
  return { snapshot, dispatch: current.dispatch.bind(current), resetDemo: current.resetDemo.bind(current), repository: current };
}

export { apiRepository, mockRepository };
