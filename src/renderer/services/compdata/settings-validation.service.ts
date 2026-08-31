import { Injectable } from "@angular/core";
import type { CompdataProject, CompdataSetting } from "../../../shared/types";
import { COMP_TYPE_OPTIONS, MATCH_SITUATION_OPTIONS, MONTH_OPTIONS, STAGE_TYPE_OPTIONS } from "./settings-display.service";
import { MULTI_SETTING_KEYS, SettingsService } from "./settings.service";

export interface SettingsValidationIssue {
  severity: "warning" | "error";
  objectId?: number;
  attribute?: string;
  message: string;
  technical?: string;
}

const KNOWN_ATTRIBUTES = new Set([
  "comp_type",
  "asset_id",
  "match_matchimportance",
  "standings_pointswin",
  "standings_pointsdraw",
  "standings_pointsloss",
  "standings_sort",
  "rule_bookings",
  "rule_offsides",
  "rule_injuries",
  "rule_numsubsbench",
  "rule_numsubsmatch",
  "rule_numyellowstored",
  "rule_numgamesbanredmin",
  "rule_numgamesbanredmax",
  "rule_numgamesbandoubleyellowmin",
  "rule_numgamesbandoubleyellowmax",
  "rule_numgamesbanyellowsmin",
  "rule_numgamesbanyellowsmax",
  "match_endruleleague",
  "match_endruleko1leg",
  "match_endruleko2leg1",
  "match_endruleko2leg2",
  "match_endrulefriendly",
  "schedule_seasonstartmonth",
  "schedule_year_start",
  "schedule_year_offset",
  "schedule_internationaldependency",
  "schedule_friendlydaysbefore",
  "schedule_friendlydaysbetweenmin",
  "schedule_use_dates_comp",
  "schedule_checkconflict",
  "info_league_promo",
  "info_league_releg",
  "schedule_forcecomp",
  "info_prize_money",
  "info_prize_money_drop",
  "match_stagetype",
  "match_matchsituation",
  "advance_maxteamsassoc",
  "info_color_slot_adv_group",
  "advance_random_draw_event",
  "num_games",
  "match_stadium",
  "advance_pointskeep",
  "advance_pointskeeppercentage",
  "info_slot_champ",
  "info_slot_promo",
  "info_slot_promo_poss",
  "info_slot_releg",
  "info_slot_releg_poss",
  "info_color_slot_champ_cup",
  "info_color_slot_euro_league",
  "nation_id",
  "rule_suspension"
]);

const ON_OFF_ATTRIBUTES = new Set(["rule_bookings", "rule_offsides", "rule_injuries"]);
const BOOLEAN_NUMBER_ATTRIBUTES = new Set(["schedule_internationaldependency", "schedule_checkconflict", "advance_random_draw_event"]);
const POSITIVE_INTEGER_ATTRIBUTES = new Set([
  "rule_numsubsmatch",
  "rule_numyellowstored",
  "schedule_year_offset",
  "schedule_friendlydaysbefore",
  "schedule_friendlydaysbetweenmin",
  "num_games"
]);
const NON_NEGATIVE_NUMBER_ATTRIBUTES = new Set([
  "standings_pointswin",
  "standings_pointsdraw",
  "standings_pointsloss",
  "rule_numsubsbench",
  "rule_numgamesbanredmin",
  "rule_numgamesbanredmax",
  "rule_numgamesbandoubleyellowmin",
  "rule_numgamesbandoubleyellowmax",
  "rule_numgamesbanyellowsmin",
  "rule_numgamesbanyellowsmax",
  "info_prize_money",
  "info_prize_money_drop",
  "advance_maxteamsassoc",
  "advance_pointskeeppercentage",
  "info_color_slot_adv_group",
  "info_slot_champ",
  "info_slot_promo",
  "info_slot_promo_poss",
  "info_slot_releg",
  "info_slot_releg_poss",
  "info_color_slot_champ_cup",
  "info_color_slot_euro_league",
  "asset_id",
  "match_stadium",
  "nation_id",
  "rule_suspension"
]);
const COMP_REFERENCE_ATTRIBUTES = new Set(["schedule_use_dates_comp", "info_league_promo", "info_league_releg", "schedule_forcecomp"]);
const END_RULE_VALUES = new Set(["END", "ET", "PENS", "AGG", "AWAY", "ET_AWAY"]);
const TIE_BREAKER_VALUES = new Set(["POINTS", "GOALDIFF", "GOALSFOR", "WINS", "H2HPOINTS", "H2HGOALDIFF", "H2HGOALSFOR", "TEAMRATING", "PREVRANK"]);

