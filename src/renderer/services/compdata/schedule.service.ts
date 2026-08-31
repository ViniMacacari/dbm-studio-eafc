import { Injectable } from "@angular/core";
import type {
  CompdataCompetitionSummary,
  CompdataObject,
  CompdataProject,
  CompdataScheduleEntry,
  CompdataSpecificFixtureEntry,
  CompdataSpecificScheduleFile
} from "../../../shared/types";
import { CompObjTreeService } from "./compobj-tree.service";
import { ScheduleDateService } from "./schedule-date.service";

export interface ScheduleTargetResolution {
  target?: CompdataObject;
  phase?: CompdataObject;
  group?: CompdataObject;
  competitionId?: number;
}

export interface MatchdayRuleRow {
  globalIndex: number;
  entry: CompdataScheduleEntry;
  target?: CompdataObject;
  phase?: CompdataObject;
  group?: CompdataObject;
}

export interface SpecificFixtureRow {
  fileIndex: number;
  fixtureIndex: number;
  file: CompdataSpecificScheduleFile;
  fixture: CompdataSpecificFixtureEntry;
  phase?: CompdataObject;
}

export interface MatchdayRuleDraft {
  targetObjectId: number;
  date: string;
  seasonBaseDate: string;
  roundNumber: number;
  minGames: number;
  maxGames: number;
  time: string;
}

export interface SpecificFixtureDraft {
  phaseId: number;
  year: number;
  date: string;
  time: string;
  homeTeamId: string;
  awayTeamId: string;
}

