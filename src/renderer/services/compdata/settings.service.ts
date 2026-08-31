import { Injectable } from "@angular/core";
import type { CompdataProject, CompdataSetting } from "../../../shared/types";

export const MULTI_SETTING_KEYS = new Set([
  "standings_sort",
  "match_endruleko1leg",
  "match_endruleko2leg2",
  "info_color_slot_adv_group",
  "info_slot_promo",
  "info_slot_promo_poss",
  "info_slot_releg",
  "info_slot_releg_poss",
  "info_label_slot_champ",
  "info_label_slot_ucl",
  "info_label_slot_uel",
  "info_label_slot_uecl",
  "info_label_slot_ucl_qual",
  "info_label_slot_uel_qual",
  "info_label_slot_uecl_qual",
  "info_label_slot_libert",
  "info_label_slot_libert_qual",
  "info_label_slot_sudame",
  "uefa_seeded_slots",
  "conmebol_seeded_slots",
  "uefa_seeded_slots_special_teams",
  "conmebol_seeded_slots_special_teams",
  "info_color_slot_champ_cup",
  "info_color_slot_euro_league"
]);

export const SETTINGS_SECTIONS = {
  profile: ["comp_type", "asset_id", "match_matchimportance"],
  points: ["standings_pointswin", "standings_pointsdraw", "standings_pointsloss", "standings_sort"],
  match: [
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
    "rule_numgamesbanyellowsmax"
  ],
  ending: ["match_endruleleague", "match_endruleko1leg", "match_endruleko2leg1", "match_endruleko2leg2", "match_endrulefriendly"],
  season: [
    "schedule_seasonstartmonth",
    "schedule_year_start",
    "schedule_year_offset",
    "schedule_internationaldependency",
    "schedule_friendlydaysbefore",
    "schedule_friendlydaysbetweenmin",
    "schedule_use_dates_comp",
    "schedule_checkconflict"
  ],
  promotion: ["info_league_promo", "info_league_releg", "schedule_forcecomp"],
  prize: ["info_prize_money", "info_prize_money_drop"],
  stage: ["match_stagetype", "match_matchsituation", "info_prize_money", "info_prize_money_drop", "advance_maxteamsassoc", "info_color_slot_adv_group", "advance_random_draw_event"],
  group: [
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
    "info_color_slot_euro_league"
  ],
  global: ["nation_id", "rule_suspension"]
} satisfies Record<string, string[]>;

@Injectable({ providedIn: "root" })
export class SettingsService {
  private readonly indexes = new WeakMap<CompdataProject, {
    settingsReference: CompdataSetting[];
    settingsCount: number;
    byObject: Map<number, CompdataSetting[]>;
    byObjectAttribute: Map<string, CompdataSetting[]>;
  }>();
  private readonly revisions = new WeakMap<CompdataProject, number>();

  revision(project: CompdataProject): number {
    return this.revisions.get(project) ?? 0;
  }

  invalidate(project: CompdataProject): void {
    this.indexes.delete(project);
    this.revisions.set(project, this.revision(project) + 1);
  }

  entries(project: CompdataProject, objectId: number, attribute: string): CompdataSetting[] {
    return this.index(project).byObjectAttribute.get(this.indexKey(objectId, attribute)) ?? [];
  }

  objectEntries(project: CompdataProject, objectId: number): CompdataSetting[] {
    return this.index(project).byObject.get(objectId) ?? [];
  }

  getSingleSetting(project: CompdataProject, objectId: number, attribute: string): CompdataSetting | undefined {
    return this.entries(project, objectId, attribute)[0];
  }

  getSingleValue(project: CompdataProject, objectId: number, attribute: string): string | undefined {
    return this.getSingleSetting(project, objectId, attribute)?.value;
  }

  getMultiValues(project: CompdataProject, objectId: number, attribute: string): string[] {
    return this.entries(project, objectId, attribute).map((setting) => setting.value);
  }

  hasLocalSetting(project: CompdataProject, objectId: number, attribute: string): boolean {
    return this.entries(project, objectId, attribute).length > 0;
  }

