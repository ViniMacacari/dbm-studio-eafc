import { Injectable } from "@angular/core";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, CompdataSetting, CompdataTask, DbProject } from "../../../shared/types";
import { nations } from "../../../utils/get-nations/get-nations";
import { CompObjDisplayService } from "./compobj-display.service";
import { CompObjTreeService } from "./compobj-tree.service";
import { SettingsService } from "./settings.service";
import { TasksDisplayService } from "./tasks-display.service";
import { TasksService, TeamSourceTaskRow } from "./tasks.service";

export type ContinentalRegion = "UEFA" | "CONMEBOL" | "OTHER";
export type QualificationKind =
  | "champion"
  | "ucl"
  | "uel"
  | "uecl"
  | "uclQual"
  | "uelQual"
  | "ueclQual"
  | "libertadores"
  | "libertadoresQual"
  | "sudamericana"
  | "none";

export interface QualificationOption {
  kind: QualificationKind;
  label: string;
  attribute?: string;
}

export interface QualificationSlot {
  position: number;
  kind: QualificationKind;
  label: string;
  attribute?: string;
  entries: CompdataSetting[];
}

export interface ContinentalCompetition {
  object: CompdataObject;
  label: string;
  region: ContinentalRegion;
  startRules: TeamSourceTaskRow[];
}

export interface ContinentalValidationIssue {
  severity: "warning" | "error";
  message: string;
  technical?: string;
}

export const QUALIFICATION_OPTIONS: QualificationOption[] = [
  { kind: "champion", label: "Champion", attribute: "info_label_slot_champ" },
  { kind: "ucl", label: "Champions League", attribute: "info_label_slot_ucl" },
  { kind: "uel", label: "Europa League", attribute: "info_label_slot_uel" },
  { kind: "uecl", label: "Conference League", attribute: "info_label_slot_uecl" },
  { kind: "uclQual", label: "Champions League qualifying", attribute: "info_label_slot_ucl_qual" },
  { kind: "uelQual", label: "Europa League qualifying", attribute: "info_label_slot_uel_qual" },
  { kind: "ueclQual", label: "Conference League qualifying", attribute: "info_label_slot_uecl_qual" },
  { kind: "libertadores", label: "Libertadores", attribute: "info_label_slot_libert" },
  { kind: "libertadoresQual", label: "Libertadores qualifying", attribute: "info_label_slot_libert_qual" },
  { kind: "sudamericana", label: "Sudamericana", attribute: "info_label_slot_sudame" },
  { kind: "none", label: "No continental qualification" }
];

const QUALIFICATION_ATTRIBUTES = QUALIFICATION_OPTIONS.map((option) => option.attribute).filter((attribute): attribute is string => Boolean(attribute));
const UEFA_ALLOCATION = "uefa_seeded_slots";
const CONMEBOL_ALLOCATION = "conmebol_seeded_slots";
const UEFA_SPECIAL = "uefa_seeded_slots_special_teams";
const CONMEBOL_SPECIAL = "conmebol_seeded_slots_special_teams";

