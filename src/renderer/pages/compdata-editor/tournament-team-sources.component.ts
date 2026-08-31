import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataProject, DbProject } from "../../../shared/types";
import { InputListComponent, InputListOption } from "../../components/input-list/input-list.component";
import { LeagueEditorService } from "../../services/league-editor.service";
import { TeamEditorService } from "../../services/team-editor.service";
import { TasksDisplayService } from "../../services/compdata/tasks-display.service";
import { KnownTaskAction, START_TASK_ACTIONS, TaskTiming, TasksService, TeamSourceTaskDraft, TeamSourceTaskRow } from "../../services/compdata/tasks.service";
import { TaskValidationIssue, TasksValidationService } from "../../services/compdata/tasks-validation.service";

type TeamSourcesDialog = "rule" | "generate" | "validation" | "preview" | undefined;

interface TaskRuleType {
  action: KnownTaskAction;
  label: string;
  description: string;
}

@Component({
  selector: "app-tournament-team-sources",
  standalone: true,
  imports: [CommonModule, FormsModule, InputListComponent],
  template: `
    <div class="tse-content">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Team Sources</div>
          <h1>Team Sources</h1>
          <p>Manage how teams enter this tournament and how results update future seasons.</p>
          <small class="tse-entity-note">Use this page to define where the tournament participants come from.</small>
        </div>
      </header>

      <div class="tse-summary-grid">
        <div><strong>{{ startRules.length }}</strong><span>Start rules</span></div>
        <div><strong>{{ endRules.length }}</strong><span>End rules</span></div>
        <div><strong>{{ manualClubsCount }}</strong><span>Manual clubs</span></div>
        <div [class.warn]="status !== 'OK'"><strong>{{ status }}</strong><span>Status</span></div>
      </div>
      <div class="tse-summary-grid three">
        <div><strong>{{ targetGroupsCount }}</strong><span>Target groups</span></div>
        <div><strong>{{ unknownRulesCount }}</strong><span>Advanced-only rules</span></div>
        <div><strong>{{ allRules.length }}</strong><span>Total rules</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="openAddStartRule()">Add start rule</button>
        <button type="button" (click)="openAddEndRule()">Add end rule</button>
        <button type="button" (click)="openGenerateCommonRules()">Generate common rules</button>
        <button type="button" (click)="openValidation()">Validate rules</button>
        <button type="button" (click)="openPreview()">Preview tasks.txt lines</button>
      </div>
      <div class="tse-field-help" *ngIf="!referenceProject">Team and league names are not available. IDs will be shown until a database is loaded.</div>

      <div class="tse-main-empty" *ngIf="allRules.length === 0">
        <strong>No team source rules configured yet</strong>
        <span>Add rules now or leave this tournament without automatic team sources.</span>
        <div>
          <button type="button" class="tse-primary" (click)="openAddStartRule()">Add start rule</button>
          <button type="button" (click)="openAddEndRule()">Add end rule</button>
        </div>
      </div>

      <section class="tse-section" *ngIf="startRules.length">
        <div class="tse-section-heading">
          <div>
            <h2>Start of tournament</h2>
            <p>These rules fill the tournament with teams when a season starts.</p>
          </div>
        </div>
        <div class="tse-data-table tasks">
          <div class="head"><span>Rule</span><span>Target</span><span>Details</span><span>Actions</span></div>
          <div class="row" *ngFor="let row of startRules">
            <span>{{ tasksDisplay.actionLabel(row.task) }}</span>
            <span>{{ tasksDisplay.targetLabel(project, row.task.targetId, referenceProject) }}</span>
            <span>{{ tasksDisplay.sourceSummary(project, row.task, referenceProject) }}</span>
            <span class="tse-row-actions"><button type="button" *ngIf="row.known" (click)="openEditRule(row)">Edit</button><button type="button" *ngIf="row.known" (click)="duplicateRule(row)">Duplicate</button><span *ngIf="!row.known" class="tse-muted">Advanced View</span><button type="button" class="tse-danger-link" (click)="deleteRule(row)">Delete</button></span>
          </div>
        </div>
      </section>

      <section class="tse-section" *ngIf="endRules.length">
        <div class="tse-section-heading">
          <div>
            <h2>End of tournament</h2>
            <p>These rules update tables after the tournament ends.</p>
          </div>
        </div>
        <div class="tse-data-table tasks">
          <div class="head"><span>Rule</span><span>Target</span><span>Details</span><span>Actions</span></div>
          <div class="row" *ngFor="let row of endRules">
            <span>{{ tasksDisplay.actionLabel(row.task) }}</span>
            <span>{{ tasksDisplay.targetLabel(project, row.task.targetId, referenceProject) }}</span>
            <span>{{ tasksDisplay.sourceSummary(project, row.task, referenceProject) }}</span>
            <span class="tse-row-actions"><button type="button" *ngIf="row.known" (click)="openEditRule(row)">Edit</button><button type="button" *ngIf="row.known" (click)="duplicateRule(row)">Duplicate</button><span *ngIf="!row.known" class="tse-muted">Advanced View</span><button type="button" class="tse-danger-link" (click)="deleteRule(row)">Delete</button></span>
          </div>
        </div>
      </section>

      <section class="tse-section" *ngIf="unknownRulesCount">
        <div class="tse-field-help">Some automation rules use advanced types. They are preserved and shown in Advanced View.</div>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'rule'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>{{ draft.timing === 'start' ? 'Team source rule' : 'Season update rule' }}</span><h2>{{ editingRow ? 'Edit rule' : draft.timing === 'start' ? 'Add team source rule' : 'Add season update rule' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-section-heading">
            <div><h2>What should happen?</h2><p>Choose the football action for this rule.</p></div>
          </div>
          <div class="tse-choice-grid">
            <button type="button" *ngFor="let type of visibleRuleTypes" [class.active]="draft.action === type.action" (click)="setAction(type.action)">
              <strong>{{ type.label }}</strong>
              <span>{{ type.description }}</span>
            </button>
          </div>

          <ng-container *ngIf="draft.timing === 'start'">
            <label class="tse-field"><span>Target phase/group</span><app-input-list [value]="stringValue(draft.targetId)" [options]="groupOptions" [searchable]="true" searchPlaceholder="Search phase or group" placeholder="Choose target group" (valueChange)="setTarget($event)"></app-input-list></label>
          </ng-container>

          <ng-container [ngSwitch]="draft.action">
            <ng-container *ngSwitchCase="'FillWithTeam'">
              <label class="tse-field" *ngIf="teamOptions.length; else manualTeamInput"><span>Club</span><app-input-list [value]="draft.param2" [options]="teamOptions" [searchable]="true" searchPlaceholder="Search club..." placeholder="Choose club" (valueChange)="draft.param2 = $event"></app-input-list></label>
              <ng-template #manualTeamInput><label class="tse-field"><span>Club</span><input [(ngModel)]="draft.param2" placeholder="Team ID" /></label></ng-template>
              <details class="tse-technical">
                <summary>Advanced options</summary>
                <label class="tse-field"><span>Order</span><input type="number" min="1" [(ngModel)]="draft.param1" /></label>
              </details>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromSpecialTeams'">
              <label class="tse-field"><span>Number of special teams</span><input type="number" min="1" [(ngModel)]="draft.param1" /></label>
              <div class="tse-field-help">Special teams are defined globally in settings.txt. You can create this rule now, but the special team pool is configured elsewhere.</div>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromLeague'">
              <label class="tse-field" *ngIf="leagueOptions.length; else manualLeagueInput"><span>League</span><app-input-list [value]="draft.param1" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="draft.param1 = $event"></app-input-list></label>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromLeagueMaxFromCountry'">
              <label class="tse-field" *ngIf="leagueOptions.length; else manualLeagueInput"><span>League</span><app-input-list [value]="draft.param1" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="draft.param1 = $event"></app-input-list></label>
              <div class="tse-form-grid two">
                <label class="tse-field"><span>Number of clubs to take</span><input type="number" min="1" [(ngModel)]="draft.param2" /></label>
                <label class="tse-field"><span>Max clubs from same country</span><input type="number" min="1" [(ngModel)]="draft.param3" /></label>
              </div>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromCompTable'">
              <label class="tse-field"><span>Source tournament</span><app-input-list [value]="draft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search tournament..." placeholder="Choose tournament" (valueChange)="draft.param1 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="draft.param2" /></label>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromCompTableBackupLeague'">
              <label class="tse-field"><span>Source tournament</span><app-input-list [value]="draft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search tournament..." placeholder="Choose tournament" (valueChange)="draft.param1 = $event"></app-input-list></label>
              <label class="tse-field" *ngIf="leagueOptions.length; else manualBackupLeagueInput"><span>Backup league</span><app-input-list [value]="draft.param2" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose backup league" (valueChange)="draft.param2 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="draft.param3" /></label>
            </ng-container>

            <ng-container *ngSwitchCase="'FillFromCompTableBackup'">
              <label class="tse-field"><span>Source tournament</span><app-input-list [value]="draft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search tournament..." placeholder="Choose tournament" (valueChange)="draft.param1 = $event"></app-input-list></label>
              <label class="tse-field"><span>Backup tournament</span><app-input-list [value]="draft.param2" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search tournament..." placeholder="Choose backup tournament" (valueChange)="draft.param2 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="draft.param3" /></label>
            </ng-container>

            <ng-container *ngSwitchCase="'UpdateTable'">
              <label class="tse-field"><span>Table to update</span><app-input-list [value]="stringValue(draft.targetId)" [options]="tableCompetitionOptions" [searchable]="true" searchPlaceholder="Search tournament..." placeholder="Choose table" (valueChange)="setTarget($event)"></app-input-list></label>
              <label class="tse-field"><span>Take team from</span><app-input-list [value]="draft.param1" [options]="groupOptions" [searchable]="true" searchPlaceholder="Search result slot" placeholder="Choose result group" (valueChange)="draft.param1 = $event"></app-input-list></label>
              <div class="tse-form-grid two">
                <label class="tse-field"><span>Source position</span><input type="number" min="1" [(ngModel)]="draft.param2" /></label>
                <label class="tse-field"><span>Replace table position</span><input type="number" min="1" [(ngModel)]="draft.param3" /></label>
              </div>
            </ng-container>

            <ng-container *ngSwitchCase="'UpdateLeagueTable'">
              <label class="tse-field"><span>League phase/stage</span><app-input-list [value]="stringValue(draft.targetId)" [options]="stageOptions" [searchable]="true" searchPlaceholder="Search phase" placeholder="Choose phase" (valueChange)="setTarget($event)"></app-input-list></label>
              <label class="tse-field" *ngIf="leagueOptions.length; else manualLeagueInput"><span>League</span><app-input-list [value]="draft.param1" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="draft.param1 = $event"></app-input-list></label>
            </ng-container>
          </ng-container>

          <ng-template #manualLeagueInput><label class="tse-field"><span>League</span><input [(ngModel)]="draft.param1" placeholder="League ID" /></label></ng-template>
          <ng-template #manualBackupLeagueInput><label class="tse-field"><span>Backup league</span><input [(ngModel)]="draft.param2" placeholder="League ID" /></label></ng-template>

          <div class="tse-resolved"><small>Preview</small><strong>{{ friendlyPreview }}</strong></div>
          <details class="tse-technical">
            <summary>Show technical details</summary>
            <code>{{ technicalPreview }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canSaveRule" (click)="saveRule()">{{ editingRow ? 'Save changes' : 'Add rule' }}</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'generate'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Team Sources</span><h2>Generate common rules</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field" *ngIf="leagueOptions.length; else manualGenerateLeague"><span>League</span><app-input-list [value]="generateLeagueId" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="generateLeagueId = $event"></app-input-list></label>
          <ng-template #manualGenerateLeague><label class="tse-field"><span>League</span><input [(ngModel)]="generateLeagueId" placeholder="League ID" /></label></ng-template>
          <label class="tse-checkline"><input type="checkbox" [(ngModel)]="generateFillFromLeague" /> Fill target group from this league at tournament start</label>
          <label class="tse-field" *ngIf="generateFillFromLeague"><span>Target phase/group</span><app-input-list [value]="stringValue(generateTargetGroupId)" [options]="groupOptions" [searchable]="true" searchPlaceholder="Search target" placeholder="Choose target group" (valueChange)="generateTargetGroupId = numberValue($event)"></app-input-list></label>
          <label class="tse-checkline"><input type="checkbox" [(ngModel)]="generateUpdateLeague" /> Update this league table at season end</label>
          <label class="tse-field" *ngIf="generateUpdateLeague"><span>League phase/stage</span><app-input-list [value]="stringValue(generateStageId)" [options]="stageOptions" [searchable]="true" searchPlaceholder="Search phase" placeholder="Choose phase" (valueChange)="generateStageId = numberValue($event)"></app-input-list></label>
          <details class="tse-technical">
            <summary>Show generated tasks.txt lines</summary>
            <code *ngFor="let line of generatedCommonTechnicalLines">{{ line }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canApplyGeneratedCommon" (click)="applyGeneratedCommonRules()">Add rules</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'validation'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Validation result</span><h2>{{ validationIssues.length ? 'Team source rules have warnings' : 'Team source rules look valid' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body tse-validation-list">
          <ng-container *ngIf="validationIssues.length; else noTaskIssues">
            <article *ngFor="let issue of validationIssues" [class.error]="issue.severity === 'error'">
              <strong>{{ issue.severity === 'error' ? 'Error' : 'Warning' }}</strong>
              <span>{{ issue.message }}</span>
              <small *ngIf="issue.technical">Technical detail: {{ issue.technical }}</small>
            </article>
          </ng-container>
          <ng-template #noTaskIssues>
            <ul class="tse-success-list">
              <li>Team source targets exist</li>
              <li>Season update positions are valid</li>
              <li>Rules point to known tournaments, clubs or leagues where possible</li>
            </ul>
          </ng-template>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Done</button></footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'preview'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>tasks.txt preview</span><h2>Generated team source lines</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-generated-lines">
            <code *ngFor="let row of allRules">{{ tasks.rawLine(row.task) }}</code>
            <code *ngIf="!allRules.length">No tasks.txt lines for this tournament.</code>
          </div>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Close preview</button></footer>
      </section>
    </div>
  `
})
export class TournamentTeamSourcesComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() referenceProject?: DbProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<void>();

  startRules: TeamSourceTaskRow[] = [];
  endRules: TeamSourceTaskRow[] = [];
  allRules: TeamSourceTaskRow[] = [];
  validationIssues: TaskValidationIssue[] = [];
  dialog: TeamSourcesDialog;
  editingRow?: TeamSourceTaskRow;
  draft: TeamSourceTaskDraft = { timing: "start", action: "FillWithTeam", targetId: 0, param1: "1", param2: "", param3: "0" };
  teamOptions: InputListOption[] = [];
  leagueOptions: InputListOption[] = [];
  groupOptions: InputListOption[] = [];
  stageOptions: InputListOption[] = [];
  competitionOptions: InputListOption[] = [];
  tableCompetitionOptions: InputListOption[] = [];
  generateLeagueId = "";
  generateTargetGroupId = 0;
  generateStageId = 0;
  generateFillFromLeague = true;
  generateUpdateLeague = true;

  readonly startRuleTypes: TaskRuleType[] = [
    { action: "FillWithTeam", label: "Add a specific club", description: "Put a specific club into this tournament." },
    { action: "FillFromLeague", label: "Add clubs from a league", description: "Fill this tournament with clubs from a selected league." },
    { action: "FillFromLeagueMaxFromCountry", label: "Add top clubs with country limit", description: "Take top clubs from a league, with a country limit." },
    { action: "FillFromCompTable", label: "Add qualified teams from another tournament", description: "Take teams from another tournament's previous-season table." },
    { action: "FillFromCompTableBackupLeague", label: "Add qualified teams with league backup", description: "Use a league as backup if needed." },
    { action: "FillFromCompTableBackup", label: "Add qualified teams with tournament backup", description: "Use another tournament as backup if needed." },
    { action: "FillFromSpecialTeams", label: "Add special teams", description: "Fill from the special teams pool." }
  ];
  readonly endRuleTypes: TaskRuleType[] = [
    { action: "UpdateTable", label: "Update previous-season table", description: "Use a result slot to update next season's starting table." },
    { action: "UpdateLeagueTable", label: "Update league table", description: "Update the selected league table after the season ends." }
  ];

  constructor(
    public readonly tasks: TasksService,
    public readonly tasksDisplay: TasksDisplayService,
    private readonly validation: TasksValidationService,
    private readonly teamEditor: TeamEditorService,
    private readonly leagueEditor: LeagueEditorService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["project"] || changes["competition"] || changes["referenceProject"]) {
      this.refreshData();
    }
  }

  get status(): "OK" | "Warning" {
    return this.validationIssues.length ? "Warning" : "OK";
  }

  get manualClubsCount(): number {
    return this.startRules.filter((row) => row.task.action === "FillWithTeam").length;
  }

  get targetGroupsCount(): number {
    return new Set(this.startRules.filter((row) => START_TASK_ACTIONS.includes(row.task.action as any)).map((row) => row.task.targetId)).size;
  }

  get unknownRulesCount(): number {
    return this.allRules.filter((row) => !row.known).length;
  }

  get visibleRuleTypes(): TaskRuleType[] {
    return this.draft.timing === "start" ? this.startRuleTypes : this.endRuleTypes;
  }

  get canSaveRule(): boolean {
    if (!this.draft.action || !this.draft.timing) return false;
    if (START_TASK_ACTIONS.includes(this.draft.action)) {
      if (Number(this.draft.targetId) <= 0) return false;
    }
    switch (this.draft.action) {
      case "FillWithTeam": return this.positive(this.draft.param1) && this.positive(this.draft.param2);
      case "FillFromSpecialTeams": return this.positive(this.draft.param1);
      case "FillFromLeague": return this.positive(this.draft.param1);
      case "FillFromLeagueMaxFromCountry": return this.positive(this.draft.param1) && this.positive(this.draft.param2) && this.positive(this.draft.param3);
      case "FillFromCompTable": return this.positive(this.draft.param1) && this.positive(this.draft.param2);
      case "FillFromCompTableBackupLeague": return this.positive(this.draft.param1) && this.positive(this.draft.param2) && this.positive(this.draft.param3);
      case "FillFromCompTableBackup": return this.positive(this.draft.param1) && this.positive(this.draft.param2) && this.positive(this.draft.param3);
      case "UpdateTable": return this.positive(String(this.draft.targetId)) && this.positive(this.draft.param1) && this.positive(this.draft.param2) && this.positive(this.draft.param3);
      case "UpdateLeagueTable": return this.positive(String(this.draft.targetId)) && this.positive(this.draft.param1);
      default: return false;
    }
  }

  get friendlyPreview(): string {
    if (!this.canSaveRule) return "Choose the rule details to preview what will happen.";
    return this.tasksDisplay.friendlySentence(this.project, this.tasks.taskFromDraft(this.competition.id, this.draft), this.referenceProject);
  }

  get technicalPreview(): string {
    return this.tasks.rawLine(this.tasks.taskFromDraft(this.competition.id, this.draft));
  }

  get generatedCommonTechnicalLines(): string[] {
    const lines: string[] = [];
    if (this.generateFillFromLeague && this.generateTargetGroupId > 0 && this.positive(this.generateLeagueId)) {
      lines.push(this.tasks.rawLine(this.tasks.taskFromDraft(this.competition.id, { timing: "start", action: "FillFromLeague", targetId: this.generateTargetGroupId, param1: this.generateLeagueId, param2: "0", param3: "0" })));
    }
    if (this.generateUpdateLeague && this.generateStageId > 0 && this.positive(this.generateLeagueId)) {
      lines.push(this.tasks.rawLine(this.tasks.taskFromDraft(this.competition.id, { timing: "end", action: "UpdateLeagueTable", targetId: this.generateStageId, param1: this.generateLeagueId, param2: "0", param3: "0" })));
    }
    return lines;
  }

  get canApplyGeneratedCommon(): boolean {
    return this.generatedCommonTechnicalLines.length > 0;
  }

  refreshData(): void {
    this.project.tasks ??= [];
    this.project.taskInvalidLines ??= [];
    this.startRules = this.tasks.listStartRules(this.project, this.competition);
    this.endRules = this.tasks.listEndRules(this.project, this.competition);
    this.allRules = this.tasks.listTournamentTasks(this.project, this.competition);
    this.validationIssues = this.validation.validateTournament(this.project, this.competition, this.referenceProject);
    this.groupOptions = this.tasksDisplay.groupOptions(this.project, this.competition.id, this.referenceProject);
    this.stageOptions = this.tasksDisplay.stageOptions(this.project, this.competition.id, this.referenceProject);
    this.competitionOptions = this.tasksDisplay.competitionOptions(this.project, this.competition.id, this.referenceProject);
    this.tableCompetitionOptions = [{ value: String(this.competition.id), label: this.tasksDisplay.competitionName(this.project, this.competition.id, this.referenceProject), detail: "Current tournament", searchText: this.competition.shortName }];
    this.teamOptions = this.referenceProject ? this.teamEditor.findTeams(this.referenceProject, "", 5000).map((team) => ({ value: team.teamId, label: team.displayName, detail: `teamId ${team.teamId}`, searchText: `${team.displayName} ${team.teamId}` })) : [];
    this.leagueOptions = this.referenceProject ? this.leagueEditor.findLeagues(this.referenceProject, "", "", 5000).map((league) => ({ value: league.leagueId, label: league.displayName, detail: `leagueId ${league.leagueId} · ${league.teamsCount} clubs`, searchText: `${league.displayName} ${league.leagueId}` })) : [];
  }

  openAddStartRule(): void {
    this.editingRow = undefined;
    this.draft = this.emptyDraft("start");
    this.dialog = "rule";
  }

  openAddEndRule(): void {
    this.editingRow = undefined;
    this.draft = this.emptyDraft("end");
    this.dialog = "rule";
  }

  openEditRule(row: TeamSourceTaskRow): void {
    this.editingRow = row;
    const timing = row.task.timing.toLowerCase() === "end" ? "end" : "start";
    this.draft = {
      timing,
      action: this.tasks.isKnownTask(row.task.action) ? row.task.action : (timing === "end" ? "UpdateTable" : "FillWithTeam"),
      targetId: row.task.targetId,
      param1: row.task.param1,
      param2: row.task.param2,
      param3: row.task.param3
    };
    this.dialog = "rule";
  }

  setAction(action: KnownTaskAction): void {
    this.draft.action = action;
    this.applyActionDefaults(false);
  }

  setTarget(value: string): void {
    this.draft.targetId = this.numberValue(value);
    if (this.draft.action === "FillWithTeam" && !this.editingRow) {
      this.draft.param1 = String(this.tasks.nextFillWithTeamOrder(this.project, this.competition.id, this.draft.targetId));
    }
  }

  saveRule(): void {
    if (!this.canSaveRule) return;
    if (this.editingRow) this.tasks.updateTask(this.project, this.editingRow.globalIndex, this.competition.id, this.draft);
    else this.tasks.addTask(this.project, this.competition.id, this.draft);
    this.afterChange();
    this.closeDialog();
  }

  duplicateRule(row: TeamSourceTaskRow): void {
    this.tasks.duplicateTask(this.project, row);
    this.afterChange();
  }

  deleteRule(row: TeamSourceTaskRow): void {
    if (!confirm("Remove this team source rule?")) return;
    this.tasks.removeTask(this.project, row.globalIndex);
    this.afterChange();
  }

  openGenerateCommonRules(): void {
    this.generateLeagueId = this.leagueOptions[0]?.value ?? "";
    this.generateTargetGroupId = Number(this.groupOptions[0]?.value ?? 0);
    this.generateStageId = Number(this.stageOptions[0]?.value ?? 0);
    this.generateFillFromLeague = true;
    this.generateUpdateLeague = true;
    this.dialog = "generate";
  }

  applyGeneratedCommonRules(): void {
    if (this.generateFillFromLeague && this.generateTargetGroupId > 0 && this.positive(this.generateLeagueId)) {
      this.tasks.addTask(this.project, this.competition.id, { timing: "start", action: "FillFromLeague", targetId: this.generateTargetGroupId, param1: this.generateLeagueId, param2: "0", param3: "0" });
    }
    if (this.generateUpdateLeague && this.generateStageId > 0 && this.positive(this.generateLeagueId)) {
      this.tasks.addTask(this.project, this.competition.id, { timing: "end", action: "UpdateLeagueTable", targetId: this.generateStageId, param1: this.generateLeagueId, param2: "0", param3: "0" });
    }
    this.afterChange();
    this.closeDialog();
  }

  openValidation(): void {
    this.validationIssues = this.validation.validateTournament(this.project, this.competition, this.referenceProject);
    this.dialog = "validation";
  }

  openPreview(): void {
    this.dialog = "preview";
  }

  closeDialog(): void {
    this.dialog = undefined;
    this.editingRow = undefined;
  }

  stringValue(value: number): string {
    return value > 0 ? String(value) : "";
  }

  numberValue(value: string): number {
    return Number(value) || 0;
  }

  private emptyDraft(timing: TaskTiming): TeamSourceTaskDraft {
    const action = timing === "start" ? "FillWithTeam" : "UpdateTable";
    const draft: TeamSourceTaskDraft = { timing, action, targetId: 0, param1: "1", param2: "1", param3: "0" };
    this.draft = draft;
    this.applyActionDefaults(true);
    return { ...this.draft };
  }

  private applyActionDefaults(resetTarget: boolean): void {
    if (START_TASK_ACTIONS.includes(this.draft.action)) {
      if (resetTarget || !this.draft.targetId) this.draft.targetId = Number(this.groupOptions[0]?.value ?? 0);
    }
    if (this.draft.action === "UpdateLeagueTable") {
      if (resetTarget || !this.draft.targetId) this.draft.targetId = Number(this.stageOptions[0]?.value ?? 0);
    }
    if (this.draft.action === "UpdateTable") {
      this.draft.targetId = this.competition.id;
    }
    if (this.draft.action === "FillWithTeam") {
      this.draft.param1 = String(this.tasks.nextFillWithTeamOrder(this.project, this.competition.id, this.draft.targetId));
      this.draft.param2 = this.teamOptions[0]?.value ?? "";
      this.draft.param3 = "0";
    } else if (this.draft.action === "FillFromSpecialTeams") {
      this.draft.param1 = "1"; this.draft.param2 = "0"; this.draft.param3 = "0";
    } else if (this.draft.action === "FillFromLeague") {
      this.draft.param1 = this.leagueOptions[0]?.value ?? ""; this.draft.param2 = "0"; this.draft.param3 = "0";
    } else if (this.draft.action === "FillFromLeagueMaxFromCountry") {
      this.draft.param1 = this.leagueOptions[0]?.value ?? ""; this.draft.param2 = "1"; this.draft.param3 = "4";
    } else if (this.draft.action === "FillFromCompTable") {
      this.draft.param1 = this.competitionOptions[0]?.value ?? ""; this.draft.param2 = "1"; this.draft.param3 = "0";
    } else if (this.draft.action === "FillFromCompTableBackupLeague") {
      this.draft.param1 = this.competitionOptions[0]?.value ?? ""; this.draft.param2 = this.leagueOptions[0]?.value ?? ""; this.draft.param3 = "1";
    } else if (this.draft.action === "FillFromCompTableBackup") {
      this.draft.param1 = this.competitionOptions[0]?.value ?? ""; this.draft.param2 = this.competitionOptions[1]?.value ?? this.competitionOptions[0]?.value ?? ""; this.draft.param3 = "1";
    } else if (this.draft.action === "UpdateTable") {
      this.draft.param1 = this.groupOptions[0]?.value ?? ""; this.draft.param2 = "1"; this.draft.param3 = "1";
    } else if (this.draft.action === "UpdateLeagueTable") {
      this.draft.param1 = this.leagueOptions[0]?.value ?? ""; this.draft.param2 = "0"; this.draft.param3 = "0";
    }
  }

  private afterChange(): void {
    this.refreshData();
    this.structureChanged.emit();
  }

  private positive(value: string): boolean {
    return /^\d+$/.test(String(value).trim()) && Number(value) > 0;
  }
}