@Injectable({ providedIn: "root" })
export class ScheduleService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly dates: ScheduleDateService
  ) {}

  listMatchdayRules(project: CompdataProject, competition: CompdataCompetitionSummary): MatchdayRuleRow[] {
    return project.schedules
      .map((entry, globalIndex) => ({ entry, globalIndex, ...this.resolveTarget(project, entry.objectId) }))
      .filter((row) => row.competitionId === competition.id)
      .sort((a, b) => a.entry.day !== b.entry.day ? a.entry.day - b.entry.day : a.entry.round - b.entry.round);
  }

  addMatchdayRule(project: CompdataProject, draft: MatchdayRuleDraft): void {
    project.schedules.push(this.entryFromDraft(draft));
  }

  updateMatchdayRule(project: CompdataProject, globalIndex: number, draft: MatchdayRuleDraft): void {
    if (!project.schedules[globalIndex]) return;
    project.schedules[globalIndex] = {
      ...this.entryFromDraft(draft),
      originalRawLine: project.schedules[globalIndex].originalRawLine
    };
  }

  removeMatchdayRule(project: CompdataProject, globalIndex: number): void {
    project.schedules.splice(globalIndex, 1);
  }

  listSpecificFixtures(project: CompdataProject, competition: CompdataCompetitionSummary): SpecificFixtureRow[] {
    const stagesByCode = new Map(this.tree.phases(project, competition.id).map((stage) => [stage.shortName.toLowerCase(), stage]));
    const competitionCode = competition.shortName.toLowerCase();
    const rows: SpecificFixtureRow[] = [];

    this.ensureSpecificSchedules(project).forEach((file, fileIndex) => {
      if (file.competitionCode.toLowerCase() !== competitionCode) return;
      const phase = stagesByCode.get(file.stageCode.toLowerCase());
      if (!phase) return;
      file.fixtures.forEach((fixture, fixtureIndex) => rows.push({ fileIndex, fixtureIndex, file, fixture, phase }));
    });

    return rows.sort((a, b) => {
      if (a.fixture.date !== b.fixture.date) return a.fixture.date.localeCompare(b.fixture.date);
      if (a.fixture.time !== b.fixture.time) return a.fixture.time.localeCompare(b.fixture.time);
      return a.file.fileName.localeCompare(b.file.fileName);
    });
  }

  addSpecificFixture(project: CompdataProject, competition: CompdataObject | CompdataCompetitionSummary, draft: SpecificFixtureDraft): void {
    const phase = this.tree.object(project, draft.phaseId);
    if (!phase || phase.kind !== 4) return;
    const file = this.findOrCreateSpecificFile(project, competition.shortName, phase.shortName, draft.year);
    file.fixtures.push(this.fixtureFromDraft(draft));
  }

  updateSpecificFixture(project: CompdataProject, competition: CompdataObject | CompdataCompetitionSummary, row: SpecificFixtureRow, draft: SpecificFixtureDraft): void {
    const phase = this.tree.object(project, draft.phaseId);
    if (!phase || phase.kind !== 4) return;
    const nextFixture = {
      ...this.fixtureFromDraft(draft),
      originalRawLine: row.fixture.originalRawLine
    };

    const sameSpecificFile = row.file.competitionCode.toLowerCase() === competition.shortName.toLowerCase()
      && row.file.stageCode.toLowerCase() === phase.shortName.toLowerCase()
      && row.file.year === Number(draft.year);

    if (sameSpecificFile) {
      row.file.fixtures[row.fixtureIndex] = nextFixture;
      return;
    }

    row.file.fixtures.splice(row.fixtureIndex, 1);
    const targetFile = this.findOrCreateSpecificFile(project, competition.shortName, phase.shortName, draft.year);
    targetFile.fixtures.push(nextFixture);
  }

  removeSpecificFixture(row: SpecificFixtureRow): void {
    row.file.fixtures.splice(row.fixtureIndex, 1);
  }

  importFixtures(project: CompdataProject, competition: CompdataObject | CompdataCompetitionSummary, phaseId: number, year: number, csv: string): number {
    const phase = this.tree.object(project, phaseId);
    if (!phase || phase.kind !== 4) return 0;
    const file = this.findOrCreateSpecificFile(project, competition.shortName, phase.shortName, year);
    const fixtures = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.toLowerCase().startsWith("date,"))
      .map((line) => line.split(",").map((part) => part.trim()))
      .filter((parts) => parts.length >= 4)
      .map((parts) => ({
        date: this.normalizeSpecificImportDate(parts[0]),
        time: this.dates.parseTimeToHHMM(parts[1]),
        homeTeamId: parts[2],
        awayTeamId: parts[3]
      }))
      .filter((fixture) => fixture.date && fixture.time && fixture.homeTeamId && fixture.awayTeamId);

    file.fixtures.push(...fixtures);
    return fixtures.length;
  }

  resolveTarget(project: CompdataProject, targetObjectId: number): ScheduleTargetResolution {
    const target = this.tree.object(project, targetObjectId);
    if (!target) return {};
    if (target.kind === 4) {
      return { target, phase: target, competitionId: target.parentId };
    }
    if (target.kind === 5) {
      const phase = this.tree.object(project, target.parentId);
      if (!phase || phase.kind !== 4) return { target, group: target };
      return { target, phase, group: target, competitionId: phase.parentId };
    }
    return { target };
  }

  ruleRawLine(entry: CompdataScheduleEntry): string {
    return [entry.objectId, entry.day, entry.round, entry.minGames, entry.maxGames, entry.time].join(",");
  }

  fixtureRawLine(fixture: CompdataSpecificFixtureEntry): string {
    return [fixture.date, fixture.time, fixture.homeTeamId, fixture.awayTeamId].join(",");
  }

  specificFileName(competitionCode: string, stageCode: string, year: number): string {
    return `${competitionCode}_${stageCode}_${year}`.toLowerCase();
  }

  private entryFromDraft(draft: MatchdayRuleDraft): CompdataScheduleEntry {
    return {
      objectId: Number(draft.targetObjectId),
      day: this.dates.dateToDayOffset(draft.date, draft.seasonBaseDate),
      round: Math.max(1, Math.trunc(Number(draft.roundNumber) || 1)),
      minGames: Math.max(0, Math.trunc(Number(draft.minGames) || 0)),
      maxGames: Math.max(0, Math.trunc(Number(draft.maxGames) || 0)),
      time: this.dates.parseTimeToHHMM(draft.time)
    };
  }

  private fixtureFromDraft(draft: SpecificFixtureDraft): CompdataSpecificFixtureEntry {
    return {
      date: this.dates.dateInputToSpecific(draft.date),
      time: this.dates.parseTimeToHHMM(draft.time),
      homeTeamId: String(draft.homeTeamId).trim(),
      awayTeamId: String(draft.awayTeamId).trim()
    };
  }

  private findOrCreateSpecificFile(project: CompdataProject, competitionCode: string, stageCode: string, year: number): CompdataSpecificScheduleFile {
    const schedules = this.ensureSpecificSchedules(project);
    const fileName = this.specificFileName(competitionCode, stageCode, year);
    const existing = schedules.find((file) =>
      file.competitionCode.toLowerCase() === competitionCode.toLowerCase()
      && file.stageCode.toLowerCase() === stageCode.toLowerCase()
      && file.year === Number(year)
    );
    if (existing) return existing;

    const created: CompdataSpecificScheduleFile = {
      fileName,
      competitionCode: competitionCode.toUpperCase(),
      stageCode: stageCode.toUpperCase(),
      year,
      fixtures: []
    };
    schedules.push(created);
    return created;
  }

  private ensureSpecificSchedules(project: CompdataProject): CompdataSpecificScheduleFile[] {
    project.specificSchedules ??= [];
    return project.specificSchedules;
  }

  private normalizeSpecificImportDate(value: string): string {
    const trimmed = value.trim();
    if (/^\d{8}$/.test(trimmed)) {
      return this.dates.specificDateToInput(trimmed) ? trimmed : "";
    }
    if (this.dates.isValidDateInput(trimmed)) {
      return this.dates.dateInputToSpecific(trimmed);
    }
    return "";
  }
}
