import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, CompdataWeatherEntry, DbProject } from "../../../shared/types";
import { CompObjTreeService } from "./compobj-tree.service";
import { ScheduleDateService } from "./schedule-date.service";
import { WeatherDisplayService } from "./weather-display.service";
import { WeatherValidationIssue, WeatherValidationService } from "./weather-validation.service";

export type WeatherPresetKey = "temperate" | "cold" | "tropical" | "dry" | "rainy";
export type WeatherPresetApplyMode = "empty" | "all" | "selected";
export type MissingWeatherFillMode = "nearest" | "temperate" | "custom";

export interface WeatherMonthDraft {
  dryChance: number;
  rainChance: number;
  snowChance: number;
  overcastChance: number;
  sunsetTime: string;
  nightTime: string;
}

export interface WeatherCountrySummary {
  monthsConfigured: number;
  snowiestMonth: string;
  rainiestMonth: string;
  sunsetRange: string;
  status: "OK" | "Warning";
}

export interface ClimatePreset {
  key: WeatherPresetKey;
  label: string;
  description: string;
}

@Injectable({ providedIn: "root" })
export class WeatherService {
  readonly presets: ClimatePreset[] = [
    { key: "temperate", label: "Temperate", description: "Moderate rain, low snow, seasonal sunset variation." },
    { key: "cold", label: "Cold / Snowy", description: "Higher snow chance in winter months." },
    { key: "tropical", label: "Tropical", description: "No snow, higher rain, longer daylight variation minimal." },
    { key: "dry", label: "Dry", description: "High dry chance, low rain, no snow." },
    { key: "rainy", label: "Rainy", description: "Higher rain and overcast chance." }
  ];

  constructor(
    private readonly tree: CompObjTreeService,
    private readonly dates: ScheduleDateService,
    private readonly display: WeatherDisplayService,
    private readonly validation: WeatherValidationService
  ) {}

  countries(project: CompdataProject, reference?: DbProject): CompdataObject[] {
    return project.objects
      .filter((object) => object.kind === 2)
      .slice()
      .sort((a, b) => this.display.countryObjectName(a, project, reference).localeCompare(this.display.countryObjectName(b, project, reference)));
  }

  countryProfile(project: CompdataProject, countryObjectId: number): CompdataWeatherEntry[] {
    return (project.weatherEntries ?? [])
      .filter((entry) => entry.countryObjectId === countryObjectId)
      .slice()
      .sort((a, b) => a.month - b.month);
  }

  monthEntry(project: CompdataProject, countryObjectId: number, month: number): CompdataWeatherEntry | undefined {
    return (project.weatherEntries ?? []).find((entry) => entry.countryObjectId === countryObjectId && entry.month === month);
  }

  hasCompleteWeather(project: CompdataProject, countryObjectId: number): boolean {
    return this.configuredMonths(project, countryObjectId).size === 12;
  }

  configuredMonths(project: CompdataProject, countryObjectId: number): Set<number> {
    return new Set(this.countryProfile(project, countryObjectId).filter((entry) => entry.month >= 1 && entry.month <= 12).map((entry) => entry.month));
  }

