import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, EventEmitter, Output, ViewEncapsulation } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataObject, CompdataOpenProgress, CompdataProject, DbProject } from "../../../shared/types";
import type { DbMasterApi } from "../../services/dbmaster-api";
import { LoadingService } from "../../services/loading.service";
import { ToastService } from "../../services/toast.service";
import { CompObjAdvancedViewComponent } from "./compobj-advanced-view.component";
import { CompObjDisplayService, PHASE_OPTIONS } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import { CompObjValidationIssue, CompObjValidationService } from "../../services/compdata/compobj-validation.service";
import { CreateTournamentRequest, CreateTournamentWizardComponent } from "./create-tournament-wizard.component";
import { TournamentOverviewComponent } from "./tournament-overview.component";
import { TournamentPhaseDetailsComponent } from "./tournament-phase-details.component";
import { TournamentSidebarComponent } from "./tournament-sidebar.component";
import { TournamentTeamsSetupComponent } from "./tournament-teams-setup.component";
import { TournamentTeamSourcesComponent } from "./tournament-team-sources.component";
import { TournamentRulesSettingsComponent } from "./tournament-rules-settings.component";
import { TournamentAdvancementComponent } from "./tournament-advancement.component";
import { TournamentCalendarComponent } from "./tournament-calendar.component";
import { ContinentalQualificationComponent } from "./continental-qualification.component";
import { CountryWeatherComponent } from "./country-weather.component";
import { ScheduleDateService } from "../../services/compdata/schedule-date.service";
import { ScheduleService } from "../../services/compdata/schedule.service";
import { WeatherService } from "../../services/compdata/weather.service";
import { SettingsService } from "../../services/compdata/settings.service";
import { nations } from "../../../utils/get-nations/get-nations";

type EditorDialog = "create" | "addPhase" | "addChild" | "editTournament" | "editPhase" | "editPhaseQuantities" | "editChild" | "delete" | "validation" | "preview" | undefined;
type DeleteTarget = { kind: "tournament" | "phase" | "child"; object: CompdataObject };

@Component({
  selector: "app-compdata-editor-page",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TournamentSidebarComponent,
    TournamentOverviewComponent,
    TournamentPhaseDetailsComponent,
    TournamentTeamsSetupComponent,
    TournamentTeamSourcesComponent,
    TournamentRulesSettingsComponent,
    ContinentalQualificationComponent,
    TournamentAdvancementComponent,
    TournamentCalendarComponent,
    CountryWeatherComponent,
    CompObjAdvancedViewComponent,
    CreateTournamentWizardComponent
  ],
  templateUrl: "./compdata-editor-page.component.html",
  styleUrl: "./compdata-editor-page.component.scss",
  encapsulation: ViewEncapsulation.None
})
export class CompdataEditorPageComponent {
  @Output() showHome = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<string>();

  compdataProject?: CompdataProject;
  compdataReferenceProject?: DbProject;
  compdataDirty = false;
  view: "simple" | "advanced" = "simple";
  activeTab: "structure" | "teams" | "sources" | "rules" | "continental" | "advancement" | "calendar" | "weather" = "structure";
  selectedTournamentId = 0;
  selectedPhaseId = 0;
  dialog: EditorDialog;
  deleteTarget?: DeleteTarget;

  readonly phaseOptions = PHASE_OPTIONS;
  phaseDraft = { key: "FCE_League_Stage", customKey: "", code: "S1", childCount: 1, teamsPerChild: 20 };
  phaseQuantitiesDraft = { groups: 1, teams: 20 };
  tournamentDraft = { nameKey: "", code: "", parentId: 0 };
  childDraft = { code: "G1", description: "", teams: 20 };

