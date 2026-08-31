import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  CompdataAdvancement,
  CompdataCompetitionSummary,
  CompdataInitTeam,
  CompdataInvalidRawLine,
  CompdataObject,
  CompdataOpenProgress,
  CompdataProject,
  CompdataScheduleEntry,
  CompdataSpecificFixtureEntry,
  CompdataSpecificScheduleFile,
  CompdataSetting,
  CompdataStandingSlot,
  CompdataTask,
  CompdataWeatherEntry
} from "../shared/types";

type CompdataOpenProgressCallback = (progress: CompdataOpenProgress) => void;

const mainCompdataFiles = [
  "compobj.txt",
  "compids.txt",
  "settings.txt",
  "tasks.txt",
  "schedule.txt",
  "standings.txt",
  "advancement.txt",
  "initteams.txt",
  "weather.txt",
  "activeteams.txt",
  "objectives.txt"
];

const requiredCompdataFiles = ["compobj.txt"];

function emitProgress(
  onProgress: CompdataOpenProgressCallback | undefined,
  phase: CompdataOpenProgress["phase"],
  currentStep: number,
  totalSteps: number,
  message: string,
  fileName?: string
): void {
  onProgress?.({
    phase,
    fileName,
    currentStep,
    totalSteps,
    percent: totalSteps > 0 ? Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100))) : 0,
    message
  });
}

function readOptionalText(folderPath: string, filesByLowerName: Map<string, string>, fileName: string, warnings: string[], warnIfMissing = true): string {
  const match = filesByLowerName.get(fileName.toLowerCase());
  if (!match) {
    if (warnIfMissing) {
      warnings.push(`${fileName} was not found.`);
    }
    return "";
  }
  return readFileSync(join(folderPath, match), "utf8");
}

function hasFile(filesByLowerName: Map<string, string>, fileName: string): boolean {
  return filesByLowerName.has(fileName.toLowerCase());
}

function rows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").map((part) => part.trim()));
}

