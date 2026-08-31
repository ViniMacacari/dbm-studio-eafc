export type FieldKind =
  | "integer"
  | "float"
  | "string"
  | "shortCompressedString"
  | "longCompressedString"
  | "unknown";

export interface FieldDescriptor {
  name: string;
  shortName?: string;
  kind: FieldKind;
  rangeLow: number;
  rangeHigh: number;
  depth?: number;
  bitOffset?: number;
  dbFieldType?: number;
  order?: number;
  raw?: Record<string, unknown>;
}

export interface TableDescriptor {
  name: string;
  shortName?: string;
  fields: FieldDescriptor[];
  recordCount?: number;
  maxInsert?: number;
  maxDelete?: number;
  offset?: number;
  recordSizeBits?: number;
  raw?: Record<string, unknown>;
}

export interface DataTable {
  name: string;
  columns: string[];
  fields: FieldDescriptor[];
  rows: string[][];
  changed?: boolean;
  warning?: string;
}

export interface CompdataObject {
  id: number;
  kind: number;
  shortName: string;
  description: string;
  parentId: number;
  originalRawLine?: string;
}

export interface CompdataSetting {
  objectId: number;
  key: string;
  value: string;
  originalRawLine?: string;
  sourceLine?: number;
}

export interface CompdataTask {
  competitionId: number;
  timing: string;
  action: string;
  targetId: number;
  param1: string;
  param2: string;
  param3: string;
  originalRawLine?: string;
}

export interface CompdataScheduleEntry {
  objectId: number;
  day: number;
  round: number;
  minGames: number;
  maxGames: number;
  time: string;
  originalRawLine?: string;
}

export interface CompdataSpecificFixtureEntry {
  date: string;
  time: string;
  homeTeamId: string;
  awayTeamId: string;
  originalRawLine?: string;
}

export interface CompdataSpecificScheduleFile {
  fileName: string;
  competitionCode: string;
  stageCode: string;
  year: number;
  fixtures: CompdataSpecificFixtureEntry[];
}

export interface CompdataWeatherEntry {
  countryObjectId: number;
  month: number;
  dryChance: number;
  rainChance: number;
  snowChance: number;
  overcastChance: number;
  sunsetTime: string;
  nightTime: string;
  originalRawLine?: string;
}

export interface CompdataInvalidRawLine {
  lineNumber: number;
  rawLine: string;
  reason: string;
  sourceLine?: number;
}

export interface CompdataStandingSlot {
  groupId: number;
  position: number;
}

export interface CompdataAdvancement {
  fromGroupId: number;
  fromPosition: number;
  toGroupId: number;
  toPosition: number;
}

export interface CompdataInitTeam {
  competitionId: number;
  position: number;
  teamId: string;
}

export interface CompdataCompetitionSummary {
  id: number;
  shortName: string;
  description: string;
  parentId: number;
  stages: CompdataObject[];
  groups: CompdataObject[];
  settingsCount: number;
  tasksCount: number;
  scheduleCount: number;
  standingsCount: number;
  advancementCount: number;
  initTeamsCount: number;
}

export interface CompdataProject {
  title: string;
  folderPath: string;
  objects: CompdataObject[];
  compIds: number[];
  settings: CompdataSetting[];
  settingsInvalidLines?: CompdataInvalidRawLine[];
  settingsRawLines?: string[];
  settingsTrailingNewline?: boolean;
  tasks: CompdataTask[];
  taskInvalidLines: CompdataInvalidRawLine[];
  schedules: CompdataScheduleEntry[];
  specificSchedules: CompdataSpecificScheduleFile[];
  standings: CompdataStandingSlot[];
  advancements: CompdataAdvancement[];
  initTeams: CompdataInitTeam[];
  weatherEntries: CompdataWeatherEntry[];
  weatherInvalidLines: CompdataInvalidRawLine[];
  weatherRows: string[][];
  activeTeamsRows: string[][];
  objectiveRows: string[][];
  warnings: string[];
  competitions: CompdataCompetitionSummary[];
}

export interface CompdataOpenProgress {
  phase: "selecting" | "reading" | "parsing" | "building" | "loaded" | "error";
  fileName?: string;
  currentStep: number;
  totalSteps: number;
  percent: number;
  message: string;
}

export interface DbProject {
  title: string;
  sourceKind: "database" | "xml" | "text-folder" | "snapshot";
  xmlPath?: string;
  dbPath?: string;
  folderPath?: string;
  tables: DataTable[];
  descriptors: TableDescriptor[];
  warnings: string[];
  binaryReadMode?: "none" | "descriptor" | "best-effort";
  databaseWritable?: boolean;
  localization?: LocalizationProject;
}

export interface LocalizationProject {
  title: string;
  sourceKind: "database";
  xmlPath: string;
  dbPath: string;
  tables: DataTable[];
  descriptors: TableDescriptor[];
  warnings: string[];
  binaryReadMode?: "none" | "descriptor" | "best-effort";
  databaseWritable?: boolean;
}

export interface OpenResult {
  canceled?: boolean;
  project?: DbProject;
  warnings?: string[];
  error?: string;
}

export interface BigEntry {
  name: string;
  offset: number;
  size: number;
  compressed: boolean;
}

export interface BigExtractResult {
  canceled?: boolean;
  archivePath?: string;
  outputFolder?: string;
  entries: BigEntry[];
  warnings: string[];
}

export interface VisualDependencyStatus {
  id: string;
  label: string;
  fileName: string;
  downloadUrl: string;
  targetPath: string;
  installed: boolean;
  downloaded: boolean;
  current: boolean;
  updateAvailable: boolean;
  filesCount: number;
  downloadedSize: number;
  recordedDownloadedSize?: number;
  remoteSize?: number;
  remoteCheckError?: string;
}

export interface VisualDependenciesStatus {
  rootPath: string;
  dependencies: VisualDependencyStatus[];
  allInstalled: boolean;
  allCurrent: boolean;
}

export interface VisualDependenciesInstallResult extends VisualDependenciesStatus {
  installed: string[];
  skipped: string[];
  warnings: string[];
}

export type VisualAssetType = "hairs" | "beards" | "skin-tones";

export interface VisualDependencyProgress {
  id: string;
  label: string;
  phase: "queued" | "downloading" | "extracting" | "installed" | "error";
  receivedBytes: number;
  totalBytes?: number;
  percent: number;
  message: string;
}

export interface MinifaceImageResult {
  playerId: string;
  dataUrl: string;
  found: boolean;
  source: "player" | "generic" | "missing";
}

export interface TeamCrestImageResult {
  teamId: string;
  dataUrl: string;
  found: boolean;
  source: "team" | "missing";
}

export interface LeagueLogoImageResult {
  leagueId: string;
  dataUrl: string;
  found: boolean;
  source: "league" | "missing";
}
