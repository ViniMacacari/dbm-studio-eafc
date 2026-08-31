import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { TeamEditorService } from "../team-editor.service";
import { CompObjDisplayService } from "./compobj-display.service";
import { ScheduleDateService } from "./schedule-date.service";

@Injectable({ providedIn: "root" })
export class ScheduleDisplayService {
  private readonly teamNameCache = new WeakMap<DbProject, Map<string, string>>();

  constructor(
    private readonly dates: ScheduleDateService,
    private readonly display: CompObjDisplayService,
    private readonly teams: TeamEditorService
  ) {}

  phaseName(phase: CompdataObject | undefined, project: CompdataProject, reference?: DbProject): string {
    return phase ? this.display.objectName(phase, reference, project) : "Unknown phase";
  }

  appliesTo(target: CompdataObject | undefined, phase: CompdataObject | undefined, project: CompdataProject, reference?: DbProject): string {
    if (!target) return "Unknown target";
    if (target.kind === 4) return "All groups";
    if (target.kind === 5) return this.display.objectName(target, reference, project);
    return "Unknown target";
  }

  matchesLabel(minGames: number, maxGames: number): string {
    if (minGames === maxGames) return `${minGames} ${minGames === 1 ? "match" : "matches"}`;
    return `${minGames}-${maxGames} matches`;
  }

  ruleSummary(phase: string, round: number, date: string, time: string, minGames: number, maxGames: number): string {
    const matches = minGames === maxGames ? `${minGames} ${minGames === 1 ? "match" : "matches"}` : `${minGames} to ${maxGames} matches`;
    return `${phase} - Round ${round} will play on ${this.dates.formatSeasonDateInput(date)} at ${this.dates.formatTimeHHMM(time)} with ${matches}.`;
  }

  fixtureSummary(homeTeamId: string, awayTeamId: string, date: string, time: string, reference?: DbProject): string {
    return `${this.teamName(homeTeamId, reference)} vs ${this.teamName(awayTeamId, reference)} - ${this.dates.formatSeasonDateInput(date)}, ${this.dates.formatTimeHHMM(time)}`;
  }

  teamName(teamId: string, reference?: DbProject): string {
    const id = teamId.trim();
    if (!id) return "Team ID";
    if (!reference) return `Team ID ${id}`;
    let cache = this.teamNameCache.get(reference);
    if (!cache) {
      cache = new Map<string, string>();
      this.teamNameCache.set(reference, cache);
    }
    const cached = cache.get(id);
    if (cached) return cached;
    const exact = this.teams.findTeams(reference, id, 5).find((team) => team.teamId === id);
    const name = exact?.displayName || `Team ID ${id}`;
    cache.set(id, name);
    return name;
  }
}