  missingMonths(project: CompdataProject, countryObjectId: number): number[] {
    const configured = this.configuredMonths(project, countryObjectId);
    return Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => !configured.has(month));
  }

  updateMonth(project: CompdataProject, countryObjectId: number, month: number, draft: WeatherMonthDraft): void {
    const entries = this.ensureWeather(project);
    const index = entries.findIndex((entry) => entry.countryObjectId === countryObjectId && entry.month === month);
    const previous = index >= 0 ? entries[index] : undefined;
    const entry = this.entryFromDraft(countryObjectId, month, draft, previous?.originalRawLine);
    if (index >= 0) {
      entries[index] = entry;
    } else {
      entries.push(entry);
    }
  }

  copyFromCountry(project: CompdataProject, sourceCountryObjectId: number, targetCountryObjectId: number): number {
    const sourceEntries = this.countryProfile(project, sourceCountryObjectId).filter((entry) => entry.month >= 1 && entry.month <= 12);
    project.weatherEntries = (project.weatherEntries ?? []).filter((entry) => entry.countryObjectId !== targetCountryObjectId);
    project.weatherEntries.push(...sourceEntries.map((entry) => ({
      ...entry,
      countryObjectId: targetCountryObjectId,
      originalRawLine: undefined
    })));
    return sourceEntries.length;
  }

  addMissingMonths(project: CompdataProject, countryObjectId: number, mode: MissingWeatherFillMode, custom?: WeatherMonthDraft): number {
    const missing = this.missingMonths(project, countryObjectId);
    for (const month of missing) {
      const draft = mode === "custom" && custom
        ? custom
        : mode === "nearest"
          ? this.nearestExistingDraft(project, countryObjectId, month) ?? this.presetMonthDraft("temperate", month)
          : this.presetMonthDraft("temperate", month);
      this.updateMonth(project, countryObjectId, month, draft);
    }
    return missing.length;
  }

  applyPreset(project: CompdataProject, countryObjectId: number, preset: WeatherPresetKey, mode: WeatherPresetApplyMode, selectedMonths: number[] = []): number {
    const selected = new Set(selectedMonths);
    const missing = this.configuredMonths(project, countryObjectId);
    let changed = 0;
    for (let month = 1; month <= 12; month += 1) {
      if (mode === "empty" && missing.has(month)) continue;
      if (mode === "selected" && !selected.has(month)) continue;
      this.updateMonth(project, countryObjectId, month, this.presetMonthDraft(preset, month));
      changed += 1;
    }
    return changed;
  }

  presetEntries(countryObjectId: number, preset: WeatherPresetKey): CompdataWeatherEntry[] {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return this.entryFromDraft(countryObjectId, month, this.presetMonthDraft(preset, month));
    });
  }

  presetMonthDraft(preset: WeatherPresetKey, month: number): WeatherMonthDraft {
    const index = Math.max(0, Math.min(11, month - 1));
    const daylight = [
      ["1600", "1700"], ["1630", "1730"], ["1730", "1830"], ["1830", "1930"],
      ["1930", "2030"], ["2030", "2130"], ["2030", "2130"], ["2000", "2100"],
      ["1900", "2000"], ["1800", "1900"], ["1700", "1800"], ["1600", "1700"]
    ][index];

    if (preset === "cold") {
      const dry = [35, 35, 45, 55, 60, 65, 65, 60, 55, 45, 35, 30][index];
      const rain = [25, 30, 35, 35, 35, 35, 35, 35, 35, 35, 30, 25][index];
      return this.normalizedDraft(dry, rain, 100 - dry - rain, [70, 65, 60, 55, 50, 45, 45, 50, 55, 60, 70, 75][index], daylight[0], daylight[1]);
    }

    if (preset === "tropical") {
      const dry = [55, 55, 50, 50, 55, 60, 65, 65, 60, 55, 50, 50][index];
      return this.normalizedDraft(dry, 100 - dry, 0, [55, 55, 60, 60, 55, 50, 45, 45, 50, 55, 60, 60][index], "1800", "1900");
    }

    if (preset === "dry") {
      const dry = [85, 85, 90, 90, 92, 95, 95, 95, 92, 90, 88, 85][index];
      return this.normalizedDraft(dry, 100 - dry, 0, [20, 20, 18, 15, 15, 10, 10, 10, 15, 18, 20, 20][index], daylight[0], daylight[1]);
    }

    if (preset === "rainy") {
      const dry = [35, 35, 40, 40, 35, 35, 40, 40, 35, 35, 30, 30][index];
      const snow = [5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 5, 10][index];
      return this.normalizedDraft(dry, 100 - dry - snow, snow, [75, 75, 70, 70, 70, 65, 65, 65, 70, 75, 80, 80][index], daylight[0], daylight[1]);
    }

    const dry = [40, 45, 55, 60, 65, 70, 70, 65, 60, 55, 45, 40][index];
    const rain = [35, 35, 35, 30, 30, 25, 25, 25, 30, 35, 35, 35][index];
    return this.normalizedDraft(dry, rain, 100 - dry - rain, [60, 55, 50, 45, 45, 40, 40, 45, 50, 55, 60, 60][index], daylight[0], daylight[1]);
  }

  summary(project: CompdataProject, countryObjectId: number): WeatherCountrySummary {
    const entries = this.countryProfile(project, countryObjectId).filter((entry) => entry.month >= 1 && entry.month <= 12);
    const monthsConfigured = new Set(entries.map((entry) => entry.month)).size;
    const snowiest = entries.slice().sort((a, b) => b.snowChance - a.snowChance)[0];
    const rainiest = entries.slice().sort((a, b) => b.rainChance - a.rainChance)[0];
    const validSunsets = entries.map((entry) => entry.sunsetTime).filter((time) => this.dates.isValidHHMM(time));
    const sunsetRange = validSunsets.length
      ? `${this.display.formatTime(validSunsets.slice().sort()[0])} - ${this.display.formatTime(validSunsets.slice().sort().at(-1) ?? validSunsets[0])}`
      : "Not set";
    const issues = this.validation.validateCountry(project, countryObjectId);
    return {
      monthsConfigured,
      snowiestMonth: snowiest ? this.display.monthName(snowiest.month) : "Not set",
      rainiestMonth: rainiest ? this.display.monthName(rainiest.month) : "Not set",
      sunsetRange,
      status: issues.some((issue) => issue.severity === "error" || issue.severity === "warning") ? "Warning" : "OK"
    };
  }

  technicalPreview(project: CompdataProject, countryObjectId?: number): string[] {
    return (project.weatherEntries ?? [])
      .filter((entry) => countryObjectId === undefined || entry.countryObjectId === countryObjectId)
      .slice()
      .sort((a, b) => a.countryObjectId !== b.countryObjectId ? a.countryObjectId - b.countryObjectId : a.month - b.month)
      .map((entry) => this.rawLine(entry));
  }

  validateCountry(project: CompdataProject, countryObjectId: number): WeatherValidationIssue[] {
    return this.validation.validateCountry(project, countryObjectId);
  }

  rawLine(entry: CompdataWeatherEntry): string {
    return this.display.rawLine(entry);
  }

  normalizeDraft(draft: WeatherMonthDraft): WeatherMonthDraft {
    return this.normalizeChances(draft.dryChance, draft.rainChance, draft.snowChance, draft);
  }

  private entryFromDraft(countryObjectId: number, month: number, draft: WeatherMonthDraft, originalRawLine?: string): CompdataWeatherEntry {
    return {
      countryObjectId,
      month: Math.max(1, Math.min(12, Math.trunc(Number(month) || 1))),
      dryChance: this.percent(draft.dryChance),
      rainChance: this.percent(draft.rainChance),
      snowChance: this.percent(draft.snowChance),
      overcastChance: this.percent(draft.overcastChance),
      sunsetTime: this.dates.parseTimeToHHMM(draft.sunsetTime) || String(draft.sunsetTime).trim(),
      nightTime: this.dates.parseTimeToHHMM(draft.nightTime) || String(draft.nightTime).trim(),
      originalRawLine
    };
  }

  private nearestExistingDraft(project: CompdataProject, countryObjectId: number, targetMonth: number): WeatherMonthDraft | undefined {
    const entries = this.countryProfile(project, countryObjectId).filter((entry) => entry.month >= 1 && entry.month <= 12);
    if (!entries.length) return undefined;
    const nearest = entries
      .slice()
      .sort((a, b) => this.monthDistance(a.month, targetMonth) - this.monthDistance(b.month, targetMonth))[0];
    return this.entryToDraft(nearest);
  }

  private monthDistance(a: number, b: number): number {
    const distance = Math.abs(a - b);
    return Math.min(distance, 12 - distance);
  }

  private entryToDraft(entry: CompdataWeatherEntry): WeatherMonthDraft {
    return {
      dryChance: entry.dryChance,
      rainChance: entry.rainChance,
      snowChance: entry.snowChance,
      overcastChance: entry.overcastChance,
      sunsetTime: this.display.formatTime(entry.sunsetTime),
      nightTime: this.display.formatTime(entry.nightTime)
    };
  }

  private normalizedDraft(dryChance: number, rainChance: number, snowChance: number, overcastChance: number, sunsetTime: string, nightTime: string): WeatherMonthDraft {
    return {
      dryChance,
      rainChance,
      snowChance,
      overcastChance,
      sunsetTime,
      nightTime
    };
  }

  private normalizeChances(dryChance: number, rainChance: number, snowChance: number, draft: WeatherMonthDraft): WeatherMonthDraft {
    const values = [Math.max(0, Number(dryChance) || 0), Math.max(0, Number(rainChance) || 0), Math.max(0, Number(snowChance) || 0)];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return { ...draft, dryChance: 100, rainChance: 0, snowChance: 0 };
    }
    const normalizedDry = Math.round((values[0] / total) * 100);
    const normalizedRain = Math.round((values[1] / total) * 100);
    return {
      ...draft,
      dryChance: normalizedDry,
      rainChance: normalizedRain,
      snowChance: Math.max(0, 100 - normalizedDry - normalizedRain)
    };
  }

  private percent(value: number): number {
    return Math.max(0, Math.min(100, Math.trunc(Number(value) || 0)));
  }

  private ensureWeather(project: CompdataProject): CompdataWeatherEntry[] {
    project.weatherEntries ??= [];
    project.weatherInvalidLines ??= [];
    return project.weatherEntries;
  }
}
