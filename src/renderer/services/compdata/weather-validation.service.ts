import { Injectable } from "@angular/core";
import type { CompdataProject, CompdataWeatherEntry } from "../../../shared/types";
import { CompObjTreeService } from "./compobj-tree.service";
import { ScheduleDateService } from "./schedule-date.service";
import { WeatherDisplayService } from "./weather-display.service";

export interface WeatherValidationIssue {
  severity: "error" | "warning";
  message: string;
  technical?: string;
  countryObjectId?: number;
  month?: number;
}

@Injectable({ providedIn: "root" })
export class WeatherValidationService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly dates: ScheduleDateService,
    private readonly display: WeatherDisplayService
  ) {}

  validateProject(project: CompdataProject): WeatherValidationIssue[] {
    const issues: WeatherValidationIssue[] = [];
    for (const entry of project.weatherEntries ?? []) {
      issues.push(...this.validateEntry(project, entry));
    }

    const byCountry = new Map<number, CompdataWeatherEntry[]>();
    for (const entry of project.weatherEntries ?? []) {
      const rows = byCountry.get(entry.countryObjectId) ?? [];
      rows.push(entry);
      byCountry.set(entry.countryObjectId, rows);
    }

    for (const [countryObjectId, entries] of byCountry) {
      issues.push(...this.validateCountryProfile(project, countryObjectId, entries));
    }

    for (const invalid of project.weatherInvalidLines ?? []) {
      issues.push({
        severity: "warning",
        message: "weather.txt has a line that DBM Studio cannot edit visually.",
        technical: `line ${invalid.lineNumber}: ${invalid.reason} (${invalid.rawLine})`
      });
    }

    return issues;
  }

  validateCountry(project: CompdataProject, countryObjectId: number): WeatherValidationIssue[] {
    const entries = (project.weatherEntries ?? []).filter((entry) => entry.countryObjectId === countryObjectId);
    return [
      ...entries.flatMap((entry) => this.validateEntry(project, entry)),
      ...this.validateCountryProfile(project, countryObjectId, entries)
    ];
  }

  validateEntry(project: CompdataProject, entry: CompdataWeatherEntry): WeatherValidationIssue[] {
    const issues: WeatherValidationIssue[] = [];
    const country = this.tree.object(project, entry.countryObjectId);
    if (!country) {
      issues.push({
        severity: "warning",
        message: "This weather entry points to a country that does not exist.",
        technical: `countryObjectId ${entry.countryObjectId} was not found in compobj.txt.`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    } else if (country.kind !== 2) {
      issues.push({
        severity: "warning",
        message: "This weather entry points to an object that is not a country.",
        technical: `object ${entry.countryObjectId} is type ${country.kind}, expected type 2.`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    }

    if (!Number.isInteger(entry.month) || entry.month < 1 || entry.month > 12) {
      issues.push({
        severity: "error",
        message: "Month must be between 1 and 12.",
        technical: `month ${entry.month}`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    }

    const chances = [
      ["Dry", entry.dryChance],
      ["Rain", entry.rainChance],
      ["Snow", entry.snowChance],
      ["Overcast", entry.overcastChance]
    ] as const;
    for (const [label, value] of chances) {
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        issues.push({
          severity: "error",
          message: "Weather chances must be between 0 and 100.",
          technical: `${label} chance is ${value}.`,
          countryObjectId: entry.countryObjectId,
          month: entry.month
        });
      }
    }

    const weatherTotal = entry.dryChance + entry.rainChance + entry.snowChance;
    if (weatherTotal !== 100) {
      issues.push({
        severity: "warning",
        message: "Dry, rain and snow usually should add up to 100%.",
        technical: `dry + rain + snow = ${weatherTotal}.`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    }

    if (!this.dates.isValidHHMM(entry.sunsetTime)) {
      issues.push({
        severity: "error",
        message: "Sunset time must be a valid HH:mm time.",
        technical: `sunsetTime ${entry.sunsetTime}`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    }

    if (!this.dates.isValidHHMM(entry.nightTime)) {
      issues.push({
        severity: "error",
        message: "Night time must be a valid HH:mm time.",
        technical: `nightTime ${entry.nightTime}`,
        countryObjectId: entry.countryObjectId,
        month: entry.month
      });
    }

    if (this.dates.isValidHHMM(entry.sunsetTime) && this.dates.isValidHHMM(entry.nightTime)) {
      const sunset = Number(this.dates.parseTimeToHHMM(entry.sunsetTime));
      const night = Number(this.dates.parseTimeToHHMM(entry.nightTime));
      if (night < sunset) {
        issues.push({
          severity: "warning",
          message: "Night time is earlier than sunset.",
          technical: `sunset ${this.display.formatTime(entry.sunsetTime)}, night ${this.display.formatTime(entry.nightTime)}.`,
          countryObjectId: entry.countryObjectId,
          month: entry.month
        });
      }
    }

    return issues;
  }

  private validateCountryProfile(project: CompdataProject, countryObjectId: number, entries: CompdataWeatherEntry[]): WeatherValidationIssue[] {
    const issues: WeatherValidationIssue[] = [];
    const months = new Map<number, number>();
    for (const entry of entries) {
      months.set(entry.month, (months.get(entry.month) ?? 0) + 1);
    }

    const validMonthCount = [...months.keys()].filter((month) => month >= 1 && month <= 12).length;
    if (validMonthCount > 0 && validMonthCount < 12) {
      issues.push({
        severity: "warning",
        message: `This country has weather for ${validMonthCount} of 12 months.`,
        technical: `countryObjectId ${countryObjectId}`,
        countryObjectId
      });
    }

    for (const [month, count] of months) {
      if (count > 1) {
        issues.push({
          severity: "warning",
          message: `This country has duplicate weather entries for ${this.display.monthName(month)}.`,
          technical: `countryObjectId ${countryObjectId}, month ${month}`,
          countryObjectId,
          month
        });
      }
    }

    return issues;
  }
}