@Injectable({ providedIn: "root" })
export class SettingsValidationService {
  private readonly cache = new WeakMap<CompdataProject, {
    settingsRevision: number;
    settingsReference: CompdataSetting[];
    settingsCount: number;
    objectsReference: CompdataProject["objects"];
    objectCount: number;
    invalidLineCount: number;
    all: SettingsValidationIssue[];
    byObject: Map<number, SettingsValidationIssue[]>;
    global: SettingsValidationIssue[];
  }>();

  constructor(private readonly settings: SettingsService) {}

  validateProject(project: CompdataProject): SettingsValidationIssue[] {
    return this.index(project).all;
  }

  validateObject(project: CompdataProject, objectId: number): SettingsValidationIssue[] {
    const index = this.index(project);
    return [...index.global, ...(index.byObject.get(objectId) ?? [])];
  }

  private index(project: CompdataProject) {
    const settings = project.settings ?? [];
    const invalidLines = project.settingsInvalidLines ?? [];
    const cached = this.cache.get(project);
    const settingsRevision = this.settings.revision(project);
    if (
      cached &&
      cached.settingsRevision === settingsRevision &&
      cached.settingsReference === settings &&
      cached.settingsCount === settings.length &&
      cached.objectsReference === project.objects &&
      cached.objectCount === project.objects.length &&
      cached.invalidLineCount === invalidLines.length
    ) {
      return cached;
    }

    const issues: SettingsValidationIssue[] = [];
    const objectById = new Map(project.objects.map((object) => [object.id, object]));
    const competitionIds = new Set(project.objects.filter((object) => object.kind === 3).map((object) => object.id));
    const duplicateCounts = this.duplicateCounts(settings);

    for (const invalid of invalidLines) {
      issues.push({
        severity: "warning",
        message: "A settings.txt line could not be edited visually and will be preserved.",
        technical: invalid.reason
      });
    }
    for (const setting of settings) {
      issues.push(...this.validateSetting(project, setting, objectById, competitionIds, duplicateCounts));
    }

    const byObject = new Map<number, SettingsValidationIssue[]>();
    const global: SettingsValidationIssue[] = [];
    for (const issue of issues) {
      if (issue.objectId === undefined) {
        global.push(issue);
        continue;
      }
      const objectIssues = byObject.get(issue.objectId) ?? [];
      objectIssues.push(issue);
      byObject.set(issue.objectId, objectIssues);
    }

    const created = {
      settingsRevision,
      settingsReference: settings,
      settingsCount: settings.length,
      objectsReference: project.objects,
      objectCount: project.objects.length,
      invalidLineCount: invalidLines.length,
      all: issues,
      byObject,
      global
    };
    this.cache.set(project, created);
    return created;
  }