  setSingleSetting(project: CompdataProject, objectId: number, attribute: string, value: string | number): void {
    const normalized = String(value).trim();
    const existing = this.entries(project, objectId, attribute);
    if (existing.length > 0) {
      existing[0].value = normalized;
      if (existing.length > 1) {
        const keep = existing[0];
        project.settings = project.settings.filter((setting) => setting === keep || setting.objectId !== objectId || setting.key !== attribute);
      }
      this.invalidate(project);
      return;
    }

    this.insertSetting(project, { objectId, key: attribute, value: normalized });
    this.invalidate(project);
  }

  setMultiSetting(project: CompdataProject, objectId: number, attribute: string, values: string[]): void {
    const normalizedValues = values.map((value) => String(value).trim()).filter(Boolean);
    const existing = this.entries(project, objectId, attribute);
    const used = new Set<CompdataSetting>();

    normalizedValues.slice(0, existing.length).forEach((value, index) => {
      const entry = existing[index];
      entry.value = value;
      used.add(entry);
    });

    project.settings = project.settings.filter((setting) => {
      if (setting.objectId !== objectId || setting.key !== attribute) return true;
      return used.has(setting);
    });

    normalizedValues.slice(existing.length).forEach((value) => {
      this.insertSetting(project, { objectId, key: attribute, value });
    });
    this.invalidate(project);
  }

  removeSetting(project: CompdataProject, objectId: number, attribute: string): void {
    project.settings = (project.settings ?? []).filter((setting) => setting.objectId !== objectId || setting.key !== attribute);
    this.invalidate(project);
  }

  resetSettings(project: CompdataProject, objectId: number, attributes: string[]): void {
    const attributesSet = new Set(attributes);
    project.settings = (project.settings ?? []).filter((setting) => setting.objectId !== objectId || !attributesSet.has(setting.key));
    this.invalidate(project);
  }

  copyAttributes(project: CompdataProject, sourceObjectId: number, targetObjectId: number, attributes: string[]): void {
    for (const attribute of attributes) {
      const values = this.getMultiValues(project, sourceObjectId, attribute);
      if (!values.length) {
        this.removeSetting(project, targetObjectId, attribute);
        continue;
      }
      if (MULTI_SETTING_KEYS.has(attribute)) {
        this.setMultiSetting(project, targetObjectId, attribute, values);
      } else {
        this.setSingleSetting(project, targetObjectId, attribute, values[0]);
      }
    }
  }

  previewLines(project: CompdataProject, objectId: number): string[] {
    return this.objectEntries(project, objectId).map((setting) => this.rawLine(setting));
  }

  rawLine(setting: Pick<CompdataSetting, "objectId" | "key" | "value">): string {
    return [setting.objectId, setting.key, setting.value].join(",");
  }

  private insertSetting(project: CompdataProject, setting: CompdataSetting): void {
    const index = this.findLastSettingIndex(project, setting.objectId);
    if (index < 0) {
      project.settings.push(setting);
      return;
    }
    project.settings.splice(index + 1, 0, setting);
  }

  private findLastSettingIndex(project: CompdataProject, objectId: number): number {
    for (let index = project.settings.length - 1; index >= 0; index -= 1) {
      if (project.settings[index].objectId === objectId) return index;
    }
    return -1;
  }

  private index(project: CompdataProject) {
    const settings = project.settings ?? [];
    const cached = this.indexes.get(project);
    if (cached && cached.settingsReference === settings && cached.settingsCount === settings.length) {
      return cached;
    }

    const byObject = new Map<number, CompdataSetting[]>();
    const byObjectAttribute = new Map<string, CompdataSetting[]>();
    for (const setting of settings) {
      const objectEntries = byObject.get(setting.objectId) ?? [];
      objectEntries.push(setting);
      byObject.set(setting.objectId, objectEntries);

      const key = this.indexKey(setting.objectId, setting.key);
      const attributeEntries = byObjectAttribute.get(key) ?? [];
      attributeEntries.push(setting);
      byObjectAttribute.set(key, attributeEntries);
    }

    const created = {
      settingsReference: settings,
      settingsCount: settings.length,
      byObject,
      byObjectAttribute
    };
    this.indexes.set(project, created);
    return created;
  }

  private indexKey(objectId: number, attribute: string): string {
    return `${objectId}\u0000${attribute}`;
  }
}
