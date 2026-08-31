import { Injectable } from "@angular/core";
import type { CompdataCompetitionSummary, CompdataProject, CompdataTask, DbProject } from "../../../shared/types";
import { LeagueEditorService } from "../league-editor.service";
import { TeamEditorService } from "../team-editor.service";
import { CompObjTreeService } from "./compobj-tree.service";
import { END_TASK_ACTIONS, KNOWN_TASK_ACTIONS, START_TASK_ACTIONS } from "./tasks.service";

export interface TaskValidationIssue {
  severity: "error" | "warning";
  message: string;
  technical?: string;
  task?: CompdataTask;
}

@Injectable({ providedIn: "root" })
export class TasksValidationService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly teams: TeamEditorService,
    private readonly leagues: LeagueEditorService
  ) {}

  validateTournament(project: CompdataProject, competition: CompdataCompetitionSummary, reference?: DbProject): TaskValidationIssue[] {
    const tasks = (project.tasks ?? []).filter((task) => task.competitionId === competition.id);
    const issues = tasks.flatMap((task) => this.validateTask(project, competition, task, reference));
    issues.push(...this.validateDuplicateFillOrders(tasks));
    for (const invalid of project.taskInvalidLines ?? []) {
      issues.push({
        severity: "warning",
        message: "tasks.txt has a line that DBM Studio cannot edit visually.",
        technical: `line ${invalid.lineNumber}: ${invalid.reason}`
      });
    }
    return issues;
  }

  validateTask(project: CompdataProject, competition: CompdataCompetitionSummary, task: CompdataTask, reference?: DbProject): TaskValidationIssue[] {
    const issues: TaskValidationIssue[] = [];
    const competitionObject = this.tree.object(project, task.competitionId);
    if (!competitionObject) {
      issues.push({ severity: "error", message: "This rule belongs to a tournament that no longer exists.", technical: `competitionObjectId ${task.competitionId}`, task });
    }

    const timing = task.timing.toLowerCase();
    if (timing !== "start" && timing !== "end") {
      issues.push({ severity: "error", message: "This rule must run at tournament start or season end.", technical: `trigger ${task.timing}`, task });
    }

    if (!KNOWN_TASK_ACTIONS.includes(task.action as any)) {
      issues.push({ severity: "warning", message: "This rule type is not supported in Simple View.", technical: `taskType ${task.action}`, task });
      return issues;
    }

    if (timing === "start" && !START_TASK_ACTIONS.includes(task.action as any)) {
      issues.push({ severity: "warning", message: "This season update rule is marked as a tournament start rule.", technical: `${task.timing},${task.action}`, task });
    }
    if (timing === "end" && !END_TASK_ACTIONS.includes(task.action as any)) {
      issues.push({ severity: "warning", message: "This team source rule is marked as a season end rule.", technical: `${task.timing},${task.action}`, task });
    }

    if (START_TASK_ACTIONS.includes(task.action as any)) {
      this.validateTargetGroup(project, task, issues);
    }
    if (task.action === "UpdateLeagueTable") {
      this.validateTargetStage(project, task, issues);
    }
    if (task.action === "UpdateTable") {
      this.validateSourceGroup(project, task, issues);
      this.validatePositiveNumber(task.param2, "Source position", task, issues);
      this.validatePositiveNumber(task.param3, "Table position", task, issues);
    }

    if (task.action === "FillWithTeam") {
      this.validatePositiveNumber(task.param1, "Club order", task, issues);
      this.validateTeam(task.param2, task, reference, issues);
    }
    if (task.action === "FillFromSpecialTeams" || task.action === "FillFromSpecialTeamsWithNation") {
      this.validatePositiveNumber(task.param1, "Number of special teams", task, issues);
    }
    if (task.action === "FillFromSpecialTeamsWithNation") {
      this.validatePositiveNumber(task.param2, "Nation", task, issues);
    }
    if (task.action === "FillFromLeague" || task.action === "FillFromLeagueMaxFromCountry" || task.action === "FillFromCompTableBackupLeague" || task.action === "UpdateLeagueTable") {
      const leagueId = task.action === "FillFromCompTableBackupLeague" ? task.param2 : task.param1;
      this.validateLeague(leagueId, task, reference, issues);
    }
    if (task.action === "FillFromLeagueMaxFromCountry") {
      this.validatePositiveNumber(task.param2, "Number of clubs", task, issues);
      this.validatePositiveNumber(task.param3, "Max clubs from same country", task, issues);
    }
    if (task.action === "FillFromTopCoefficientCountry") {
      this.validatePositiveNumber(task.param1, "Country coefficient rank", task, issues);
      this.validatePositiveNumber(task.param2, "Number of teams", task, issues);
      this.validatePositiveNumber(task.param3, "Allocation slot", task, issues);
    }
    if (task.action === "FillFromCompTable" || task.action === "FillFromCompTableBackupLeague" || task.action === "FillFromCompTableBackup") {
      this.validateSourceCompetition(project, task.param1, task, issues);
      const count = task.action === "FillFromCompTable" ? task.param2 : task.param3;
      this.validatePositiveNumber(count, "Number of teams", task, issues);
    }
    if (task.action === "FillFromCompTableBackup") {
      this.validateSourceCompetition(project, task.param2, task, issues);
    }
    if (task.action === "ClearLeagueStats" || task.action === "UpdateLeagueStats") {
      this.validateLeague(task.param1, task, reference, issues);
    }

    return issues;
  }

  private validateTargetGroup(project: CompdataProject, task: CompdataTask, issues: TaskValidationIssue[]): void {
    const target = this.tree.object(project, task.targetId);
    if (!target) {
      issues.push({ severity: "error", message: "This rule sends teams to a group/slot that no longer exists.", technical: `target ${task.targetId}`, task });
    } else if (target.kind !== 5) {
      issues.push({ severity: "warning", message: "This team source rule should send teams to a group or match slot.", technical: `target type ${target.kind}`, task });
    }
  }

  private validateTargetStage(project: CompdataProject, task: CompdataTask, issues: TaskValidationIssue[]): void {
    const target = this.tree.object(project, task.targetId);
    if (!target) {
      issues.push({ severity: "error", message: "This rule uses a league phase that no longer exists.", technical: `target ${task.targetId}`, task });
    } else if (target.kind !== 4) {
      issues.push({ severity: "warning", message: "This league table update should point to a league phase.", technical: `target type ${target.kind}`, task });
    }
  }

  private validateSourceGroup(project: CompdataProject, task: CompdataTask, issues: TaskValidationIssue[]): void {
    const source = this.tree.object(project, Number(task.param1));
    if (!source) {
      issues.push({ severity: "error", message: "This rule takes a result from a group/slot that no longer exists.", technical: `source ${task.param1}`, task });
    } else if (source.kind !== 5) {
      issues.push({ severity: "warning", message: "This previous-season table update should take a team from a group or match slot.", technical: `source type ${source.kind}`, task });
    }
  }

  private validateSourceCompetition(project: CompdataProject, value: string, task: CompdataTask, issues: TaskValidationIssue[]): void {
    const source = this.tree.object(project, Number(value));
    if (!source) {
      issues.push({ severity: "error", message: "This rule uses a source tournament that no longer exists.", technical: `source ${value}`, task });
    } else if (source.kind !== 3 && source.kind !== 6) {
      issues.push({ severity: "warning", message: "This source should be another tournament.", technical: `source type ${source.kind}`, task });
    }
  }

  private validateTeam(teamId: string, task: CompdataTask, reference: DbProject | undefined, issues: TaskValidationIssue[]): void {
    if (!this.isPositiveInteger(teamId)) {
      issues.push({ severity: "error", message: "This rule needs a valid club.", technical: `team ${teamId}`, task });
      return;
    }
    if (reference && this.teams.findTeamsTable(reference)) {
      const exact = this.teams.findTeams(reference, teamId, 5).some((team) => team.teamId === teamId);
      if (!exact) {
        issues.push({ severity: "warning", message: "This rule uses a club that was not found in the loaded database.", technical: `team ${teamId}`, task });
      }
    }
  }

  private validateLeague(leagueId: string, task: CompdataTask, reference: DbProject | undefined, issues: TaskValidationIssue[]): void {
    if (!this.isPositiveInteger(leagueId)) {
      issues.push({ severity: "error", message: "This rule needs a valid league.", technical: `league ${leagueId}`, task });
      return;
    }
    if (reference && this.leagues.findLeaguesTable(reference)) {
      const exact = this.leagues.findLeagues(reference, leagueId, "", 8).some((league) => league.leagueId === leagueId);
      if (!exact) {
        issues.push({ severity: "warning", message: "This rule uses a league that was not found in the loaded database.", technical: `league ${leagueId}`, task });
      }
    }
  }

  private validatePositiveNumber(value: string, label: string, task: CompdataTask, issues: TaskValidationIssue[]): void {
    if (!this.isPositiveInteger(value)) {
      issues.push({ severity: "error", message: `${label} must be a positive number.`, technical: `${label}: ${value}`, task });
    }
  }

  private validateDuplicateFillOrders(tasks: CompdataTask[]): TaskValidationIssue[] {
    const issues: TaskValidationIssue[] = [];
    const seen = new Set<string>();
    for (const task of tasks) {
      if (task.action !== "FillWithTeam") continue;
      const key = `${task.competitionId}:${task.targetId}:${task.param1}`;
      if (seen.has(key)) {
        issues.push({ severity: "warning", message: "Two specific club rules use the same order for the same target.", technical: key, task });
      }
      seen.add(key);
    }
    return issues;
  }

  private isPositiveInteger(value: string): boolean {
    return /^\d+$/.test(String(value).trim()) && Number(value) > 0;
  }
}
