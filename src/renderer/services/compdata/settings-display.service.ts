import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, CompdataSetting, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "./compobj-display.service";

export interface SettingsOption {
  value: string;
  label: string;
}

export const COMP_TYPE_OPTIONS: SettingsOption[] = [
  { value: "LEAGUE", label: "League" },
  { value: "CUP", label: "Cup" },
  { value: "SUPERCUP", label: "Supercup" },
  { value: "PLAYOFF", label: "Playoff" },
  { value: "INTERCUP", label: "International Cup" },
  { value: "INTERQUAL", label: "International Qualifiers" },
  { value: "FRIENDLY", label: "Friendly" },
  { value: "NONE", label: "None / Custom" }
];

export const TIE_BREAKER_OPTIONS: SettingsOption[] = [
  { value: "POINTS", label: "Points" },
  { value: "GOALDIFF", label: "Goal difference" },
  { value: "GOALSFOR", label: "Goals scored" },
  { value: "WINS", label: "Wins" },
  { value: "H2HPOINTS", label: "Head-to-head points" },
  { value: "H2HGOALDIFF", label: "Head-to-head goal difference" },
  { value: "H2HGOALSFOR", label: "Head-to-head goals scored" },
  { value: "TEAMRATING", label: "Team rating" },
  { value: "PREVRANK", label: "Previous ranking" }
];

export const MONTH_OPTIONS: SettingsOption[] = [
  { value: "JAN", label: "January" },
  { value: "FEB", label: "February" },
  { value: "MAR", label: "March" },
  { value: "APR", label: "April" },
  { value: "MAY", label: "May" },
  { value: "JUN", label: "June" },
  { value: "JUL", label: "July" },
  { value: "AUG", label: "August" },
  { value: "SEP", label: "September" },
  { value: "OCT", label: "October" },
  { value: "NOV", label: "November" },
  { value: "DEC", label: "December" }
];

export const STAGE_TYPE_OPTIONS: SettingsOption[] = [
  { value: "SETUP", label: "Setup / technical setup" },
  { value: "LEAGUE", label: "League table" },
  { value: "GROUP", label: "Group stage" },
  { value: "KO1LEG", label: "One-leg knockout" },
  { value: "KO2LEGS", label: "Two-leg knockout" }
];

export const MATCH_SITUATION_OPTIONS: SettingsOption[] = [
  { value: "LEAGUE", label: "League" },
  { value: "GROUP", label: "Group" },
  { value: "QUALIFY", label: "Qualifying" },
  { value: "ROUNDX", label: "Round" },
  { value: "QUARTER", label: "Quarter final" },
  { value: "SEMI", label: "Semi final" },
  { value: "THIRDPLACE", label: "Third place" },
  { value: "FINAL", label: "Final" }
];

