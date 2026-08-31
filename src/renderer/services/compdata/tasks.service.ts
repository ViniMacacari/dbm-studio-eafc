import { Injectable } from "@angular/core";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, CompdataTask } from "../../../shared/types";
import { CompObjTreeService } from "./compobj-tree.service";

export type TaskTiming = "start" | "end";
export type KnownTaskAction =
  | "FillWithTeam"
  | "FillFromSpecialTeams"
  | "FillFromSpecialTeamsWithNation"
  | "FillFromLeague"
  | "FillFromLeagueMaxFromCountry"
  | "FillFromTopCoefficientCountry"
  | "FillFromCompTable"
  | "FillFromCompTableBackupLeague"
  | "FillFromCompTableBackup"
  | "ClearLeagueStats"
  | "UpdateTable"
  | "UpdateLeagueTable"
  | "UpdateLeagueStats";

export const START_TASK_ACTIONS: KnownTaskAction[] = [
  "FillWithTeam",
  "FillFromSpecialTeams",
  "FillFromSpecialTeamsWithNation",
  "FillFromLeague",
  "FillFromLeagueMaxFromCountry",
  "FillFromTopCoefficientCountry",
  "FillFromCompTable",
  "FillFromCompTableBackupLeague",
  "FillFromCompTableBackup",
  "ClearLeagueStats"
];

export const END_TASK_ACTIONS: KnownTaskAction[] = ["UpdateTable", "UpdateLeagueTable", "UpdateLeagueStats"];
export const KNOWN_TASK_ACTIONS: KnownTaskAction[] = [...START_TASK_ACTIONS, ...END_TASK_ACTIONS];

export interface TeamSourceTaskRow {
  globalIndex: number;
  task: CompdataTask;
  target?: CompdataObject;
  phase?: CompdataObject;
  group?: CompdataObject;
  known: boolean;
}

export interface TeamSourceTaskDraft {
  timing: TaskTiming;
  action: KnownTaskAction;
  targetId: number;
  param1: string;
  param2: string;
  param3: string;
}

@Injectable({ providedIn: "root" })
export class TasksService {
  constructor(private readonly tree: CompObjTreeService) {}

  listTournamentTasks(project: CompdataProject, competition: CompdataCompetitionSummary): TeamSourceTaskRow[] {
    return (project.tasks ?? [])
      .map((task, globalIndex) => ({ task, globalIndex, ...this.resolveTarget(project, task), known: this.isKnownTask(task.action) }))
      .filter((row) => row.task.competitionId === competition.id);
  }

  listStartRules(project: CompdataProject, competition: CompdataCompetitionSummary): TeamSourceTaskRow[] {
    return this.listTournamentTasks(project, competition).filter((row) => row.task.timing.toLowerCase() === "start");
  }

  listEndRules(project: CompdataProject, competition: CompdataCompetitionSummary): TeamSourceTaskRow[] {
    return this.listTournamentTasks(project, competition).filter((row) => row.task.timing.toLowerCase() === "end");
  }

  addTask(project: CompdataProject, competitionId: number, draft: TeamSourceTaskDraft): void {
    const task = this.taskFromDraft(competitionId, draft);
    const lastIndex = (project.tasks ?? []).reduce((last, candidate, index) => candidate.competitionId === competitionId ? index : last, -1);
    if (lastIndex >= 0) {
      project.tasks.splice(lastIndex + 1, 0, task);
    } else {
      project.tasks.push(task);
    }
  }

  updateTask(project: CompdataProject, globalIndex: number, competitionId: number, draft: TeamSourceTaskDraft): void {
    if (!project.tasks[globalIndex]) return;
    project.tasks[globalIndex] = {
      ...this.taskFromDraft(competitionId, draft),
      originalRawLine: project.tasks[globalIndex].originalRawLine
    };
  }

  removeTask(project: CompdataProject, globalIndex: number): void {
    project.tasks.splice(globalIndex, 1);
  }

  duplicateTask(project: CompdataProject, row: TeamSourceTaskRow): void {
    const copy = { ...row.task, originalRawLine: undefined };
    project.tasks.splice(row.globalIndex + 1, 0, copy);
  }

  moveTask(project: CompdataProject, globalIndex: number, direction: -1 | 1): void {
    const targetIndex = globalIndex + direction;
    if (targetIndex < 0 || targetIndex >= project.tasks.length) return;
    [project.tasks[globalIndex], project.tasks[targetIndex]] = [project.tasks[targetIndex], project.tasks[globalIndex]];
  }

  nextFillWithTeamOrder(project: CompdataProject, competitionId: number, targetGroupId: number): number {
    const used = (project.tasks ?? [])
      .filter((task) =>
        task.competitionId === competitionId
        && task.timing.toLowerCase() === "start"
        && task.action === "FillWithTeam"
        && task.targetId === targetGroupId
      )
      .map((task) => Number(task.param1))
      .filter((value) => Number.isInteger(value) && value > 0);
    return Math.max(0, ...used) + 1;
  }

  rawLine(task: CompdataTask): string {
    return [task.competitionId, task.timing, task.action, task.targetId, task.param1, task.param2, task.param3].join(",");
  }

  taskFromDraft(competitionId: number, draft: TeamSourceTaskDraft): CompdataTask {
    return {
      competitionId,
      timing: draft.timing,
      action: draft.action,
      targetId: Number(draft.targetId),
      param1: String(draft.param1 ?? "0"),
      param2: String(draft.param2 ?? "0"),
      param3: String(draft.param3 ?? "0")
    };
  }

  isKnownTask(action: string): action is KnownTaskAction {
    return KNOWN_TASK_ACTIONS.includes(action as KnownTaskAction);
  }

  private resolveTarget(project: CompdataProject, task: CompdataTask): { target?: CompdataObject; phase?: CompdataObject; group?: CompdataObject } {
    const target = this.tree.object(project, task.targetId);
    if (!target) return {};
    if (target.kind === 5) {
      const phase = this.tree.object(project, target.parentId);
      return { target, phase: phase?.kind === 4 ? phase : undefined, group: target };
    }
    if (target.kind === 4) {
      return { target, phase: target };
    }
    return { target };
  }
}