@Injectable({ providedIn: "root" })
export class ContinentalQualificationService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly display: CompObjDisplayService,
    private readonly settings: SettingsService,
    private readonly tasks: TasksService,
    private readonly tasksDisplay: TasksDisplayService
  ) {}

  regionForCompetition(project: CompdataProject, competition: CompdataCompetitionSummary): ContinentalRegion {
    const confederation = this.confederationForObject(project, competition.id);
    return this.regionForConfederation(confederation);
  }

  confederationForObject(project: CompdataProject, objectId: number): CompdataObject | undefined {
    let current = this.tree.object(project, objectId);
    const visited = new Set<number>();
    while (current && !visited.has(current.id)) {
      if (current.kind === 1) return current;
      visited.add(current.id);
      current = this.tree.object(project, current.parentId);
    }
    return undefined;
  }

  countryForCompetition(project: CompdataProject, competition: CompdataCompetitionSummary): CompdataObject | undefined {
    const object = this.tree.object(project, competition.id);
    const parent = object ? this.tree.object(project, object.parentId) : undefined;
    return parent?.kind === 2 ? parent : undefined;
  }

  regionForConfederation(confederation: CompdataObject | undefined): ContinentalRegion {
    const code = `${confederation?.shortName ?? ""} ${confederation?.description ?? ""}`.toUpperCase();
    if (code.includes("UEFA") || code.includes("EUROPEAN")) return "UEFA";
    if (code.includes("CNBL") || code.includes("CONMEBOL") || code.includes("SOUTH AMERICAN")) return "CONMEBOL";
    return "OTHER";
  }

  qualificationOptions(region: ContinentalRegion): QualificationOption[] {
    if (region === "UEFA") {
      return QUALIFICATION_OPTIONS.filter((option) => ["champion", "ucl", "uel", "uecl", "uclQual", "uelQual", "ueclQual", "none"].includes(option.kind));
    }
    if (region === "CONMEBOL") {
      return QUALIFICATION_OPTIONS.filter((option) => ["champion", "libertadores", "libertadoresQual", "sudamericana", "none"].includes(option.kind));
    }
    return QUALIFICATION_OPTIONS;
  }

  tableGroups(project: CompdataProject, competition: CompdataCompetitionSummary): CompdataObject[] {
    return this.tree
      .phases(project, competition.id)
      .flatMap((phase) => this.tree.groups(project, phase.id));
  }

  primaryTableGroup(project: CompdataProject, competition: CompdataCompetitionSummary): CompdataObject | undefined {
    const groups = this.tableGroups(project, competition);
    return groups.find((group) => this.positionsCount(project, group.id) > 0) ?? groups[0];
  }

  positionsCount(project: CompdataProject, groupId: number): number {
    return project.standings.filter((standing) => standing.groupId === groupId).length;
  }

  qualificationSlots(project: CompdataProject, groupId: number): QualificationSlot[] {
    const slots: QualificationSlot[] = [];
    for (const option of QUALIFICATION_OPTIONS) {
      if (!option.attribute) continue;
      const entries = this.settings.entries(project, groupId, option.attribute);
      for (const entry of entries) {
        const position = Number(entry.value);
        if (!Number.isInteger(position) || position <= 0) continue;
        slots.push({ position, kind: option.kind, label: option.label, attribute: option.attribute, entries: [entry] });
      }
    }
    return slots.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
  }

  qualificationForPosition(project: CompdataProject, groupId: number, position: number): QualificationSlot | undefined {
    return this.qualificationSlots(project, groupId).find((slot) => slot.position === position);
  }

  setQualificationSlot(project: CompdataProject, groupId: number, position: number, kind: QualificationKind): void {
    this.removeQualificationAtPosition(project, groupId, position);
    const option = QUALIFICATION_OPTIONS.find((candidate) => candidate.kind === kind);
    if (!option?.attribute) return;
    const values = this.settings.getMultiValues(project, groupId, option.attribute);
    if (!values.includes(String(position))) {
      this.settings.setMultiSetting(project, groupId, option.attribute, [...values, String(position)].sort((a, b) => Number(a) - Number(b)));
    }
    if (kind === "champion") {
      const champValues = this.settings.getMultiValues(project, groupId, "info_slot_champ");
      if (!champValues.includes(String(position))) {
        this.settings.setMultiSetting(project, groupId, "info_slot_champ", [...champValues, String(position)].sort((a, b) => Number(a) - Number(b)));
      }
    }
  }

  removeQualificationAtPosition(project: CompdataProject, groupId: number, position: number): void {
    for (const attribute of [...QUALIFICATION_ATTRIBUTES, "info_slot_champ"]) {
      const remaining = this.settings.getMultiValues(project, groupId, attribute).filter((value) => Number(value) !== position);
      this.settings.setMultiSetting(project, groupId, attribute, remaining);
    }
  }

  clearQualificationSlots(project: CompdataProject, groupId: number): void {
    this.settings.resetSettings(project, groupId, [...QUALIFICATION_ATTRIBUTES, "info_slot_champ"]);
  }

  allocationAttribute(region: ContinentalRegion): string {
    return region === "CONMEBOL" ? CONMEBOL_ALLOCATION : UEFA_ALLOCATION;
  }

  specialTeamsAttribute(region: ContinentalRegion): string {
    return region === "CONMEBOL" ? CONMEBOL_SPECIAL : UEFA_SPECIAL;
  }

  countryAllocation(project: CompdataProject, countryId: number, region: ContinentalRegion): string[] {
    return this.settings.getMultiValues(project, countryId, this.allocationAttribute(region));
  }

  setCountryAllocation(project: CompdataProject, countryId: number, region: ContinentalRegion, values: string[]): void {
    this.settings.setMultiSetting(project, countryId, this.allocationAttribute(region), values.map((value) => String(value).trim()).filter(Boolean));
  }

  specialTeamPools(project: CompdataProject, confederationId: number, region: ContinentalRegion): Array<{ nationId?: number; nationLabel: string; values: string[] }> {
    const values = this.settings.getMultiValues(project, confederationId, this.specialTeamsAttribute(region));
    const groups: Array<{ nationId?: number; nationLabel: string; values: string[] }> = [];
    for (let index = 0; index < values.length; index += 3) {
      const chunk = values.slice(index, index + 3);
      if (!chunk.length) continue;
      const nationId = Number(chunk.at(-1));
      const nation = Number.isInteger(nationId) ? nations.find((candidate) => candidate.id === nationId) : undefined;
      groups.push({
        nationId: Number.isInteger(nationId) ? nationId : undefined,
        nationLabel: nation?.name ?? (Number.isInteger(nationId) ? `Nation ID ${nationId}` : "Unknown nation"),
        values: chunk.slice(0, Math.max(0, chunk.length - 1))
      });
    }
    return groups;
  }

  continentalCompetitions(project: CompdataProject, reference?: DbProject): ContinentalCompetition[] {
    const confedIds = new Set(project.objects.filter((object) => object.kind === 1).map((object) => object.id));
    return project.objects
      .filter((object) => (object.kind === 3 || object.kind === 6) && confedIds.has(object.parentId))
      .map((object) => {
        const confederation = this.tree.object(project, object.parentId);
        return {
          object,
          label: this.display.objectName(object, reference, project),
          region: this.regionForConfederation(confederation),
          startRules: this.tasks.listTournamentTasks(project, {
            id: object.id,
            shortName: object.shortName,
            description: object.description,
            parentId: object.parentId,
            stages: [],
            groups: [],
            settingsCount: 0,
            tasksCount: 0,
            scheduleCount: 0,
            standingsCount: 0,
            advancementCount: 0,
            initTeamsCount: 0
          }).filter((row) => row.task.timing.toLowerCase() === "start")
        };
      })
      .sort((a, b) => a.region.localeCompare(b.region) || a.label.localeCompare(b.label));
  }

  targetGroupOptions(project: CompdataProject, competitionId: number, reference?: DbProject): Array<{ value: string; label: string; detail: string; searchText: string }> {
    return this.tasksDisplay.groupOptions(project, competitionId, reference);
  }

  fillRuleSentence(project: CompdataProject, task: CompdataTask, reference?: DbProject): string {
    return this.tasksDisplay.friendlySentence(project, task, reference);
  }

  validateDomesticLeague(project: CompdataProject, competition: CompdataCompetitionSummary, groupId: number, region: ContinentalRegion): ContinentalValidationIssue[] {
    const issues: ContinentalValidationIssue[] = [];
    const slots = this.qualificationSlots(project, groupId);
    const country = this.countryForCompetition(project, competition);
    const confederation = this.confederationForObject(project, competition.id);
    const allocation = country ? this.countryAllocation(project, country.id, region) : [];
    const positionCount = this.positionsCount(project, groupId);

    if (!country) {
      issues.push({ severity: "warning", message: "This tournament is not attached to a country, so domestic continental allocation cannot be resolved." });
    }
    if (!confederation) {
      issues.push({ severity: "warning", message: "No confederation object was found above this competition." });
    }
    if (slots.length && !allocation.length && region !== "OTHER") {
      issues.push({ severity: "warning", message: "This league has continental qualification positions, but its country has no continental allocation configured." });
    }
    if (!slots.length && allocation.length) {
      issues.push({ severity: "warning", message: "This country has continental allocation values, but this league has no continental qualification positions." });
    }
    for (const slot of slots) {
      if (positionCount > 0 && slot.position > positionCount) {
        issues.push({ severity: "error", message: `Position ${slot.position} is larger than this league table.`, technical: `${slot.attribute},${slot.position}` });
      }
    }

    const seen = new Set<number>();
    for (const slot of slots) {
      if (seen.has(slot.position)) {
        issues.push({ severity: "warning", message: `Position ${slot.position} has more than one continental qualification label.` });
      }
      seen.add(slot.position);
    }
    return issues;
  }

  validateContinentalCompetitions(project: CompdataProject, competitions: ContinentalCompetition[]): ContinentalValidationIssue[] {
    const issues: ContinentalValidationIssue[] = [];
    for (const competition of competitions) {
      if (!competition.startRules.length) {
        issues.push({ severity: "warning", message: `${competition.label} has no start rules to fill teams.` });
      }
      for (const row of competition.startRules) {
        const task = row.task;
        if (!row.known) {
          issues.push({ severity: "warning", message: `${competition.label} has an advanced fill rule that is preserved but not editable in Simple View.`, technical: this.tasks.rawLine(task) });
          continue;
        }
        if (!row.target) {
          issues.push({ severity: "error", message: `${competition.label} has a fill rule pointing to a missing setup group.`, technical: `target ${task.targetId}` });
        } else if (row.target.kind !== 5) {
          issues.push({ severity: "warning", message: `${competition.label} has a fill rule whose target is not a group or slot.`, technical: `target ${task.targetId}` });
        }

        if (task.action === "FillFromCompTable" || task.action === "FillFromCompTableBackupLeague" || task.action === "FillFromCompTableBackup") {
          this.validateCompetitionReference(project, competition.label, task.param1, issues);
        }
        if (task.action === "FillFromCompTableBackup") {
          this.validateCompetitionReference(project, competition.label, task.param2, issues);
        }
        if (task.action === "FillFromSpecialTeamsWithNation") {
          this.validatePositive(task.param1, `${competition.label} special teams count`, issues);
          this.validateNation(task.param2, competition.label, issues);
        }
        if (task.action === "FillFromTopCoefficientCountry") {
          this.validatePositive(task.param1, `${competition.label} country coefficient rank`, issues);
          this.validatePositive(task.param2, `${competition.label} number of teams`, issues);
          this.validatePositive(task.param3, `${competition.label} allocation slot`, issues);
        }
        if (task.action === "FillFromLeague" || task.action === "FillFromLeagueMaxFromCountry") {
          this.validatePositive(task.param1, `${competition.label} source league`, issues);
        }
        if (task.action === "FillFromLeagueMaxFromCountry") {
          this.validatePositive(task.param2, `${competition.label} number of teams`, issues);
          this.validatePositive(task.param3, `${competition.label} maximum from same country`, issues);
        }
        if (task.action === "FillFromCompTable" || task.action === "FillFromCompTableBackupLeague" || task.action === "FillFromCompTableBackup") {
          const count = task.action === "FillFromCompTable" ? task.param2 : task.param3;
          this.validatePositive(count, `${competition.label} number of teams`, issues);
        }
        if (task.action === "FillFromCompTableBackupLeague") {
          this.validatePositive(task.param2, `${competition.label} backup league`, issues);
        }
      }
    }
    return issues;
  }

  private validateCompetitionReference(project: CompdataProject, competitionLabel: string, value: string, issues: ContinentalValidationIssue[]): void {
    const object = this.tree.object(project, Number(value));
    if (!object) {
      issues.push({ severity: "error", message: `${competitionLabel} has a fill rule pointing to a missing competition.`, technical: `competition ${value}` });
    } else if (object.kind !== 3 && object.kind !== 6) {
      issues.push({ severity: "warning", message: `${competitionLabel} has a fill rule whose source is not a competition.`, technical: `object ${value}, type ${object.kind}` });
    }
  }

  private validateNation(value: string, competitionLabel: string, issues: ContinentalValidationIssue[]): void {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      issues.push({ severity: "error", message: `${competitionLabel} has a special-teams rule with an invalid nation.`, technical: `nation ${value}` });
      return;
    }
    if (!nations.some((nation) => nation.id === id)) {
      issues.push({ severity: "warning", message: `${competitionLabel} has a special-teams rule using a nation ID not found in nations.txt.`, technical: `nation ${value}` });
    }
  }

  private validatePositive(value: string, label: string, issues: ContinentalValidationIssue[]): void {
    if (!/^\d+$/.test(String(value).trim()) || Number(value) <= 0) {
      issues.push({ severity: "error", message: `${label} must be a positive number.`, technical: value });
    }
  }
}