const ATTRIBUTE_LABELS: Record<string, string> = {
  comp_type: "Competition type",
  asset_id: "Competition asset / Game asset",
  match_matchimportance: "Match importance",
  standings_pointswin: "Win points",
  standings_pointsdraw: "Draw points",
  standings_pointsloss: "Loss points",
  standings_sort: "Tie-breaker",
  rule_bookings: "Bookings",
  rule_offsides: "Offside",
  rule_injuries: "Injuries",
  rule_numsubsbench: "Substitutes on bench",
  rule_numsubsmatch: "Substitutions per match",
  rule_numyellowstored: "Yellow cards before ban",
  rule_numgamesbanredmin: "Red card ban minimum",
  rule_numgamesbanredmax: "Red card ban maximum",
  rule_numgamesbandoubleyellowmin: "Double yellow ban minimum",
  rule_numgamesbandoubleyellowmax: "Double yellow ban maximum",
  rule_numgamesbanyellowsmin: "Stored yellows ban minimum",
  rule_numgamesbanyellowsmax: "Stored yellows ban maximum",
  match_endruleleague: "League match if draw",
  match_endruleko1leg: "One-leg knockout if draw",
  match_endruleko2leg1: "Two-leg knockout first leg",
  match_endruleko2leg2: "Two-leg knockout second leg",
  match_endrulefriendly: "Friendly if draw",
  schedule_seasonstartmonth: "Season starts in",
  schedule_year_start: "Start year",
  schedule_year_offset: "Repeat every",
  schedule_internationaldependency: "International calendar dependency",
  schedule_friendlydaysbefore: "Minimum days before friendly",
  schedule_friendlydaysbetweenmin: "Minimum days between friendlies",
  schedule_use_dates_comp: "Use calendar dates from",
  schedule_checkconflict: "Check schedule conflicts",
  info_league_promo: "Promotion target",
  info_league_releg: "Relegation target",
  schedule_forcecomp: "Promotion playoff",
  info_prize_money: "Prize for winning",
  info_prize_money_drop: "Money drop / elimination drop",
  match_stagetype: "Stage format",
  match_matchsituation: "Match situation",
  advance_maxteamsassoc: "Max teams advancing per association",
  info_color_slot_adv_group: "Advancing positions highlighted",
  advance_random_draw_event: "Random draw",
  num_games: "Games between teams",
  match_stadium: "Stadium",
  advance_pointskeep: "Keep points from previous group",
  advance_pointskeeppercentage: "Percentage of points kept",
  info_slot_champ: "Champion position",
  info_slot_promo: "Promotion positions",
  info_slot_promo_poss: "Possible promotion playoff positions",
  info_slot_releg: "Relegation positions",
  info_slot_releg_poss: "Possible relegation playoff positions",
  info_color_slot_champ_cup: "Cup winner qualification positions",
  info_color_slot_euro_league: "European qualification positions",
  nation_id: "Country identity",
  rule_suspension: "Discipline rules"
};

@Injectable({ providedIn: "root" })
export class SettingsDisplayService {
  readonly compTypeOptions = COMP_TYPE_OPTIONS;
  readonly tieBreakerOptions = TIE_BREAKER_OPTIONS;
  readonly monthOptions = MONTH_OPTIONS;
  readonly stageTypeOptions = STAGE_TYPE_OPTIONS;
  readonly matchSituationOptions = MATCH_SITUATION_OPTIONS;

  constructor(private readonly objectDisplay: CompObjDisplayService) {}

  attributeLabel(attribute: string): string {
    return ATTRIBUTE_LABELS[attribute] ?? attribute;
  }

  rawLine(setting: Pick<CompdataSetting, "objectId" | "key" | "value">): string {
    return [setting.objectId, setting.key, setting.value].join(",");
  }

  competitionTypeLabel(value: string | undefined): string {
    return this.optionLabel(COMP_TYPE_OPTIONS, value, "Not configured");
  }

  tieBreakerLabel(value: string): string {
    return this.optionLabel(TIE_BREAKER_OPTIONS, value, value || "Custom");
  }

  monthLabel(value: string | undefined): string {
    return this.optionLabel(MONTH_OPTIONS, value, value || "Not configured");
  }

  stageTypeLabel(value: string | undefined): string {
    return this.optionLabel(STAGE_TYPE_OPTIONS, value, value || "Not configured");
  }

  matchSituationLabel(value: string | undefined): string {
    return this.optionLabel(MATCH_SITUATION_OPTIONS, value, value || "Not configured");
  }

  onOffLabel(value: string | undefined): string {
    if (!value) return "Not configured";
    return value.toLowerCase() === "on" || value === "1" ? "On" : "Off";
  }

  endRuleLabel(value: string): string {
    return ({
      END: "End as draw",
      ET: "Extra time",
      PENS: "Penalties",
      AGG: "Aggregate",
      AWAY: "Away goals",
      ET_AWAY: "Away goals after extra time"
    } as Record<string, string>)[value] ?? value;
  }

  competitionOptionLabel(project: CompdataProject, objectId: string | number | undefined, reference?: DbProject): string {
    const id = Number(objectId);
    if (!id) return "Not configured";
    const object = this.objectDisplay.object(project, id);
    return object ? this.objectDisplay.objectName(object, reference, project) : "Unknown tournament";
  }

  objectLabel(project: CompdataProject, object: CompdataObject | undefined, reference?: DbProject): string {
    return this.objectDisplay.objectName(object, reference, project);
  }

  private optionLabel(options: SettingsOption[], value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    return options.find((option) => option.value.toLowerCase() === value.toLowerCase())?.label ?? fallback;
  }
}
