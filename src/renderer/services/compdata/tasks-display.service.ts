import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, CompdataTask, DbProject } from "../../../shared/types";
import { LeagueEditorService } from "../league-editor.service";
import { TeamEditorService } from "../team-editor.service";
import { nations } from "../../../utils/get-nations/get-nations";
import { CompObjDisplayService } from "./compobj-display.service";
import { CompObjTreeService } from "./compobj-tree.service";

@Injectable({ providedIn: "root" })
export class TasksDisplayService {
  constructor(
    private readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly teams: TeamEditorService,
    private readonly leagues: LeagueEditorService
  ) {}

  actionLabel(task: CompdataTask): string {
    return ({
      FillWithTeam: "Add specific club",
      FillFromSpecialTeams: "Add special teams",
      FillFromSpecialTeamsWithNation: "Add special teams from a nation",
      FillFromLeague: "Add clubs from a league",
      FillFromLeagueMaxFromCountry: "Add top clubs from a league with country limit",
      FillFromTopCoefficientCountry: "Take teams by country coefficient rank",
      FillFromCompTable: "Add qualified teams from another tournament",
      FillFromCompTableBackupLeague: "Add qualified team with league backup",
      FillFromCompTableBackup: "Add qualified team with tournament backup",
      ClearLeagueStats: "Clear previous league stats",
      UpdateTable: "Update previous-season table",
      UpdateLeagueTable: "Update league table",
      UpdateLeagueStats: "Update league stats after season"
    } as Record<string, string>)[task.action] ?? "Advanced automation rule";
  }

  targetLabel(project: CompdataProject, targetId: number, reference?: DbProject): string {
    const target = this.tree.object(project, targetId);
    if (!target) return "Missing group or stage";
    if (target.kind === 5) {
      const phase = this.tree.object(project, target.parentId);
      const phaseName = this.display.objectName(phase, reference, project);
      return `${phaseName} / ${this.display.objectName(target, reference, project)}`;
    }
    return this.display.objectName(target, reference, project);
  }

  sourceSummary(project: CompdataProject, task: CompdataTask, reference?: DbProject): string {
    switch (task.action) {
      case "FillWithTeam":
        return `Club: ${this.teamName(task.param2, reference)}`;
      case "FillFromSpecialTeams":
        return `Special teams: ${task.param1}`;
      case "FillFromSpecialTeamsWithNation":
        return `Special teams: ${task.param1} · Nation: ${this.nationName(task.param2)}`;
      case "FillFromLeague":
        return `League: ${this.leagueName(task.param1, reference)}`;
      case "FillFromLeagueMaxFromCountry":
        return `League: ${this.leagueName(task.param1, reference)} · Clubs: ${task.param2} · Max from same country: ${task.param3}`;
      case "FillFromTopCoefficientCountry":
        return `Country coefficient rank: ${task.param1} · Teams: ${task.param2} · Allocation slot: ${task.param3}`;
      case "FillFromCompTable":
        return `Source tournament: ${this.competitionName(project, task.param1, reference)} · Teams: ${task.param2}`;
      case "FillFromCompTableBackupLeague":
        return `Source: ${this.competitionName(project, task.param1, reference)} · Backup league: ${this.leagueName(task.param2, reference)} · Teams: ${task.param3}`;
      case "FillFromCompTableBackup":
        return `Source: ${this.competitionName(project, task.param1, reference)} · Backup tournament: ${this.competitionName(project, task.param2, reference)} · Teams: ${task.param3}`;
      case "UpdateTable":
        return `Take ${this.ordinal(Number(task.param2))} team from ${this.targetLabel(project, Number(task.param1), reference)} and replace table position ${task.param3}.`;
      case "UpdateLeagueTable":
        return `League: ${this.leagueName(task.param1, reference)} · Phase: ${this.targetLabel(project, task.targetId, reference)}`;
      case "ClearLeagueStats":
        return `Clear stats for ${this.leagueName(task.param1, reference)}`;
      case "UpdateLeagueStats":
        return `League: ${this.leagueName(task.param1, reference)} · Phase: ${this.targetLabel(project, task.targetId, reference)}`;
      default:
        return "This rule type is preserved and can be reviewed in Advanced View.";
    }
  }

