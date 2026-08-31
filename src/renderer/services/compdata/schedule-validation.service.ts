import { Injectable } from "@angular/core";
import type { CompdataCompetitionSummary, CompdataProject, DbProject } from "../../../shared/types";
import { TeamEditorService } from "../team-editor.service";
import { CompObjTreeService } from "./compobj-tree.service";
import { ScheduleDateService } from "./schedule-date.service";
import { ScheduleService } from "./schedule.service";

export interface ScheduleValidationIssue {
  severity: "error" | "warning";
  message: string;
  technical?: string;
}

@Injectable({ providedIn: "root" })
export class ScheduleValidationService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly dates: ScheduleDateService,
    private readonly schedule: ScheduleService,
    private readonly teams: TeamEditorService
  ) {}

  validateTournament(project: CompdataProject, competition: CompdataCompetitionSummary, reference?: DbProject): ScheduleValidationIssue[] {
    return [
      ...this.validateMatchdayRules(project, competition),
      ...this.validateSpecificFixtures(project, competition, reference)
    ];
  }

  status(project: CompdataProject, competition: CompdataCompetitionSummary, reference?: DbProject): "OK" | "Warning" {
    const issues = this.validateTournament(project, competition, reference);
    return issues.length ? "Warning" : "OK";
  }

  private validateMatchdayRules(project: CompdataProject, competition: CompdataCompetitionSummary): ScheduleValidationIssue[] {
    const issues: ScheduleValidationIssue[] = [];
    const seen = new Set<string>();

    project.schedules.forEach((entry, index) => {
      const resolved = this.schedule.resolveTarget(project, entry.objectId);
      if (resolved.competitionId && resolved.competitionId !== competition.id) {
        return;
      }
      const key = [entry.objectId, entry.day, entry.round, entry.minGames, entry.maxGames, entry.time].join(",");
      if (seen.has(key)) {
        issues.push({ severity: "warning", message: "Duplicate matchday rule.", technical: key });
      }
      seen.add(key);

      if (!resolved.target) {
        issues.push({ severity: "error", message: "A matchday rule points to a missing phase or match slot.", technical: `schedule.txt line ${index + 1}: targetObjectId ${entry.objectId}` });
        return;
      }
      if (resolved.target.kind !== 4 && resolved.target.kind !== 5) {
        issues.push({ severity: "error", message: "A matchday rule points to an item that cannot host matches.", technical: `schedule.txt line ${index + 1}: object ${entry.objectId} type ${resolved.target.kind}` });
      }
      if (!Number.isInteger(entry.day) || entry.day < 0) {
        issues.push({ severity: "error", message: "A matchday rule has an invalid match date.", technical: `schedule.txt line ${index + 1}: dayOffset ${entry.day}` });
      }
      if (!Number.isInteger(entry.round) || entry.round < 1) {
        issues.push({ severity: "error", message: "A matchday rule has an invalid round.", technical: `schedule.txt line ${index + 1}: roundNumber ${entry.round}` });
      }
      if (!Number.isInteger(entry.minGames) || entry.minGames < 0) {
        issues.push({ severity: "error", message: "A matchday rule has an invalid minimum match count.", technical: `schedule.txt line ${index + 1}: minGames ${entry.minGames}` });
      }
      if (!Number.isInteger(entry.maxGames) || entry.maxGames < entry.minGames) {
        issues.push({ severity: "error", message: "A matchday rule has an invalid match count range.", technical: `schedule.txt line ${index + 1}: minGames ${entry.minGames}, maxGames ${entry.maxGames}` });
      }
      if (!this.dates.isValidHHMM(entry.time)) {
        issues.push({ severity: "error", message: "A matchday rule has an invalid kick-off time.", technical: `schedule.txt line ${index + 1}: time ${entry.time}` });
      }
    });

    return issues;
  }

  private validateSpecificFixtures(project: CompdataProject, competition: CompdataCompetitionSummary, reference?: DbProject): ScheduleValidationIssue[] {
    const issues: ScheduleValidationIssue[] = [];
    const stages = this.tree.phases(project, competition.id);
    const stageCodes = new Set(stages.map((stage) => stage.shortName.toLowerCase()));
    const teamIds = this.teamIds(reference);
    const seen = new Set<string>();

    for (const file of project.specificSchedules ?? []) {
      if (file.competitionCode.toLowerCase() !== competition.shortName.toLowerCase()) continue;
      if (!stageCodes.has(file.stageCode.toLowerCase())) {
        issues.push({ severity: "error", message: "A fixture file points to a phase that does not exist in this tournament.", technical: `schedules/${file.fileName}` });
      }
      file.fixtures.forEach((fixture, index) => {
        const key = `${file.fileName}:${fixture.date},${fixture.time},${fixture.homeTeamId},${fixture.awayTeamId}`;
        if (seen.has(key)) {
          issues.push({ severity: "warning", message: "Duplicate fixture.", technical: `schedules/${file.fileName} line ${index + 1}` });
        }
        seen.add(key);
        if (!this.dates.specificDateToInput(fixture.date)) {
          issues.push({ severity: "error", message: "A fixture has an invalid date.", technical: `schedules/${file.fileName} line ${index + 1}: date ${fixture.date}` });
        }
        if (!this.dates.isValidHHMM(fixture.time)) {
          issues.push({ severity: "error", message: "A fixture has an invalid kick-off time.", technical: `schedules/${file.fileName} line ${index + 1}: time ${fixture.time}` });
        }
        if (fixture.homeTeamId === fixture.awayTeamId) {
          issues.push({ severity: "error", message: "A fixture has the same home and away team.", technical: `schedules/${file.fileName} line ${index + 1}` });
        }
        if (teamIds && !teamIds.has(fixture.homeTeamId)) {
          issues.push({ severity: "warning", message: "A fixture home team was not found in the loaded database.", technical: `schedules/${file.fileName} line ${index + 1}: homeTeamId ${fixture.homeTeamId}` });
        }
        if (teamIds && !teamIds.has(fixture.awayTeamId)) {
          issues.push({ severity: "warning", message: "A fixture away team was not found in the loaded database.", technical: `schedules/${file.fileName} line ${index + 1}: awayTeamId ${fixture.awayTeamId}` });
        }
      });
    }

    return issues;
  }

  private teamIds(reference?: DbProject): Set<string> | undefined {
    const teamsTable = this.teams.findTeamsTable(reference);
    if (!teamsTable) return undefined;
    const teamIdColumn = teamsTable.columns.findIndex((column) => column.toLowerCase() === "teamid");
    if (teamIdColumn < 0) return undefined;
    return new Set(teamsTable.rows.map((row) => row[teamIdColumn]).filter(Boolean));
  }
}