  private readonly api: DbMasterApi = window.dbmaster;
  private originalObjectIds = new Set<number>();
  private removedOriginalLines: string[] = [];
  private editingObjectId = 0;

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    public readonly display: CompObjDisplayService,
    public readonly tree: CompObjTreeService,
    private readonly validation: CompObjValidationService,
    private readonly schedule: ScheduleService,
    private readonly scheduleDates: ScheduleDateService,
    private readonly weather: WeatherService,
    private readonly settings: SettingsService,
    private readonly toast: ToastService,
    private readonly loading: LoadingService
  ) {}

  get selectedCompetition(): CompdataCompetitionSummary | undefined {
    return this.compdataProject?.competitions.find((competition) => competition.id === this.selectedTournamentId);
  }

  get selectedTournamentObject(): CompdataObject | undefined {
    const object = this.display.object(this.compdataProject, this.selectedTournamentId);
    return object?.kind === 3 ? object : undefined;
  }

  get selectedPhase(): CompdataObject | undefined {
    if (this.selectedPhaseId <= 0) return undefined;
    const object = this.display.object(this.compdataProject, this.selectedPhaseId);
    return object?.kind === 4 && object.parentId === this.selectedTournamentId ? object : undefined;
  }

  get locationOptions(): CompdataObject[] {
    const compOptions = this.compdataProject?.objects.filter((object) => object.kind === 0 || object.kind === 1) ?? [];
    const nationOptions: CompdataObject[] = nations.map((n) => ({ id: n.id, kind: 2, shortName: n.name, description: n.name, parentId: 0 }));
    return [...compOptions, ...nationOptions];
  }

  get effectivePhaseKey(): string {
    return this.phaseDraft.key === "custom" ? this.phaseDraft.customKey.trim() : this.phaseDraft.key;
  }

  get phaseDraftInfo() {
    return this.display.phaseInfo(this.effectivePhaseKey);
  }

  get phaseDraftChildNoun(): string {
    return this.display.childNoun({ id: 0, kind: 4, shortName: "", description: this.effectivePhaseKey, parentId: 0 }, 2);
  }

  get validationIssues(): CompObjValidationIssue[] {
    if (!this.compdataProject || !this.selectedCompetition) return [];
    return this.validation.validateTournament(this.compdataProject, this.selectedCompetition, this.compdataReferenceProject);
  }

  get validationHeading(): string {
    if (!this.validationIssues.length) return "Structure looks valid";
    return this.validationIssues.some((issue) => issue.severity === "error") ? "Structure has errors" : "Structure has warnings";
  }

  get previewObjects(): CompdataObject[] {
    if (!this.compdataProject || !this.selectedTournamentId) return [];
    return this.tree.tournamentObjects(this.compdataProject, this.selectedTournamentId);
  }

  get previewAdded(): number { return this.previewObjects.filter((object) => !this.originalObjectIds.has(object.id)).length; }
  get previewEdited(): number { return this.previewObjects.filter((object) => this.originalObjectIds.has(object.id) && object.originalRawLine && object.originalRawLine !== this.display.rawLine(object)).length; }
  get previewRemoved(): number { return this.removedOriginalLines.length; }

  get generatedStandingsLines(): string[] {
    if (!this.compdataProject || !this.selectedTournamentId) return [];
    const groupIds = new Set(this.previewObjects.filter(o => o.kind === 5).map(o => o.id));
    return this.compdataProject.standings
      .filter(s => groupIds.has(s.groupId))
      .sort((a, b) => a.groupId !== b.groupId ? a.groupId - b.groupId : a.position - b.position)
      .map(s => `${s.groupId},${s.position}`);
  }

  selectTournament(id: number): void {
    this.selectedTournamentId = id;
    this.selectedPhaseId = 0;
    this.activeTab = "structure";
  }

  openPhase(id: number): void {
    const phase = this.display.object(this.compdataProject, id);
    this.selectedPhaseId = phase?.kind === 4 && phase.parentId === this.selectedTournamentId ? id : 0;
  }

  openCreateWizard(): void { this.dialog = "create"; }

  openGlobalWeather(): void {
    this.selectedPhaseId = 0;
    this.activeTab = "weather";
  }

  createTournament(request: CreateTournamentRequest): void {
    if (!this.compdataProject) return;
    
    let resolvedParentId = request.locationId;
    let newCountryCreated = false;
    let maxId = this.nextObjectId() - 1;

    if (request.locationType === 2) {
      const targetDesc = `NationName_${request.locationId}`.toLowerCase();
      const existingCountry = this.compdataProject.objects.find(obj => obj.kind === 2 && obj.description.toLowerCase() === targetDesc);
      
      if (existingCountry) {
        resolvedParentId = existingCountry.id;
      } else {
        const nation = nations.find(n => n.id === request.locationId);
        if (!nation) {
          this.toast.show("DBM Studio could not create the country entry in compobj.", "error");
          return;
        }
        
        const shortCode = nation.name.substring(0, 4).toUpperCase();
        maxId++;
        const newCountryId = maxId;
        // Since we don't have confederation data in nations constant, we use fallback 0 (World)
        this.compdataProject.objects.push({ id: newCountryId, kind: 2, shortName: shortCode, description: `NationName_${nation.id}`, parentId: 0 });
        resolvedParentId = newCountryId;
        newCountryCreated = true;
      }
    } else {
      const parent = this.tree.object(this.compdataProject, request.locationId);
      if (!parent || parent.kind < 0 || parent.kind > 2) {
        this.toast.show("Choose a valid Country, Confederation or World/FIFA location from compobj.txt.", "error");
        return;
      }
      resolvedParentId = parent.id;
    }

    if (request.locationType === 2) {
      this.applyCountryWeatherRequest(request, resolvedParentId);
    }

    maxId++;
    const tournamentId = maxId;
    this.compdataProject.objects.push({ id: tournamentId, kind: 3, shortName: request.internalCode, description: request.nameKey, parentId: resolvedParentId });
    this.compdataProject.compIds.push(tournamentId);
    
    if (request.template === "league") {
      maxId++;
      const phaseId = maxId;
      this.compdataProject.objects.push({ id: phaseId, kind: 4, shortName: "S1", description: "FCE_League_Stage", parentId: tournamentId });
      const leagueGroups = request.leagueGroups || 1;
      const leagueTeams = request.leagueTeams || 20;
      for (let i = 0; i < leagueGroups; i++) {
        maxId++;
        const groupId = maxId;
        this.compdataProject.objects.push({ id: groupId, kind: 5, shortName: `G${i + 1}`, description: "", parentId: phaseId });
        this.tree.createStandingsForGroup(this.compdataProject, groupId, leagueTeams);
      }
    } else if (request.template === "empty") {
      // no phases
    } else if (request.template === "groupStage") {
      maxId++;
      const phaseId = maxId;
      this.compdataProject.objects.push({ id: phaseId, kind: 4, shortName: "S1", description: "FCE_Group_Stage", parentId: tournamentId });
      const groupStageGroups = request.groupStageGroups || 8;
      const groupStageTeams = request.groupStageTeams || 4;
      for (let i = 0; i < groupStageGroups; i++) {
        maxId++;
        const groupId = maxId;
        this.compdataProject.objects.push({ id: groupId, kind: 5, shortName: `G${i + 1}`, description: "", parentId: phaseId });
        this.tree.createStandingsForGroup(this.compdataProject, groupId, groupStageTeams);
      }
    } else if (request.template === "cup") {
      const cupInitialTeams = request.cupInitialTeams || 16;
      const phasesToCreate: Array<{key: string, slots: number, teamsPerSlot: number}> = [
        { key: "FCE_Setup_Stage", slots: 1, teamsPerSlot: cupInitialTeams }
      ];
      if (cupInitialTeams >= 16) phasesToCreate.push({ key: "FCE_Round_1", slots: 8, teamsPerSlot: 2 });
      if (cupInitialTeams >= 8) phasesToCreate.push({ key: "FCE_Quarter_Finals", slots: 4, teamsPerSlot: 2 });
      if (cupInitialTeams >= 4) phasesToCreate.push({ key: "FCE_Semi_Finals", slots: 2, teamsPerSlot: 2 });
      if (cupInitialTeams >= 2) phasesToCreate.push({ key: "FCE_Final", slots: 1, teamsPerSlot: 2 });

      let currentPhaseIdx = 1;
      phasesToCreate.forEach((phase) => {
        maxId++;
        const phaseId = maxId;
        this.compdataProject!.objects.push({ id: phaseId, kind: 4, shortName: `S${currentPhaseIdx}`, description: String(phase.key), parentId: tournamentId });
        currentPhaseIdx++;
        for (let index = 0; index < phase.slots; index++) {
          maxId++;
          const groupId = maxId;
          this.compdataProject!.objects.push({ id: groupId, kind: 5, shortName: `G${index + 1}`, description: "", parentId: phaseId });
          this.tree.createStandingsForGroup(this.compdataProject!, groupId, phase.teamsPerSlot);
        }
      });
    }

    this.applyRulesRequest(request, tournamentId);

    if (request.initialTeams && request.initialTeams.length > 0) {
      request.initialTeams.forEach((tid, index) => {
        this.compdataProject!.initTeams.push({
          competitionId: tournamentId,
          position: index,
          teamId: tid
        });
      });
    }

    if (request.teamSources?.rules.length) {
      for (const rule of request.teamSources.rules) {
        this.compdataProject.tasks.push({
          competitionId: tournamentId,
          timing: rule.timing,
          action: rule.action,
          targetId: rule.targetId,
          param1: rule.param1,
          param2: rule.param2,
          param3: rule.param3
        });
      }
    }

    if (request.advancements && request.advancements.length > 0) {
      this.compdataProject!.advancements.push(...request.advancements);
    }

    if (request.calendar) {
      const phases = this.compdataProject.objects.filter((object) => object.kind === 4 && object.parentId === tournamentId);
      const phaseByCode = new Map(phases.map((phase) => [phase.shortName.toUpperCase(), phase]));
      for (const rule of request.calendar.rules) {
        const phase = phaseByCode.get(rule.phaseCode.toUpperCase());
        if (!phase) continue;
        this.compdataProject.schedules.push({
          objectId: phase.id,
          day: this.scheduleDates.dateToDayOffset(this.scheduleDates.monthDayToDateInput(rule.month, rule.day, request.calendar.seasonBaseDate || this.scheduleDates.defaultSeasonBaseDate), request.calendar.seasonBaseDate || this.scheduleDates.defaultSeasonBaseDate),
          round: Math.max(1, Math.trunc(Number(rule.roundNumber) || 1)),
          minGames: Math.max(0, Math.trunc(Number(rule.minGames) || 0)),
          maxGames: Math.max(0, Math.trunc(Number(rule.maxGames) || 0)),
          time: this.scheduleDates.parseTimeToHHMM(rule.time)
        });
      }
      for (const fixture of request.calendar.fixtures) {
        const phase = phaseByCode.get(fixture.phaseCode.toUpperCase());
        if (!phase) continue;
        this.schedule.addSpecificFixture(this.compdataProject, { id: tournamentId, shortName: request.internalCode, description: request.nameKey, parentId: resolvedParentId, stages: [], groups: [], settingsCount: 0, tasksCount: 0, scheduleCount: 0, standingsCount: 0, advancementCount: 0, initTeamsCount: 0 }, {
          phaseId: phase.id,
          year: fixture.year,
          date: this.scheduleDates.dateFromParts(fixture.year, fixture.month, fixture.day),
          time: fixture.time,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId
        });
      }
    }

    this.originalObjectIds.clear();
    
    // Add missing custom name implementation if there was one
    if (request.customName) {
      // Could push to a queue for .loc saving later, 
      // but UI handles it as warning for now.
    }
    this.afterStructureChange();
    this.selectTournament(tournamentId);
    if (request.template === "league" && request.locationType === 2) {
      this.activeTab = "continental";
    }
    this.dialog = undefined;
    this.statusChanged.emit(newCountryCreated ? "Country and tournament structure created" : "Tournament structure created");
  }

  private applyRulesRequest(request: CreateTournamentRequest, tournamentId: number): void {
    if (!this.compdataProject || !request.rules || request.rules.mode === "inherit") return;
    const rules = request.rules;
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "comp_type", rules.competitionType);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "standings_pointswin", rules.pointsWin);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "standings_pointsdraw", rules.pointsDraw);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "standings_pointsloss", rules.pointsLoss);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "rule_numsubsbench", rules.substitutesBench);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "rule_numsubsmatch", rules.substitutionsMatch);
    this.settings.setSingleSetting(this.compdataProject, tournamentId, "schedule_seasonstartmonth", rules.seasonStartMonth);
    this.settings.setMultiSetting(this.compdataProject, tournamentId, "standings_sort", rules.tieBreakers);
    this.settings.setMultiSetting(this.compdataProject, tournamentId, "match_endruleko1leg", rules.knockoutEndRules);
    if (rules.promotionCompetitionId) this.settings.setSingleSetting(this.compdataProject, tournamentId, "info_league_promo", rules.promotionCompetitionId);
    if (rules.relegationCompetitionId) this.settings.setSingleSetting(this.compdataProject, tournamentId, "info_league_releg", rules.relegationCompetitionId);
    if (rules.promotionPlayoffCompetitionId) this.settings.setSingleSetting(this.compdataProject, tournamentId, "schedule_forcecomp", rules.promotionPlayoffCompetitionId);

    const phases = this.compdataProject.objects.filter((object) => object.kind === 4 && object.parentId === tournamentId);
    for (const phase of phases) {
      const stage = this.stageSettingsForPhase(phase);
      this.settings.setSingleSetting(this.compdataProject, phase.id, "match_stagetype", stage.type);
      if (stage.situation) {
        this.settings.setSingleSetting(this.compdataProject, phase.id, "match_matchsituation", stage.situation);
      }
    }
  }

  private stageSettingsForPhase(phase: CompdataObject): { type: string; situation?: string } {
    if (/setup/i.test(phase.description)) return { type: "SETUP" };
    if (/quarter/i.test(phase.description)) return { type: "KO1LEG", situation: "QUARTER" };
    if (/semi/i.test(phase.description)) return { type: "KO1LEG", situation: "SEMI" };
    if (/third/i.test(phase.description)) return { type: "KO1LEG", situation: "THIRDPLACE" };
    if (/final/i.test(phase.description)) return { type: "KO1LEG", situation: "FINAL" };
    if (/round/i.test(phase.description)) return { type: "KO1LEG", situation: "ROUNDX" };
    if (phase.description === "FCE_Group_Stage") return { type: "GROUP", situation: "GROUP" };
    return { type: "LEAGUE", situation: "LEAGUE" };
  }

  private applyCountryWeatherRequest(request: CreateTournamentRequest, countryObjectId: number): void {
    if (!this.compdataProject || request.locationType !== 2) return;
    const country = this.tree.object(this.compdataProject, countryObjectId);
    if (!country || country.kind !== 2) return;
    const weatherRequest = request.countryWeather;
    if (!weatherRequest || weatherRequest.mode === "skip") {
      if (!this.weather.hasCompleteWeather(this.compdataProject, countryObjectId)) {
        this.toast.show(`${this.display.objectName(country, this.compdataReferenceProject, this.compdataProject)} has no complete weather profile configured.`, "warn");
      }
      return;
    }

    if (weatherRequest.mode === "copy" && weatherRequest.sourceCountryObjectId) {
      this.weather.copyFromCountry(this.compdataProject, weatherRequest.sourceCountryObjectId, countryObjectId);
      return;
    }

    this.weather.applyPreset(this.compdataProject, countryObjectId, weatherRequest.preset ?? "temperate", "all");
  }

  openAddPhase(): void {
    if (!this.compdataProject || !this.selectedTournamentId) return;
    const phases = this.tree.phases(this.compdataProject, this.selectedTournamentId);
    this.phaseDraft = { key: "FCE_League_Stage", customKey: "", code: this.nextCode(phases, "S"), childCount: 1, teamsPerChild: 20 };
    this.dialog = "addPhase";
  }

  addPhase(): void {
    if (!this.compdataProject || !this.selectedTournamentId || !this.effectivePhaseKey || !this.phaseDraft.code.trim()) return;
    const phase = this.createPhase(this.selectedTournamentId, this.effectivePhaseKey, this.phaseDraft.code.trim(), Math.max(0, Math.trunc(this.phaseDraft.childCount || 0)), Math.max(0, Math.trunc(this.phaseDraft.teamsPerChild || 0)));
    this.afterStructureChange();
    this.dialog = undefined;
    this.openPhase(phase.id);
  }

  openAddChild(): void {
    if (!this.compdataProject || !this.selectedPhase) return;
    const isKnockout = this.display.isKnockoutPhase(this.selectedPhase);
    this.childDraft = { code: this.nextCode(this.tree.groups(this.compdataProject, this.selectedPhase.id), "G"), description: "", teams: isKnockout ? 2 : 20 };
    this.dialog = "addChild";
  }

  addChild(): void {
    if (!this.compdataProject || !this.selectedPhase || !this.childDraft.code.trim()) return;
    const groupId = this.nextObjectId();
    this.compdataProject.objects.push({ id: groupId, kind: 5, shortName: this.childDraft.code.trim(), description: this.childDraft.description.trim(), parentId: this.selectedPhase.id });
    this.tree.createStandingsForGroup(this.compdataProject, groupId, this.childDraft.teams);
    this.afterStructureChange();
    this.dialog = undefined;
  }

  openEditTournament(): void {
    const object = this.selectedTournamentObject;
    if (!object) return;
    this.editingObjectId = object.id;
    this.tournamentDraft = { nameKey: object.description, code: object.shortName, parentId: object.parentId };
    this.dialog = "editTournament";
  }

  saveTournamentEdit(): void {
    const object = this.display.object(this.compdataProject, this.editingObjectId);
    if (!object || !this.tournamentDraft.nameKey.trim() || !this.tournamentDraft.code.trim()) return;
    object.description = this.tournamentDraft.nameKey.trim();
    object.shortName = this.tournamentDraft.code.trim();
    object.parentId = Number(this.tournamentDraft.parentId);
    this.afterStructureChange();
    this.dialog = undefined;
  }

  openEditPhase(id = this.selectedPhaseId): void {
    const phase = this.display.object(this.compdataProject, id);
    if (!phase) return;
    this.editingObjectId = phase.id;
    const known = PHASE_OPTIONS.some((option) => option.key === phase.description);
    this.phaseDraft = { key: known ? phase.description : "custom", customKey: known ? "" : phase.description, code: phase.shortName, childCount: 0, teamsPerChild: 20 };
    this.dialog = "editPhase";
  }

  savePhaseEdit(): void {
    const phase = this.display.object(this.compdataProject, this.editingObjectId);
    if (!phase || !this.effectivePhaseKey || !this.phaseDraft.code.trim()) return;
    phase.description = this.effectivePhaseKey;
    phase.shortName = this.phaseDraft.code.trim();
    this.afterStructureChange();
    this.dialog = undefined;
  }

  openEditPhaseQuantities(id = this.selectedPhaseId): void {
    const phase = this.display.object(this.compdataProject, id);
    if (!phase) return;
    this.editingObjectId = phase.id;
    const groups = this.tree.groups(this.compdataProject!, phase.id);
    const groupsCount = groups.length;
    let teamsCount = 0;
    if (groupsCount > 0) {
      teamsCount = this.tree.getPositionsCount(this.compdataProject!, groups[0].id);
    } else {
      teamsCount = this.display.isKnockoutPhase(phase) ? 2 : 20;
    }
    this.phaseQuantitiesDraft = { groups: groupsCount, teams: teamsCount };
    this.dialog = "editPhaseQuantities";
  }

  savePhaseQuantitiesEdit(): void {
    const phase = this.display.object(this.compdataProject, this.editingObjectId);
    if (!phase || !this.compdataProject) return;
    
    const groups = this.tree.groups(this.compdataProject, phase.id);
    const currentCount = groups.length;
    const targetCount = Math.max(0, Number(this.phaseQuantitiesDraft.groups));
    const targetTeams = Math.max(0, Number(this.phaseQuantitiesDraft.teams));

    const groupsToKeep = groups.slice(0, Math.min(currentCount, targetCount));
    for (const group of groupsToKeep) {
      this.tree.updateStandingsForGroup(this.compdataProject, group.id, targetTeams);
    }

    if (targetCount > currentCount) {
      let maxId = Math.max(0, ...this.compdataProject.objects.map(o => o.id));
      for (let index = currentCount; index < targetCount; index++) {
        maxId++;
        const groupId = maxId;
        this.compdataProject.objects.push({ id: groupId, kind: 5, shortName: `G${index + 1}`, description: "", parentId: phase.id });
        this.tree.createStandingsForGroup(this.compdataProject, groupId, targetTeams);
      }
    } else if (targetCount < currentCount) {
      const groupsToRemove = groups.slice(targetCount);
      const idsToRemove = new Set(groupsToRemove.map(g => g.id));
      this.compdataProject.objects = this.compdataProject.objects.filter(o => !idsToRemove.has(o.id));
      this.compdataProject.standings = this.compdataProject.standings.filter(s => !idsToRemove.has(s.groupId));
    }

    this.afterStructureChange();
    this.dialog = undefined;
  }

  openEditChild(id: number): void {
    const child = this.display.object(this.compdataProject, id);
    if (!child) return;
    this.editingObjectId = child.id;
    const teamsCount = this.compdataProject!.standings.filter(s => s.groupId === id).length;
    this.childDraft = { code: child.shortName, description: child.description, teams: teamsCount };
    this.dialog = "editChild";
  }

  saveChildEdit(): void {
    const child = this.display.object(this.compdataProject, this.editingObjectId);
    if (!child || !this.childDraft.code.trim()) return;
    child.shortName = this.childDraft.code.trim();
    child.description = this.childDraft.description.trim();
    
    this.tree.updateStandingsForGroup(this.compdataProject!, child.id, Number(this.childDraft.teams));

    this.afterStructureChange();
    this.dialog = undefined;
  }

  requestDelete(kind: DeleteTarget["kind"], id: number): void {
    const object = this.display.object(this.compdataProject, id);
    if (!object) return;
    this.deleteTarget = { kind, object };
    this.dialog = "delete";
  }

  confirmDelete(): void {
    if (!this.compdataProject || !this.deleteTarget) return;
    const { kind, object } = this.deleteTarget;
    const targets = kind === "tournament" || kind === "phase" ? this.tree.tournamentObjects(this.compdataProject, object.id) : [object];
    const ids = new Set(targets.map((target) => target.id));
    targets.forEach((target) => { if (target.originalRawLine) this.removedOriginalLines.push(target.originalRawLine); });
    this.compdataProject.objects = this.compdataProject.objects.filter((candidate) => !ids.has(candidate.id));
    this.compdataProject.standings = this.compdataProject.standings.filter((s) => !ids.has(s.groupId));
    if (kind === "tournament") {
      this.compdataProject.compIds = this.compdataProject.compIds.filter((id) => id !== object.id);
      this.selectedTournamentId = 0;
      this.selectedPhaseId = 0;
    } else if (kind === "phase") {
      this.selectedPhaseId = 0;
    }
    this.afterStructureChange();
    this.dialog = undefined;
    this.deleteTarget = undefined;
  }

  openValidation(): void { this.dialog = "validation"; }
  openPreview(): void { this.dialog = "preview"; }
  closeDialog(): void { this.dialog = undefined; this.deleteTarget = undefined; }

  async openCompdataFolder(): Promise<void> {
    const selection = await this.api.pickCompdataFolder();
    if (!selection.folderPath) return;
    let removeListener: (() => void) | undefined;
    try {
      this.loading.show("Opening tournament files", "Reading compobj.txt");
      removeListener = this.api.onCompdataOpenProgress((progress: CompdataOpenProgress) => this.loading.show("Opening tournament files", progress.message));
      const result = await this.api.openCompdataFolder(selection.folderPath);
      if (!result.projectJson) {
        if (result.error) this.toast.show(result.error, "error");
        return;
      }
      this.compdataProject = JSON.parse(result.projectJson) as CompdataProject;
      this.compdataProject.tasks ??= [];
      this.compdataProject.settings ??= [];
      this.compdataProject.settingsInvalidLines ??= [];
      this.compdataProject.settingsRawLines ??= [];
      this.compdataProject.settingsTrailingNewline ??= false;
      this.compdataProject.specificSchedules ??= [];
      this.compdataProject.taskInvalidLines ??= [];
      this.compdataProject.weatherEntries ??= [];
      this.compdataProject.weatherInvalidLines ??= [];
      this.compdataReferenceProject = undefined;
      this.originalObjectIds = new Set(this.compdataProject.objects.map((object) => object.id));
      this.removedOriginalLines = [];
      this.compdataDirty = false;
      this.selectedTournamentId = this.compdataProject.competitions[0]?.id ?? 0;
      this.selectedPhaseId = 0;
      this.view = "simple";
      this.statusChanged.emit(`${this.compdataProject.title} loaded`);
      if (this.compdataProject.warnings.length) this.toast.show(this.compdataProject.warnings[0], "warn");
      await this.loadTranslatedNames();
      this.loading.show("Preparing tournament editor", "Indexing tournament structure");
      this.tree.prime(this.compdataProject);
      this.validation.prime(this.compdataProject, this.compdataReferenceProject);
      this.changeDetector.detectChanges();
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      removeListener?.();
      this.loading.hide();
    }
  }

  async loadTranslatedNames(): Promise<void> {
    try {
      this.loading.show("Loading translated names", "Select the localization reference files");
      const result = await this.api.openCompdataLocalizationReference();
      if (result.referenceProject) {
        this.display.primeLocalization(result.referenceProject);
        this.compdataReferenceProject = result.referenceProject;
        if (this.compdataProject) {
          this.validation.invalidate(this.compdataProject);
          this.validation.prime(this.compdataProject, result.referenceProject);
        }
        this.statusChanged.emit("Translated tournament names loaded");
      }
      if (result.warnings.length) this.toast.show(result.warnings[0], "warn");
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.loading.hide();
    }
  }

  async saveCompdata(): Promise<void> {
    if (!this.compdataProject) return;
    try {
      this.loading.show("Saving tournament structure", "Writing compobj.txt");
      const result = await this.api.saveCompdata(this.compdataProject);
      this.compdataDirty = false;
      this.originalObjectIds = new Set(this.compdataProject.objects.map((object) => object.id));
      this.compdataProject.objects.forEach((object) => object.originalRawLine = this.display.rawLine(object));
      this.compdataProject.settings.forEach((setting) => setting.originalRawLine = [setting.objectId, setting.key, setting.value].join(","));
      this.compdataProject.tasks.forEach((task) => task.originalRawLine = [task.competitionId, task.timing, task.action, task.targetId, task.param1, task.param2, task.param3].join(","));
      this.compdataProject.schedules.forEach((schedule) => schedule.originalRawLine = [schedule.objectId, schedule.day, schedule.round, schedule.minGames, schedule.maxGames, schedule.time].join(","));
      this.compdataProject.specificSchedules?.forEach((file) => file.fixtures.forEach((fixture) => fixture.originalRawLine = [fixture.date, fixture.time, fixture.homeTeamId, fixture.awayTeamId].join(",")));
      this.compdataProject.weatherEntries?.forEach((weather) => weather.originalRawLine = [weather.countryObjectId, weather.month, weather.dryChance, weather.rainChance, weather.snowChance, weather.overcastChance, weather.sunsetTime, weather.nightTime].join(","));
      this.removedOriginalLines = [];
      this.statusChanged.emit(`${result.filesWritten} compdata file(s) saved`);
      if (result.warnings.length) this.toast.show(result.warnings[0], "warn");
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.loading.hide();
    }
  }

  private createPhase(tournamentId: number, key: string, code: string, childCount: number, teamsPerChild: number): CompdataObject {
    if (!this.compdataProject) throw new Error("No tournament files loaded.");
    const phase: CompdataObject = { id: this.nextObjectId(), kind: 4, shortName: code, description: key, parentId: tournamentId };
    this.compdataProject.objects.push(phase);
    for (let index = 0; index < childCount; index += 1) {
      const groupId = this.nextObjectId();
      this.compdataProject.objects.push({ id: groupId, kind: 5, shortName: `G${index + 1}`, description: "", parentId: phase.id });
      this.tree.createStandingsForGroup(this.compdataProject, groupId, teamsPerChild);
    }
    return phase;
  }

  private nextObjectId(): number {
    return Math.max(0, ...(this.compdataProject?.objects.map((object) => object.id) ?? [0])) + 1;
  }

  private nextCode(objects: CompdataObject[], prefix: string): string {
    const used = new Set(objects.map((object) => object.shortName.toUpperCase()));
    let index = 1;
    while (used.has(`${prefix}${index}`)) index += 1;
    return `${prefix}${index}`;
  }

  private afterStructureChange(): void {
    if (this.compdataProject) {
      this.tree.invalidate(this.compdataProject);
      this.validation.invalidateTournament(this.compdataProject, this.selectedTournamentId);
    }
    this.compdataDirty = true;
    this.refreshCompetitionSummaries();
  }

  afterSettingsChange(settingsCountChanged = false): void {
    this.compdataDirty = true;
    if (settingsCountChanged) {
      this.refreshCompetitionSummaries();
    }
  }

  afterContinentalQualificationChange(): void {
    this.compdataDirty = true;
    this.refreshCompetitionSummaries();
  }

  afterGlobalWeatherChange(): void {
    if (this.compdataProject) {
      this.tree.invalidate(this.compdataProject);
      this.validation.invalidate(this.compdataProject);
    }
    this.compdataDirty = true;
    this.refreshCompetitionSummaries();
  }

  private refreshCompetitionSummaries(): void {
    if (!this.compdataProject) return;
    const project = this.compdataProject;
    const competitionIds = [...new Set([...project.compIds, ...project.objects.filter((object) => object.kind === 3).map((object) => object.id)])];
    project.competitions = competitionIds.map((id) => {
      const competition = this.display.object(project, id);
      if (!competition) return undefined;
      const objects = this.tree.tournamentObjects(project, id);
      const objectIds = new Set(objects.map((object) => object.id));
      const stages = objects.filter((object) => object.kind === 4);
      const groups = objects.filter((object) => object.kind === 5);
      const stageCodes = new Set(stages.map((stage) => stage.shortName.toLowerCase()));
      const groupIds = new Set(groups.map((group) => group.id));
      const scheduleRulesCount = project.schedules.filter((schedule) => objectIds.has(schedule.objectId)).length;
      const fixtureCount = (project.specificSchedules ?? [])
        .filter((file) => file.competitionCode.toLowerCase() === competition.shortName.toLowerCase() && stageCodes.has(file.stageCode.toLowerCase()))
        .reduce((sum, file) => sum + file.fixtures.length, 0);
      return {
        id,
        shortName: competition.shortName,
        description: competition.description,
        parentId: competition.parentId,
        stages,
        groups,
        settingsCount: project.settings.filter((setting) => objectIds.has(setting.objectId)).length,
        tasksCount: project.tasks.filter((task) => task.competitionId === id).length,
        scheduleCount: scheduleRulesCount + fixtureCount,
        standingsCount: project.standings.filter((standing) => groupIds.has(standing.groupId)).length,
        advancementCount: project.advancements.filter((advancement) => groupIds.has(advancement.fromGroupId) || groupIds.has(advancement.toGroupId)).length,
        initTeamsCount: project.initTeams.filter((team) => team.competitionId === id).length
      } satisfies CompdataCompetitionSummary;
    }).filter((competition): competition is CompdataCompetitionSummary => Boolean(competition));
  }
}