  friendlySentence(project: CompdataProject, task: CompdataTask, reference?: DbProject): string {
    const target = this.targetLabel(project, task.targetId, reference);
    switch (task.action) {
      case "FillWithTeam":
        return `At tournament start, add ${this.teamName(task.param2, reference)} to ${target}.`;
      case "FillFromSpecialTeams":
        return `At tournament start, add ${task.param1} special team(s) to ${target}.`;
      case "FillFromSpecialTeamsWithNation":
        return `At tournament start, add ${task.param1} special team(s) from ${this.nationName(task.param2)} to ${target}.`;
      case "FillFromLeague":
        return `At tournament start, clubs from ${this.leagueName(task.param1, reference)} will be added to ${target}.`;
      case "FillFromLeagueMaxFromCountry":
        return `At tournament start, add ${task.param2} club(s) from ${this.leagueName(task.param1, reference)} to ${target}, with up to ${task.param3} from the same country.`;
      case "FillFromTopCoefficientCountry":
        return `At tournament start, take teams from country coefficient rank ${task.param1} and put them into ${target}.`;
      case "FillFromCompTable":
        return `At tournament start, add ${task.param2} qualified team(s) from ${this.competitionName(project, task.param1, reference)} to ${target}.`;
      case "FillFromCompTableBackupLeague":
        return `At tournament start, add ${task.param3} qualified team(s) from ${this.competitionName(project, task.param1, reference)} to ${target}; use ${this.leagueName(task.param2, reference)} as backup if needed.`;
      case "FillFromCompTableBackup":
        return `At tournament start, add ${task.param3} qualified team(s) from ${this.competitionName(project, task.param1, reference)} to ${target}; use ${this.competitionName(project, task.param2, reference)} as backup if needed.`;
      case "UpdateTable":
        return `At season end, take the ${this.ordinal(Number(task.param2))} team from ${this.targetLabel(project, Number(task.param1), reference)} and put it into position ${task.param3} of next season's table.`;
      case "UpdateLeagueTable":
        return `At season end, update ${this.leagueName(task.param1, reference)} table using ${target} results.`;
      case "ClearLeagueStats":
        return `At tournament start, clear previous stats for ${this.leagueName(task.param1, reference)}.`;
      case "UpdateLeagueStats":
        return `At season end, update ${this.leagueName(task.param1, reference)} stats using ${target} results.`;
      default:
        return "Advanced automation rule preserved from tasks.txt.";
    }
  }

  teamName(teamId: string, reference?: DbProject): string {
    const id = String(teamId ?? "").trim();
    if (!id) return "No club selected";
    const exact = this.teams.findTeams(reference, id, 5).find((team) => team.teamId === id);
    return exact?.displayName ?? `Team ID ${id}`;
  }

  leagueName(leagueId: string, reference?: DbProject): string {
    const id = String(leagueId ?? "").trim();
    if (!id) return "No league selected";
    const exact = this.leagues.findLeagues(reference, id, "", 8).find((league) => league.leagueId === id);
    return exact?.displayName ?? `League ID ${id}`;
  }

  competitionName(project: CompdataProject, competitionId: string | number, reference?: DbProject): string {
    const id = Number(competitionId);
    const competition = this.tree.object(project, id);
    if (!competition) return `Tournament ${competitionId}`;
    return this.display.objectName(competition, reference, project);
  }

  nationName(nationId: string | number): string {
    const id = Number(nationId);
    const nation = id ? nations.find((candidate) => candidate.id === id) : undefined;
    return nation?.name ?? `Nation ID ${nationId}`;
  }

  ordinal(position: number): string {
    if (!Number.isInteger(position) || position <= 0) return "selected";
    const mod100 = position % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
    const suffix = position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
    return `${position}${suffix}`;
  }

  groupOptions(project: CompdataProject, competitionId: number, reference?: DbProject): Array<{ value: string; label: string; detail: string; searchText: string }> {
    const phases = this.tree.phases(project, competitionId);
    return phases.flatMap((phase) => this.tree.groups(project, phase.id).map((group) => ({
      value: String(group.id),
      label: this.targetLabel(project, group.id, reference),
      detail: "Target group / match slot",
      searchText: `${phase.shortName} ${group.shortName} ${this.targetLabel(project, group.id, reference)}`
    })));
  }

  stageOptions(project: CompdataProject, competitionId: number, reference?: DbProject): Array<{ value: string; label: string; detail: string; searchText: string }> {
    return this.tree.phases(project, competitionId).map((phase) => ({
      value: String(phase.id),
      label: this.display.objectName(phase, reference, project),
      detail: "League phase / stage",
      searchText: `${phase.shortName} ${this.display.objectName(phase, reference, project)}`
    }));
  }

  competitionOptions(project: CompdataProject, currentCompetitionId: number, reference?: DbProject): Array<{ value: string; label: string; detail: string; searchText: string }> {
    return project.competitions
      .filter((competition) => competition.id !== currentCompetitionId)
      .map((competition) => {
        const object = this.tree.object(project, competition.id);
        const label = this.display.objectName(object, reference, project);
        return { value: String(competition.id), label, detail: "Tournament", searchText: `${label} ${competition.shortName} ${competition.id}` };
      });
  }

  private objectLabel(object: CompdataObject | undefined, project: CompdataProject, reference?: DbProject): string {
    return this.display.objectName(object, reference, project);
  }

}