function numberValue(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strictInteger(value: string | undefined): number | undefined {
  if (!value || !/^-?\d+$/.test(value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseObjects(text: string, warnings: string[]): CompdataObject[] {
  return text
    .split(/\r?\n/)
    .map((rawLine, sourceIndex) => ({ rawLine: rawLine.trim(), sourceIndex }))
    .filter(({ rawLine }) => rawLine && !rawLine.startsWith("#"))
    .map(({ rawLine, sourceIndex }) => {
      const row = rawLine.split(",").map((part) => part.trim());
      if (row.length < 5) {
        warnings.push(`compobj.txt line ${sourceIndex + 1} has ${row.length} column(s); expected 5.`);
      }
      return {
        id: numberValue(row[0]),
        kind: numberValue(row[1]),
        shortName: row[2] ?? "",
        description: row[3] ?? "",
        parentId: numberValue(row[4], -1),
        originalRawLine: rawLine
      };
    });
}

function parseCompIds(text: string): number[] {
  return rows(text).map((row) => numberValue(row[0])).filter((id) => id > 0);
}

function parseSettings(text: string, warnings: string[]): { entries: CompdataSetting[]; invalidLines: CompdataInvalidRawLine[]; rawLines: string[]; trailingNewline: boolean } {
  const entries: CompdataSetting[] = [];
  const invalidLines: CompdataInvalidRawLine[] = [];
  const trailingNewline = /\r?\n$/.test(text);
  const rawLines = text ? text.split(/\r?\n/) : [];
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  rawLines.forEach((sourceLine, sourceIndex) => {
    const rawLine = sourceLine.trim();
    if (!rawLine || rawLine.startsWith("#")) {
      return;
    }
    const row = rawLine.split(",").map((part) => part.trim());
    if (row.length < 3) {
      const reason = `settings.txt line ${sourceIndex + 1} has ${row.length} column(s); expected at least 3.`;
      warnings.push(reason);
      invalidLines.push({ lineNumber: sourceIndex + 1, sourceLine: sourceIndex, rawLine, reason });
      return;
    }
    const objectId = strictInteger(row[0]);
    if (objectId === undefined) {
      const reason = `settings.txt line ${sourceIndex + 1} has an invalid object id.`;
      warnings.push(reason);
      invalidLines.push({ lineNumber: sourceIndex + 1, sourceLine: sourceIndex, rawLine, reason });
      return;
    }
    entries.push({
      objectId,
      key: row[1] ?? "",
      value: row.slice(2).join(","),
      originalRawLine: rawLine,
      sourceLine: sourceIndex
    });
  });

  return { entries, invalidLines, rawLines, trailingNewline };
}

function parseTasks(text: string, warnings: string[]): { entries: CompdataTask[]; invalidLines: CompdataInvalidRawLine[] } {
  const entries: CompdataTask[] = [];
  const invalidLines: CompdataInvalidRawLine[] = [];

  text.split(/\r?\n/).forEach((sourceLine, sourceIndex) => {
    const rawLine = sourceLine.trim();
    if (!rawLine || rawLine.startsWith("#")) {
      return;
    }
    const row = rawLine.split(",").map((part) => part.trim());
    if (row.length < 7) {
      const reason = `tasks.txt line ${sourceIndex + 1} has ${row.length} column(s); expected 7.`;
      warnings.push(reason);
      invalidLines.push({ lineNumber: sourceIndex + 1, rawLine, reason });
      return;
    }
    entries.push({
      competitionId: numberValue(row[0]),
      timing: row[1] ?? "",
      action: row[2] ?? "",
      targetId: numberValue(row[3]),
      param1: row[4] ?? "",
      param2: row[5] ?? "",
      param3: row[6] ?? "",
      originalRawLine: rawLine
    });
  });

  return { entries, invalidLines };
}

function parseSchedules(text: string): CompdataScheduleEntry[] {
  return text
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter((rawLine) => rawLine && !rawLine.startsWith("#"))
    .map((rawLine) => {
      const row = rawLine.split(",").map((part) => part.trim());
      return {
        objectId: numberValue(row[0]),
        day: numberValue(row[1]),
        round: numberValue(row[2]),
        minGames: numberValue(row[3]),
        maxGames: numberValue(row[4]),
        time: row[5] ?? "",
        originalRawLine: rawLine
      };
    });
}

function parseSpecificScheduleFileName(fileName: string): { competitionCode: string; stageCode: string; year: number } | undefined {
  const match = /^([a-z]\d+)_([a-z]\d+)_(\d{4})(?:\.txt)?$/i.exec(fileName.trim());
  if (!match) {
    return undefined;
  }
  return {
    competitionCode: match[1].toUpperCase(),
    stageCode: match[2].toUpperCase(),
    year: numberValue(match[3])
  };
}

function parseSpecificFixtures(text: string): CompdataSpecificFixtureEntry[] {
  return text
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter((rawLine) => rawLine && !rawLine.startsWith("#"))
    .map((rawLine) => {
      const row = rawLine.split(",").map((part) => part.trim());
      return {
        date: row[0] ?? "",
        time: row[1] ?? "",
        homeTeamId: row[2] ?? "",
        awayTeamId: row[3] ?? "",
        originalRawLine: rawLine
      };
    });
}

function parseWeather(text: string, warnings: string[]): { entries: CompdataWeatherEntry[]; invalidLines: CompdataInvalidRawLine[]; rowData: string[][] } {
  const entries: CompdataWeatherEntry[] = [];
  const invalidLines: CompdataInvalidRawLine[] = [];
  const rowData: string[][] = [];

  text.split(/\r?\n/).forEach((sourceLine, sourceIndex) => {
    const rawLine = sourceLine.trim();
    if (!rawLine || rawLine.startsWith("#")) {
      return;
    }

    const row = rawLine.split(",").map((part) => part.trim());
    rowData.push(row);
    if (row.length < 8) {
      const reason = `weather.txt line ${sourceIndex + 1} has ${row.length} column(s); expected 8.`;
      warnings.push(reason);
      invalidLines.push({ lineNumber: sourceIndex + 1, rawLine, reason });
      return;
    }

    const parsed = row.slice(0, 6).map((value) => strictInteger(value));
    if (parsed.some((value) => value === undefined)) {
      const reason = `weather.txt line ${sourceIndex + 1} has a non-numeric country, month or chance value.`;
      warnings.push(reason);
      invalidLines.push({ lineNumber: sourceIndex + 1, rawLine, reason });
      return;
    }

    entries.push({
      countryObjectId: parsed[0]!,
      month: parsed[1]!,
      dryChance: parsed[2]!,
      rainChance: parsed[3]!,
      snowChance: parsed[4]!,
      overcastChance: parsed[5]!,
      sunsetTime: row[6] ?? "",
      nightTime: row[7] ?? "",
      originalRawLine: rawLine
    });
  });

  return { entries, invalidLines, rowData };
}

function readSpecificScheduleFiles(folderPath: string, warnings: string[]): CompdataSpecificScheduleFile[] {
  const schedulesPath = join(folderPath, "schedules");
  if (!existsSync(schedulesPath)) {
    return [];
  }

  return readdirSync(schedulesPath)
    .map((fileName) => {
      const parsedName = parseSpecificScheduleFileName(fileName);
      if (!parsedName) {
        warnings.push(`schedules/${fileName} does not match the expected competition_stage_year naming pattern.`);
        return undefined;
      }
      const text = readFileSync(join(schedulesPath, fileName), "utf8");
      return {
        fileName,
        competitionCode: parsedName.competitionCode,
        stageCode: parsedName.stageCode,
        year: parsedName.year,
        fixtures: parseSpecificFixtures(text)
      } satisfies CompdataSpecificScheduleFile;
    })
    .filter((file): file is CompdataSpecificScheduleFile => Boolean(file));
}

function parseStandings(text: string): CompdataStandingSlot[] {
  return rows(text).map((row) => ({
    groupId: numberValue(row[0]),
    position: numberValue(row[1])
  }));
}

function parseAdvancements(text: string): CompdataAdvancement[] {
  return rows(text).map((row) => ({
    fromGroupId: numberValue(row[0]),
    fromPosition: numberValue(row[1]),
    toGroupId: numberValue(row[2]),
    toPosition: numberValue(row[3])
  }));
}

function parseInitTeams(text: string): CompdataInitTeam[] {
  return rows(text).map((row) => ({
    competitionId: numberValue(row[0]),
    position: numberValue(row[1]),
    teamId: row[2] ?? ""
  }));
}

function descendantsByParent(objects: CompdataObject[]): Map<number, CompdataObject[]> {
  const byParent = new Map<number, CompdataObject[]>();
  for (const object of objects) {
    const children = byParent.get(object.parentId) ?? [];
    children.push(object);
    byParent.set(object.parentId, children);
  }
  return byParent;
}

function collectDescendantIds(rootId: number, byParent: Map<number, CompdataObject[]>): Set<number> {
  const ids = new Set<number>([rootId]);
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const object = stack.pop();
    if (!object || ids.has(object.id)) {
      continue;
    }
    ids.add(object.id);
    stack.push(...(byParent.get(object.id) ?? []));
  }
  return ids;
}

function competitionSummaries(
  objects: CompdataObject[],
  compIds: number[],
  settings: CompdataSetting[],
  tasks: CompdataTask[],
  schedules: CompdataScheduleEntry[],
  specificSchedules: CompdataSpecificScheduleFile[],
  standings: CompdataStandingSlot[],
  advancements: CompdataAdvancement[],
  initTeams: CompdataInitTeam[],
  warnings: string[]
): CompdataCompetitionSummary[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const byParent = descendantsByParent(objects);
  const type3Objects = objects.filter((object) => object.kind === 3);
  const type3IdsSet = new Set(type3Objects.map((object) => object.id));
  const compIdsSet = new Set(compIds);

  if (compIdsSet.size !== compIds.length) {
    warnings.push("compids.txt contains duplicate IDs.");
  }

  for (const id of compIdsSet) {
    const obj = byId.get(id);
    if (!obj) {
      warnings.push(`compids.txt references missing object ${id}.`);
    } else if (obj.kind !== 3 && obj.kind !== 6) {
      warnings.push(`compids.txt references object ${id} which is not a valid competition type (type 3 or 6).`);
    }
  }

  for (const id of type3IdsSet) {
    if (!compIdsSet.has(id)) {
      warnings.push(`compobj.txt contains Competition ${id} that is missing from compids.txt.`);
    }
  }

  const ids = [...new Set([...compIds, ...type3IdsSet])];

  return ids
    .map((id) => {
      const competition = byId.get(id);
      if (!competition || (competition.kind !== 3 && competition.kind !== 6)) {
        return undefined;
      }
      const descendantIds = collectDescendantIds(id, byParent);
      const stages = (byParent.get(id) ?? []).filter((object) => object.kind === 4);
      const stageIds = new Set(stages.map((stage) => stage.id));
      const stageCodes = new Set(stages.map((stage) => stage.shortName.toLowerCase()));
      const groups = [...descendantIds].map((candidate) => byId.get(candidate)).filter((object): object is CompdataObject => object?.kind === 5);
      const groupIds = new Set(groups.map((group) => group.id));
      const specificScheduleCount = specificSchedules
        .filter((file) => file.competitionCode.toLowerCase() === competition.shortName.toLowerCase() && stageCodes.has(file.stageCode.toLowerCase()))
        .reduce((sum, file) => sum + file.fixtures.length, 0);
      return {
        id: competition.id,
        shortName: competition.shortName,
        description: competition.description,
        parentId: competition.parentId,
        stages,
        groups,
        settingsCount: settings.filter((setting) => descendantIds.has(setting.objectId)).length,
        tasksCount: tasks.filter((task) => task.competitionId === id).length,
        scheduleCount: schedules.filter((schedule) => descendantIds.has(schedule.objectId) || stageIds.has(schedule.objectId) || groupIds.has(schedule.objectId)).length + specificScheduleCount,
        standingsCount: standings.filter((standing) => groupIds.has(standing.groupId)).length,
        advancementCount: advancements.filter((advancement) => groupIds.has(advancement.fromGroupId) || groupIds.has(advancement.toGroupId)).length,
        initTeamsCount: initTeams.filter((team) => team.competitionId === id).length
      };
    })
    .filter((summary): summary is CompdataCompetitionSummary => Boolean(summary));
}

export function openCompdataProject(folderPath: string, onProgress?: CompdataOpenProgressCallback): CompdataProject {
  const warnings: string[] = [];
  const filesByLowerName = new Map(readdirSync(folderPath).map((fileName) => [fileName.toLowerCase(), fileName]));
  const missingRequiredFiles = requiredCompdataFiles.filter((fileName) => !hasFile(filesByLowerName, fileName));
  if (missingRequiredFiles.length > 0) {
    throw new Error(`Compdata folder is missing required file(s): ${missingRequiredFiles.join(", ")}`);
  }
  const totalSteps = mainCompdataFiles.length + 11;
  let step = 0;
  const readFile = (fileName: string, warnIfMissing = false): string => {
    emitProgress(onProgress, "reading", step, totalSteps, `Reading ${fileName}`, fileName);
    const text = readOptionalText(folderPath, filesByLowerName, fileName, warnings, warnIfMissing);
    step += 1;
    emitProgress(onProgress, "reading", step, totalSteps, `${fileName} loaded`, fileName);
    return text;
  };
  const parseStep = <T>(message: string, parse: () => T): T => {
    emitProgress(onProgress, "parsing", step, totalSteps, message);
    const value = parse();
    step += 1;
    emitProgress(onProgress, "parsing", step, totalSteps, message);
    return value;
  };

  const compobj = readFile("compobj.txt", true);
  const compids = readFile("compids.txt");
  const settingsText = readFile("settings.txt");
  const tasksText = readFile("tasks.txt");
  const scheduleText = readFile("schedule.txt");
  const standingsText = readFile("standings.txt");
  const advancementText = readFile("advancement.txt");
  const initTeamsText = readFile("initteams.txt");
  const weatherText = readFile("weather.txt");
  const hasActiveTeams = hasFile(filesByLowerName, "activeteams.txt");
  const activeTeamsText = hasActiveTeams ? readFile("activeteams.txt") : "";
  if (!hasActiveTeams) {
    step += 1;
  }
  const hasObjectives = hasFile(filesByLowerName, "objectives.txt");
  const objectiveText = hasObjectives ? readFile("objectives.txt") : "";
  if (!hasObjectives) {
    step += 1;
  }
  const objects = parseStep("Parsing compobj.txt", () => parseObjects(compobj, warnings));
  const compIds = parseStep("Parsing compids.txt", () => parseCompIds(compids));
  const settings = parseStep("Parsing settings.txt", () => parseSettings(settingsText, warnings));
  const tasks = parseStep("Parsing tasks.txt", () => parseTasks(tasksText, warnings));
  const schedules = parseStep("Parsing schedule.txt", () => parseSchedules(scheduleText));
  const specificSchedules = parseStep("Parsing specific schedule files", () => readSpecificScheduleFiles(folderPath, warnings));
  const standings = parseStep("Parsing standings.txt", () => parseStandings(standingsText));
  const advancements = parseStep("Parsing advancement.txt", () => parseAdvancements(advancementText));
  const initTeams = parseStep("Parsing initteams.txt", () => parseInitTeams(initTeamsText));
  const weather = parseStep("Parsing weather.txt", () => parseWeather(weatherText, warnings));
  emitProgress(onProgress, "building", step, totalSteps, "Building competition summaries");
  const competitions = competitionSummaries(objects, compIds, settings.entries, tasks.entries, schedules, specificSchedules, standings, advancements, initTeams, warnings);
  step += 1;
  emitProgress(onProgress, "loaded", totalSteps, totalSteps, "Compdata loaded");

  return {
    title: basename(folderPath),
    folderPath,
    objects,
    compIds,
    settings: settings.entries,
    settingsInvalidLines: settings.invalidLines,
    settingsRawLines: settings.rawLines,
    settingsTrailingNewline: settings.trailingNewline,
    tasks: tasks.entries,
    taskInvalidLines: tasks.invalidLines,
    schedules,
    specificSchedules,
    standings,
    advancements,
    initTeams,
    weatherEntries: weather.entries,
    weatherInvalidLines: weather.invalidLines,
    weatherRows: weather.rowData,
    activeTeamsRows: activeTeamsText ? rows(activeTeamsText) : [],
    objectiveRows: objectiveText ? rows(objectiveText) : [],
    warnings,
    competitions
  };
}

function line(parts: Array<number | string>): string {
  return parts.map((part) => String(part)).join(",");
}

function settingLine(setting: CompdataSetting): string {
  return line([setting.objectId, setting.key, setting.value]);
}

function isParseableSettingLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }
  const row = trimmed.split(",").map((part) => part.trim());
  return row.length >= 3 && strictInteger(row[0]) !== undefined;
}

function serializeSettings(project: CompdataProject): string {
  const settings = project.settings ?? [];
  const rawLines = project.settingsRawLines;
  if (!rawLines) {
    const lines = [
      ...settings.map((setting) => settingLine(setting)),
      ...(project.settingsInvalidLines ?? []).map((invalid) => invalid.rawLine)
    ];
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  const bySourceLine = new Map<number, CompdataSetting[]>();
  const newSettings: CompdataSetting[] = [];
  for (const setting of settings) {
    if (typeof setting.sourceLine === "number") {
      const entries = bySourceLine.get(setting.sourceLine) ?? [];
      entries.push(setting);
      bySourceLine.set(setting.sourceLine, entries);
    } else {
      newSettings.push(setting);
    }
  }

  const output: string[] = [];
  const objectLastOutputIndex = new Map<number, number>();
  for (let index = 0; index < rawLines.length; index += 1) {
    const entries = bySourceLine.get(index);
    if (entries?.length) {
      for (const entry of entries) {
        output.push(settingLine(entry));
        objectLastOutputIndex.set(entry.objectId, output.length - 1);
      }
      continue;
    }

    const rawLine = rawLines[index] ?? "";
    if (!isParseableSettingLine(rawLine)) {
      output.push(rawLine);
      continue;
    }
  }

  for (const setting of newSettings) {
    const generated = settingLine(setting);
    const lastIndex = objectLastOutputIndex.get(setting.objectId);
    if (lastIndex === undefined) {
      output.push(generated);
      objectLastOutputIndex.set(setting.objectId, output.length - 1);
      continue;
    }
    output.splice(lastIndex + 1, 0, generated);
    for (const [objectId, index] of objectLastOutputIndex) {
      if (index > lastIndex) objectLastOutputIndex.set(objectId, index + 1);
    }
    objectLastOutputIndex.set(setting.objectId, lastIndex + 1);
  }

  const content = output.join("\n");
  return content + (content && project.settingsTrailingNewline ? "\n" : "");
}

export function saveCompdataProject(project: CompdataProject): { folderPath: string; filesWritten: number; warnings: string[] } {
  const compidsContent = project.objects
    .filter(obj => obj.kind === 3)
    .map(obj => String(obj.id))
    .join("\n") + (project.objects.some(obj => obj.kind === 3) ? "\n" : "");

  const writes: Array<{ fileName: string; content: string }> = [
    {
      fileName: "compobj.txt",
      content: `${project.objects.map((object) => line([object.id, object.kind, object.shortName, object.description, object.parentId])).join("\n")}\n`
    },
    {
      fileName: "compids.txt",
      content: compidsContent
    }
  ];

  const settingsContent = serializeSettings(project);
  const originalSettingsContent = Array.isArray(project.settingsRawLines)
    ? project.settingsRawLines.join("\n") + (project.settingsRawLines.length && project.settingsTrailingNewline ? "\n" : "")
    : "";
  if (settingsContent !== originalSettingsContent || (!Array.isArray(project.settingsRawLines) && settingsContent)) {
    writes.push({
      fileName: "settings.txt",
      content: settingsContent
    });
  }

  writes.push({
    fileName: "tasks.txt",
    content: [
      ...(project.tasks ?? []).map((task) => line([task.competitionId, task.timing, task.action, task.targetId, task.param1, task.param2, task.param3])),
      ...(project.taskInvalidLines ?? []).map((invalid) => invalid.rawLine)
    ].join("\n") + ((project.tasks?.length ?? 0) || (project.taskInvalidLines?.length ?? 0) ? "\n" : "")
  });

  if (project.standings.length > 0) {
    const sortedStandings = [...project.standings].sort((a, b) => {
      if (a.groupId !== b.groupId) {
        // Find the index of their group in the objects array to maintain compobj order
        const idxA = project.objects.findIndex(o => o.id === a.groupId);
        const idxB = project.objects.findIndex(o => o.id === b.groupId);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.groupId - b.groupId; // fallback
      }
      return a.position - b.position;
    });
    writes.push({
      fileName: "standings.txt",
      content: sortedStandings.map(s => line([s.groupId, s.position])).join("\n") + "\n"
    });
  }

  if (project.initTeams.length > 0) {
    const sortedInitTeams = [...project.initTeams].sort((a, b) => {
      if (a.competitionId !== b.competitionId) {
        const idxA = project.objects.findIndex(o => o.id === a.competitionId);
        const idxB = project.objects.findIndex(o => o.id === b.competitionId);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.competitionId - b.competitionId;
      }
      return a.position - b.position;
    });
    writes.push({
      fileName: "initteams.txt",
      content: sortedInitTeams.map(t => line([t.competitionId, t.position, t.teamId])).join("\n") + "\n"
    });
  }

  if (project.advancements && project.advancements.length > 0) {
    const sortedAdvancements = [...project.advancements].sort((a, b) => {
      // Sort by fromGroupId, then fromPosition
      if (a.fromGroupId !== b.fromGroupId) {
        const idxA = project.objects.findIndex(o => o.id === a.fromGroupId);
        const idxB = project.objects.findIndex(o => o.id === b.fromGroupId);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.fromGroupId - b.fromGroupId;
      }
      return a.fromPosition - b.fromPosition;
    });
    writes.push({
      fileName: "advancement.txt",
      content: sortedAdvancements.map(a => line([a.fromGroupId, a.fromPosition, a.toGroupId, a.toPosition])).join("\n") + "\n"
    });
  }

  writes.push({
    fileName: "schedule.txt",
    content: project.schedules.map((schedule) => line([schedule.objectId, schedule.day, schedule.round, schedule.minGames, schedule.maxGames, schedule.time])).join("\n") + (project.schedules.length ? "\n" : "")
  });

  const weatherEntries = project.weatherEntries ?? [];
  const weatherLines = weatherEntries
    .slice()
    .sort((a, b) => a.countryObjectId !== b.countryObjectId ? a.countryObjectId - b.countryObjectId : a.month - b.month)
    .map((weather) => line([weather.countryObjectId, weather.month, weather.dryChance, weather.rainChance, weather.snowChance, weather.overcastChance, weather.sunsetTime, weather.nightTime]));
  const preservedWeatherLines = (project.weatherInvalidLines ?? []).map((invalid) => invalid.rawLine);
  writes.push({
    fileName: "weather.txt",
    content: [...weatherLines, ...preservedWeatherLines].join("\n") + (weatherLines.length || preservedWeatherLines.length ? "\n" : "")
  });

  for (const write of writes) {
    writeFileSync(join(project.folderPath, write.fileName), write.content, "utf8");
  }

  let specificFilesWritten = 0;
  const specificSchedules = project.specificSchedules ?? [];
  if (specificSchedules.length > 0) {
    const schedulesPath = join(project.folderPath, "schedules");
    mkdirSync(schedulesPath, { recursive: true });
    for (const scheduleFile of specificSchedules) {
      const content = scheduleFile.fixtures
        .map((fixture) => line([fixture.date, fixture.time, fixture.homeTeamId, fixture.awayTeamId]))
        .join("\n") + (scheduleFile.fixtures.length ? "\n" : "");
      writeFileSync(join(schedulesPath, scheduleFile.fileName), content, "utf8");
      specificFilesWritten += 1;
    }
  }

  return {
    folderPath: project.folderPath,
    filesWritten: writes.length + specificFilesWritten,
    warnings: []
  };
}
