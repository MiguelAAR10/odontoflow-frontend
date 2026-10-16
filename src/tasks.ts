import { USE_MOCKS } from "./env";
import { ApiError, acknowledgeTask, completeTask, createTaskDelegation, listTaskAssignees, listTasks, type TaskComplete, type TaskDelegationCreate, type TaskOut, type TaskQuery } from "./contracts/client";
import type { StaffIdentity } from "./types";

export function canCompleteTask(identity: StaffIdentity | null, task: TaskOut): boolean {
  return identity?.principalType === "human" && identity.principalId !== undefined
    && (task.status === "open" || task.status === "escalated")
    && (identity.principalId === task.assignee_principal_id
      || (task.status === "escalated" && identity.principalId === task.escalation_principal_id));
}

/** Demo has no delegated task fixtures; it must not invent staff assignments. */
export async function loadTasks(query: TaskQuery = {}): Promise<TaskOut[]> {
  return USE_MOCKS ? [] : listTasks(query);
}
export async function finishTask(id: number, input: TaskComplete, key: string): Promise<TaskOut> {
  if (USE_MOCKS) throw new ApiError(404, "NOT_FOUND", "No hay tareas delegadas en esta demostración.");
  return completeTask(id, input, key);
}
export async function acceptTask(id: number, key: string): Promise<TaskOut> {
  if (USE_MOCKS) throw new ApiError(404, "NOT_FOUND", "No hay tareas delegadas en esta demostración.");
  return acknowledgeTask(id, key);
}
export async function loadTaskAssignees(locationId: number) {
  return USE_MOCKS ? [] : listTaskAssignees(locationId);
}
export async function proposeTaskDelegation(input: TaskDelegationCreate, key: string) {
  if (USE_MOCKS) throw new ApiError(422, "DEMO_UNAVAILABLE", "La delegación necesita responsables del catálogo real de la sede.");
  return createTaskDelegation(input, key);
}
