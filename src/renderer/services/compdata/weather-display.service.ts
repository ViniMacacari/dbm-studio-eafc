import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, CompdataWeatherEntry, DbProject } from "../../../shared/types";
import { nations } from "../../../utils/get-nations/get-nations";
import { CompObjDisplayService } from "./compobj-display.service";
import { CompObjTreeService } from "./compobj-tree.service";
import { ScheduleDateService } from "./schedule-date.service";

@Injectable({ providedIn: "root" })
export class WeatherDisplayService {
  readonly monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  constructor(
    private readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly dates: ScheduleDateService
  ) {}

  countryName(project: CompdataProject, countryObjectId: number, reference?: DbProject): string {
    return this.countryObjectName(this.tree.object(project, countryObjectId), project, reference);
  }

  countryObjectName(country: CompdataObject | undefined, project: CompdataProject, reference?: DbProject): string {
    if (!country) return "Unknown country";
    const resolved = this.display.objectName(country, reference, project);
    if (resolved && resolved !== country.description) return resolved;
    const nationId = /^NationName_(\d+)$/i.exec(country.description)?.[1];
    const nation = nationId ? nations.find((candidate) => candidate.id === Number(nationId)) : undefined;
    return nation?.name ?? country.shortName ?? `Country ${country.id}`;
  }

  monthName(month: number): string {
    return this.monthNames[month - 1] ?? `Month ${month}`;
  }

  formatTime(time: string | number): string {
    return this.dates.formatTimeHHMM(time);
  }

  parseTime(time: string): string {
    return this.dates.parseTimeToHHMM(time);
  }

  rawLine(entry: CompdataWeatherEntry): string {
    return [
      entry.countryObjectId,
      entry.month,
      entry.dryChance,
      entry.rainChance,
      entry.snowChance,
      entry.overcastChance,
      entry.sunsetTime,
      entry.nightTime
    ].join(",");
  }
}