  private validateSetting(
    project: CompdataProject,
    setting: CompdataSetting,
    objectById: Map<number, CompdataProject["objects"][number]>,
    competitionIds: Set<number>,
    duplicateCounts: Map<string, number>
  ): SettingsValidationIssue[] {
    const issues: SettingsValidationIssue[] = [];
    const object = objectById.get(setting.objectId);
    const value = String(setting.value ?? "").trim();

    if (!object) {
      issues.push({
        severity: "warning",
        objectId: setting.objectId,
        attribute: setting.key,
        message: "This setting points to an object that no longer exists.",
        technical: `${setting.objectId},${setting.key},${setting.value}`
      });
    }
    if (!setting.key.trim()) {
      issues.push({ severity: "error", objectId: setting.objectId, message: "A setting has no rule name." });
    }
    if (!value) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "A setting has no value." });
    }
    if (!KNOWN_ATTRIBUTES.has(setting.key)) {
      issues.push({
        severity: "warning",
        objectId: setting.objectId,
        attribute: setting.key,
        message: "This rule is not recognized by DBM Studio, but it will be preserved.",
        technical: setting.key
      });
      return issues;
    }

    if (ON_OFF_ATTRIBUTES.has(setting.key) && !["on", "off"].includes(value.toLowerCase())) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "This On / Off rule must be On or Off." });
    }
    if (BOOLEAN_NUMBER_ATTRIBUTES.has(setting.key) && !["0", "1"].includes(value)) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "This yes/no rule must be On or Off." });
    }
    if (POSITIVE_INTEGER_ATTRIBUTES.has(setting.key) && !this.isInteger(value, 1)) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "This setting needs a positive whole number." });
    }
    if (NON_NEGATIVE_NUMBER_ATTRIBUTES.has(setting.key) && !this.isNumber(value, 0)) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "This setting needs a number greater than or equal to zero." });
    }
    if (setting.key === "advance_pointskeeppercentage" && this.isNumber(value, 0) && Number(value) > 100) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "The percentage must be between 0 and 100." });
    }
    if (setting.key === "match_matchimportance" && (!this.isNumber(value, 0) || Number(value) > 100)) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "Match importance must be between 0 and 100." });
    }
    if (setting.key === "rule_numsubsbench" && this.isNumber(value, 0) && !["5", "7"].includes(value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "Bench size is custom. DBM Studio will preserve it." });
    }
    if (setting.key === "schedule_seasonstartmonth" && !MONTH_OPTIONS.some((option) => option.value === value)) {
      issues.push({ severity: "error", objectId: setting.objectId, attribute: setting.key, message: "Season start month is not recognized." });
    }
    if (setting.key === "comp_type" && !COMP_TYPE_OPTIONS.some((option) => option.value === value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This competition type is not recognized by DBM Studio, but it will be preserved." });
    }
    if (setting.key === "match_stagetype" && !STAGE_TYPE_OPTIONS.some((option) => option.value === value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This stage format is not recognized by DBM Studio, but it will be preserved." });
    }
    if (setting.key === "match_matchsituation" && !MATCH_SITUATION_OPTIONS.some((option) => option.value === value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This stage situation is not recognized by DBM Studio, but it will be preserved." });
    }
    if (setting.key === "standings_sort" && !TIE_BREAKER_VALUES.has(value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This tie-breaker is not recognized by DBM Studio, but it will be preserved." });
    }
    if (setting.key.startsWith("match_endrule") && !END_RULE_VALUES.has(value)) {
      issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This match ending rule is not recognized by DBM Studio, but it will be preserved." });
    }
    if (COMP_REFERENCE_ATTRIBUTES.has(setting.key)) {
      if (!competitionIds.has(Number(value))) {
        issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This setting points to a tournament that no longer exists." });
      }
    }
    if (MULTI_SETTING_KEYS.has(setting.key)) {
      if ((duplicateCounts.get(this.duplicateKey(setting)) ?? 0) > 1) {
        issues.push({ severity: "warning", objectId: setting.objectId, attribute: setting.key, message: "This repeated table marker appears more than once." });
      }
    }

    return issues;
  }

  private isInteger(value: string, min: number): boolean {
    return /^-?\d+$/.test(value) && Number(value) >= min;
  }

  private isNumber(value: string, min: number): boolean {
    return value !== "" && Number.isFinite(Number(value)) && Number(value) >= min;
  }

  private duplicateCounts(settings: CompdataSetting[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const setting of settings) {
      if (!MULTI_SETTING_KEYS.has(setting.key)) continue;
      const key = this.duplicateKey(setting);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private duplicateKey(setting: CompdataSetting): string {
    return `${setting.objectId}\u0000${setting.key}\u0000${setting.value}`;
  }
}
