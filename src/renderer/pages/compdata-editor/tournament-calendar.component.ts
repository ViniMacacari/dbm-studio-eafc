import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { DecisionModalComponent, DecisionOption } from "../../components/decision-modal/decision-modal.component";
import { InputListComponent, InputListOption } from "../../components/input-list/input-list.component";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import { ScheduleDateService } from "../../services/compdata/schedule-date.service";
import { ScheduleDisplayService } from "../../services/compdata/schedule-display.service";
import { MatchdayRuleRow, ScheduleService, SpecificFixtureRow } from "../../services/compdata/schedule.service";
import { ScheduleValidationIssue, ScheduleValidationService } from "../../services/compdata/schedule-validation.service";
import { WeatherDisplayService } from "../../services/compdata/weather-display.service";
import { WeatherService } from "../../services/compdata/weather.service";
import { TeamEditorService } from "../../services/team-editor.service";

interface RuleDraft {
  targetMode: "phase" | "group";
  phaseId: number;
  groupId: number;
  roundNumber: number;
  month: number;
  day: number;
  time: string;
  matchCountMode: "exact" | "range";
  matches: number;
  minGames: number;
  maxGames: number;
}

interface FixtureDraft {
  phaseId: number;
  year: number;
  month: number;
  day: number;
  time: string;
  homeTeamId: string;
  awayTeamId: string;
}

interface GeneratedRulePreview {
  phaseId: number;
  roundNumber: number;
  month: number;
  day: number;
  time: string;
  minGames: number;
  maxGames: number;
}

@Component({
  selector: "app-tournament-calendar",
  standalone: true,
  imports: [CommonModule, FormsModule, InputListComponent, DecisionModalComponent],
  template: `
    <div class="tse-content">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Calendar</div>
          <h1>Calendar</h1>
          <p>Set match dates, rounds and fixtures for this tournament.</p>
          <small class="tse-entity-note">Use calendar rules for generic matchdays, or fixtures when you want exact matches with home and away teams.</small>
        </div>
      </header>

      <div class="tse-summary-grid">
        <div><strong>{{ rules.length }}</strong><span>Matchday rules</span></div>
        <div><strong>{{ fixtures.length }}</strong><span>Specific fixtures</span></div>
        <div><strong>{{ phasesScheduled }}</strong><span>Phases scheduled</span></div>
        <div [class.warn]="status !== 'OK'"><strong>{{ status }}</strong><span>Status</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="openAddRule()">Add matchday rule</button>
        <button type="button" (click)="openGenerateCalendar()">Generate calendar</button>
        <button type="button" (click)="openAddFixture()">Add fixture</button>
        <button type="button" (click)="openImportFixtures()">Import fixtures</button>
        <button type="button" (click)="openValidation()">Validate calendar</button>
        <button type="button" (click)="openPreview()">Preview schedule files</button>
      </div>
      <div class="tse-field-help">Season calendar · dates shown without year.</div>
      <div class="tse-field-help" *ngIf="countryWeatherContext">
        Country weather: {{ countryWeatherContext }}.
        <button type="button" style="margin-left: 8px;" (click)="openCountryWeather.emit()">Open country weather</button>
      </div>

      <div class="tse-main-empty" *ngIf="rules.length === 0 && fixtures.length === 0">
        <strong>No calendar configured</strong>
        <span>Create matchday rules or add exact fixtures for this tournament.</span>
        <div>
          <button type="button" class="tse-primary" (click)="openGenerateCalendar()">Generate calendar</button>
          <button type="button" (click)="openAddRule()">Add matchday rule</button>
          <button type="button" (click)="openAddFixture()">Add fixture manually</button>
        </div>
      </div>

      <section class="tse-section" *ngIf="rules.length > 0">
        <div class="tse-section-heading">
          <div>
            <h2>Matchday rules</h2>
            <p>League schedule windows by phase, round, date and match count.</p>
          </div>
        </div>
        <div class="tse-data-table">
          <div class="head"><span>Phase</span><span>Applies to</span><span>Round</span><span>Date</span><span>Time</span><span>Matches</span><span>Actions</span></div>
          <div class="row" *ngFor="let row of rules">
            <span>{{ phaseName(row.phase) }}</span>
            <span>{{ appliesTo(row) }}</span>
            <span>Round {{ row.entry.round }}</span>
            <span>{{ matchdayDate(row.entry.day) }}</span>
            <span>{{ dates.formatTimeHHMM(row.entry.time) }}</span>
            <span>{{ scheduleDisplay.matchesLabel(row.entry.minGames, row.entry.maxGames) }}</span>
            <span class="tse-row-actions"><button type="button" (click)="openEditRule(row)">Edit</button><button type="button" class="tse-danger-link" (click)="requestDeleteRule(row)">Delete</button></span>
          </div>
        </div>
      </section>

      <section class="tse-section" *ngIf="fixtures.length > 0">
        <div class="tse-section-heading">
          <div>
            <h2>Specific fixtures</h2>
            <p>Cup or league fixtures with exact home and away teams.</p>
          </div>
        </div>
        <div class="tse-data-table fixture">
          <div class="head"><span>Date</span><span>Time</span><span>Phase</span><span>Home</span><span>Away</span><span>File</span><span>Actions</span></div>
          <div class="row" *ngFor="let row of fixtures">
            <span>{{ dates.formatSpecificDate(row.fixture.date) }}</span>
            <span>{{ dates.formatTimeHHMM(row.fixture.time) }}</span>
            <span>{{ phaseName(row.phase) }}</span>
            <span>{{ scheduleDisplay.teamName(row.fixture.homeTeamId, referenceProject) }}</span>
            <span>{{ scheduleDisplay.teamName(row.fixture.awayTeamId, referenceProject) }}</span>
            <span><small class="tse-muted">{{ row.file.fileName }}</small></span>
            <span class="tse-row-actions"><button type="button" (click)="openEditFixture(row)">Edit</button><button type="button" class="tse-danger-link" (click)="requestDeleteFixture(row)">Delete</button></span>
          </div>
        </div>
      </section>

      <details class="tse-technical">
        <summary>Show technical details</summary>
        <p>Calendar rules are saved in schedule.txt. Specific fixtures are saved in files inside schedules/.</p>
        <div class="tse-code-panel" *ngIf="rules.length">
          <span>schedule.txt entries for this tournament</span>
          <code *ngFor="let row of rules">{{ schedule.ruleRawLine(row.entry) }}</code>
        </div>
        <div class="tse-code-panel" *ngFor="let file of specificFilesForTournament">
          <span>schedules/{{ file.fileName }}</span>
          <code *ngFor="let fixture of file.fixtures">{{ schedule.fixtureRawLine(fixture) }}</code>
          <code *ngIf="!file.fixtures.length">No fixture lines.</code>
        </div>
      </details>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'rule'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Matchday rules</span><h2>{{ editingRule ? 'Edit matchday rule' : 'Add matchday rule' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>Apply to</span><select [(ngModel)]="ruleDraft.targetMode" (ngModelChange)="syncRuleTarget()"><option value="phase">Entire phase</option><option value="group">Specific group/slot</option></select></label>
          <label class="tse-field"><span>Phase</span><app-input-list [value]="stringValue(ruleDraft.phaseId)" [options]="phaseOptions" placeholder="Select phase" (valueChange)="setRulePhase($event)"></app-input-list></label>
          <label class="tse-field" *ngIf="ruleDraft.targetMode === 'group'"><span>Group / match slot</span><app-input-list [value]="stringValue(ruleDraft.groupId)" [options]="ruleGroupOptions" placeholder="Select group or match slot" (valueChange)="ruleDraft.groupId = numberValue($event)"></app-input-list></label>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Month</span><select [(ngModel)]="ruleDraft.month"><option *ngFor="let month of monthOptions" [ngValue]="month.value">{{ month.label }}</option></select></label>
            <label class="tse-field"><span>Day</span><input type="number" min="1" max="31" [(ngModel)]="ruleDraft.day" /></label>
            <label class="tse-field"><span>Kick-off time</span><input type="time" [(ngModel)]="ruleDraft.time" /></label>
          </div>
          <label class="tse-field"><span>Round</span><input type="number" min="1" [(ngModel)]="ruleDraft.roundNumber" /></label>
          <label class="tse-field"><span>Number of matches</span><select [(ngModel)]="ruleDraft.matchCountMode"><option value="exact">Exact number</option><option value="range">Range</option></select></label>
          <div class="tse-form-grid two" *ngIf="ruleDraft.matchCountMode === 'exact'; else rangeRuleCount">
            <label class="tse-field"><span>Matches</span><input type="number" min="0" [(ngModel)]="ruleDraft.matches" /></label>
          </div>
          <ng-template #rangeRuleCount>
            <div class="tse-form-grid two">
              <label class="tse-field"><span>Minimum matches</span><input type="number" min="0" [(ngModel)]="ruleDraft.minGames" /></label>
              <label class="tse-field"><span>Maximum matches</span><input type="number" min="0" [(ngModel)]="ruleDraft.maxGames" /></label>
            </div>
          </ng-template>
          <div class="tse-resolved"><small>Preview</small><strong>{{ ruleFriendlyPreview }}</strong></div>
          <details class="tse-technical">
            <summary>Advanced date conversion</summary>
            <p>Used only to convert day/month into schedule.txt day offsets.</p>
            <label class="tse-field"><span>Preview base year</span><input type="number" [ngModel]="dates.previewBaseYear(seasonBaseDate)" disabled /></label>
            <label class="tse-field"><span>Base date</span><input type="date" [(ngModel)]="seasonBaseDate" /></label>
            <code>Day offset: {{ ruleDayOffsetPreview }}</code>
            <code>{{ ruleTechnicalPreview }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canSaveRule" (click)="saveRule()">{{ editingRule ? 'Save changes' : 'Create rule' }}</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'fixture'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Specific fixtures</span><h2>{{ editingFixture ? 'Edit fixture' : 'Add fixture' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Phase</span><app-input-list [value]="stringValue(fixtureDraft.phaseId)" [options]="phaseOptions" placeholder="Select phase" (valueChange)="fixtureDraft.phaseId = numberValue($event)"></app-input-list></label>
            <label class="tse-field"><span>Month</span><select [(ngModel)]="fixtureDraft.month"><option *ngFor="let month of monthOptions" [ngValue]="month.value">{{ month.label }}</option></select></label>
            <label class="tse-field"><span>Day</span><input type="number" min="1" max="31" [(ngModel)]="fixtureDraft.day" /></label>
          </div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Kick-off time</span><input type="time" [(ngModel)]="fixtureDraft.time" /></label>
          </div>
          <div class="tse-form-grid two" *ngIf="teamOptions.length; else fixtureIdInputs">
            <label class="tse-field"><span>Home team</span><app-input-list [value]="fixtureDraft.homeTeamId" [options]="teamOptions" [searchable]="true" searchPlaceholder="Search club or team ID" placeholder="Choose home team" (valueChange)="fixtureDraft.homeTeamId = $event"></app-input-list></label>
            <label class="tse-field"><span>Away team</span><app-input-list [value]="fixtureDraft.awayTeamId" [options]="teamOptions" [searchable]="true" searchPlaceholder="Search club or team ID" placeholder="Choose away team" (valueChange)="fixtureDraft.awayTeamId = $event"></app-input-list></label>
          </div>
          <ng-template #fixtureIdInputs>
            <div class="tse-form-grid two">
              <label class="tse-field"><span>Home team</span><input [(ngModel)]="fixtureDraft.homeTeamId" placeholder="Team ID 1" /></label>
              <label class="tse-field"><span>Away team</span><input [(ngModel)]="fixtureDraft.awayTeamId" placeholder="Team ID 106" /></label>
            </div>
          </ng-template>
          <div class="tse-resolved"><small>Preview</small><strong>{{ fixtureFriendlyPreview }}</strong></div>
          <details class="tse-technical">
            <summary>Show technical details</summary>
            <label class="tse-field"><span>Schedule file year</span><input type="number" min="1900" [(ngModel)]="fixtureDraft.year" /></label>
            <div class="tse-code-panel">
              <span>File</span><code>{{ fixtureFilePreview }}</code>
              <span>Line</span><code>{{ fixtureTechnicalPreview }}</code>
              <span>Date with file year</span><code>{{ fixtureDateWithYearPreview }}</code>
            </div>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canSaveFixture" (click)="saveFixture()">{{ editingFixture ? 'Save changes' : 'Add fixture' }}</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'generate'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Calendar</span><h2>Generate calendar</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>Schedule type</span><select [(ngModel)]="generateMode" (ngModelChange)="buildGeneratedPreview()"><option value="league">League schedule</option><option value="groupStage">Group stage calendar</option><option value="cup">Cup schedule</option></select></label>
          <ng-container *ngIf="generateMode !== 'cup'; else cupGenerateFields">
            <div class="tse-form-grid three">
              <label class="tse-field"><span>First matchday month</span><select [(ngModel)]="generateStartMonth" (ngModelChange)="buildGeneratedPreview()"><option *ngFor="let month of monthOptions" [ngValue]="month.value">{{ month.label }}</option></select></label>
              <label class="tse-field"><span>First matchday day</span><input type="number" min="1" max="31" [(ngModel)]="generateStartDay" (ngModelChange)="buildGeneratedPreview()" /></label>
              <label class="tse-field"><span>Default kick-off time</span><input type="time" [(ngModel)]="generateTime" (ngModelChange)="buildGeneratedPreview()" /></label>
            </div>
            <div class="tse-form-grid three">
              <label class="tse-field"><span>{{ generateMode === 'league' ? 'Matchdays' : 'Rounds' }}</span><input type="number" min="1" [(ngModel)]="generateRounds" (ngModelChange)="buildGeneratedPreview()" /></label>
              <label class="tse-field"><span>Days between rounds</span><input type="number" min="1" [(ngModel)]="generateIntervalDays" (ngModelChange)="buildGeneratedPreview()" /></label>
              <label class="tse-field"><span>Minimum matches</span><input type="number" min="0" [(ngModel)]="generateMinGames" (ngModelChange)="buildGeneratedPreview()" /></label>
              <label class="tse-field"><span>Maximum matches</span><input type="number" min="0" [(ngModel)]="generateMaxGames" (ngModelChange)="buildGeneratedPreview()" /></label>
            </div>
          </ng-container>
          <ng-template #cupGenerateFields>
            <div class="tse-form-grid three">
              <label class="tse-field"><span>First round month</span><select [(ngModel)]="generateStartMonth" (ngModelChange)="buildGeneratedPreview()"><option *ngFor="let month of monthOptions" [ngValue]="month.value">{{ month.label }}</option></select></label>
              <label class="tse-field"><span>First round day</span><input type="number" min="1" max="31" [(ngModel)]="generateStartDay" (ngModelChange)="buildGeneratedPreview()" /></label>
              <label class="tse-field"><span>Days between rounds</span><input type="number" min="1" [(ngModel)]="generateIntervalDays" (ngModelChange)="buildGeneratedPreview()" /></label>
            </div>
            <div class="tse-form-grid two">
              <label class="tse-field"><span>Default kick-off time</span><input type="time" [(ngModel)]="generateTime" (ngModelChange)="buildGeneratedPreview()" /></label>
            </div>
            <label class="tse-checkline"><input type="checkbox" [(ngModel)]="generateIncludeSetup" (ngModelChange)="buildGeneratedPreview()" /> Include setup phase in calendar</label>
          </ng-template>

          <div class="tse-section-heading"><div><h2>Calendar preview</h2><p>Edit or remove matchdays before applying them.</p></div><button type="button" (click)="addGeneratedMatchday()">Add matchday</button></div>
          <div class="tse-data-table preview">
            <div class="head"><span>Phase</span><span>Round</span><span>Date</span><span>Time</span><span>Min</span><span>Max</span><span></span></div>
            <div class="row" *ngFor="let item of generatedPreview; let i = index">
              <span>{{ phaseNameById(item.phaseId) }}</span>
              <span><input type="number" min="1" [(ngModel)]="item.roundNumber" /></span>
              <span class="tse-season-date-edit"><select [(ngModel)]="item.month"><option *ngFor="let month of monthOptions" [ngValue]="month.value">{{ month.label }}</option></select><input type="number" min="1" max="31" [(ngModel)]="item.day" /></span>
              <span><input type="time" [(ngModel)]="item.time" /></span>
              <span><input type="number" min="0" [(ngModel)]="item.minGames" /></span>
              <span><input type="number" min="0" [(ngModel)]="item.maxGames" /></span>
              <span><button type="button" class="tse-danger-link" (click)="generatedPreview.splice(i, 1)">Delete</button></span>
            </div>
          </div>
          <details class="tse-technical">
            <summary>Show generated schedule lines</summary>
            <code *ngFor="let line of generatedTechnicalLines">{{ line }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canApplyGeneratedCalendar" (click)="applyGeneratedCalendar()">Apply calendar</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'import'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header"><div><span>Advanced Import</span><h2>Import fixtures</h2></div><button type="button" (click)="closeDialog()">×</button></header>
        <div class="tse-modal-body">
          <p>Paste CSV rows with date, time, home team ID and away team ID.</p>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Phase</span><app-input-list [value]="stringValue(importPhaseId)" [options]="phaseOptions" placeholder="Select phase" (valueChange)="importPhaseId = numberValue($event)"></app-input-list></label>
            <label class="tse-field"><span>Year</span><input type="number" min="1900" [(ngModel)]="importYear" /></label>
          </div>
          <label class="tse-field"><span>CSV</span><textarea [(ngModel)]="importCsv" rows="8" placeholder="date,time,homeTeamId,awayTeamId&#10;20260818,1500,1,106"></textarea></label>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!importCsv.trim() || importPhaseId <= 0" (click)="applyImportFixtures()">Import fixtures</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'validation'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header"><div><span>Validation result</span><h2>{{ validationIssues.length ? 'Calendar has warnings' : 'Calendar looks valid' }}</h2></div><button type="button" (click)="closeDialog()">×</button></header>
        <div class="tse-modal-body tse-validation-list">
          <ng-container *ngIf="validationIssues.length; else noCalendarIssues">
            <article *ngFor="let issue of validationIssues" [class.error]="issue.severity === 'error'"><strong>{{ issue.severity === 'error' ? 'Error' : 'Warning' }}</strong><span>{{ issue.message }}</span><small *ngIf="issue.technical">Technical detail: {{ issue.technical }}</small></article>
          </ng-container>
          <ng-template #noCalendarIssues><ul class="tse-success-list"><li>Match dates are valid</li><li>Kick-off times are valid</li><li>Fixtures point to known phases</li></ul></ng-template>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Done</button></footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'preview'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header"><div><span>Technical preview</span><h2>Schedule files preview</h2></div><button type="button" (click)="closeDialog()">×</button></header>
        <div class="tse-modal-body">
          <div class="tse-code-panel"><span>schedule.txt</span><code *ngFor="let row of rules">{{ schedule.ruleRawLine(row.entry) }}</code><code *ngIf="!rules.length">No matchday rule lines for this tournament.</code></div>
          <div class="tse-code-panel" *ngFor="let file of specificFilesForTournament"><span>schedules/{{ file.fileName }}</span><code *ngFor="let fixture of file.fixtures">{{ schedule.fixtureRawLine(fixture) }}</code><code *ngIf="!file.fixtures.length">No fixture lines.</code></div>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Close preview</button></footer>
      </section>
    </div>

    <app-decision-modal *ngIf="decisionType" [title]="decisionTitle" [text]="decisionText" [options]="decisionOptions" (action)="onDecisionAction($event)"></app-decision-modal>
  `
})
export class TournamentCalendarComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Input() referenceProject?: DbProject;
  @Output() structureChanged = new EventEmitter<void>();
  @Output() openCountryWeather = new EventEmitter<void>();

  rules: MatchdayRuleRow[] = [];
  fixtures: SpecificFixtureRow[] = [];
  phases: CompdataObject[] = [];
  phaseOptions: InputListOption[] = [];
  teamOptions: InputListOption[] = [];
  ruleGroupOptions: InputListOption[] = [];
  validationIssues: ScheduleValidationIssue[] = [];

  dialog?: "rule" | "fixture" | "generate" | "import" | "validation" | "preview";
  editingRule?: MatchdayRuleRow;
  editingFixture?: SpecificFixtureRow;
  seasonBaseDate = "2011-12-25";

  ruleDraft: RuleDraft = this.emptyRuleDraft();
  fixtureDraft: FixtureDraft = this.emptyFixtureDraft();

  generateMode: "league" | "groupStage" | "cup" = "league";
  generateStartMonth = 8;
  generateStartDay = 18;
  generateTime = "20:00";
  generateRounds = 1;
  generateIntervalDays = 7;
  generateMinGames = 1;
  generateMaxGames = 1;
  generateIncludeSetup = false;
  generatedPreview: GeneratedRulePreview[] = [];

  importPhaseId = 0;
  importYear = new Date().getFullYear();
  importCsv = "";

  decisionType: "deleteRule" | "deleteFixture" | "alert" | null = null;
  decisionTitle = "";
  decisionText = "";
  decisionOptions: DecisionOption[] = [];
  pendingDeleteRule?: MatchdayRuleRow;
  pendingDeleteFixture?: SpecificFixtureRow;
  readonly monthOptions = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, index) => ({ value: index + 1, label }));

  constructor(
    public readonly dates: ScheduleDateService,
    public readonly schedule: ScheduleService,
    public readonly scheduleDisplay: ScheduleDisplayService,
    public readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly validation: ScheduleValidationService,
    private readonly teamEditor: TeamEditorService,
    private readonly weather: WeatherService,
    private readonly weatherDisplay: WeatherDisplayService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["project"] || changes["competition"] || changes["referenceProject"]) {
      this.refreshData();
    }
  }

  get status(): "OK" | "Warning" {
    return this.validationIssues.length ? "Warning" : "OK";
  }

  get phasesScheduled(): number {
    return new Set([
      ...this.rules.map((rule) => rule.phase?.id).filter(Boolean),
      ...this.fixtures.map((fixture) => fixture.phase?.id).filter(Boolean)
    ]).size;
  }

  get specificFilesForTournament() {
    const phaseCodes = new Set(this.phases.map((phase) => phase.shortName.toLowerCase()));
    return (this.project.specificSchedules ?? []).filter((file) => file.competitionCode.toLowerCase() === this.competition.shortName.toLowerCase() && phaseCodes.has(file.stageCode.toLowerCase()));
  }

  get countryWeatherContext(): string {
    const country = this.project.objects.find((object) => object.id === this.competition.parentId);
    if (!country || country.kind !== 2) {
      return "weather depends on match country or stadium";
    }
    const configured = this.weather.configuredMonths(this.project, country.id).size;
    const label = this.weatherDisplay.countryObjectName(country, this.project, this.referenceProject);
    return configured === 12 ? `${label} configured` : `${label} has ${configured} of 12 months configured`;
  }

  get ruleFriendlyPreview(): string {
    if (!this.canSaveRule) return "Choose a phase, date, time and match count.";
    const phase = this.tree.object(this.project, this.ruleDraft.phaseId);
    const minGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.minGames);
    const maxGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.maxGames);
    return this.scheduleDisplay.ruleSummary(this.phaseName(phase), Number(this.ruleDraft.roundNumber), this.ruleDateInput(), this.ruleDraft.time, minGames, maxGames);
  }

  get ruleTechnicalPreview(): string {
    if (!this.canSaveRule) return "";
    const targetObjectId = this.ruleDraft.targetMode === "group" ? this.ruleDraft.groupId : this.ruleDraft.phaseId;
    const minGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.minGames);
    const maxGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.maxGames);
    return [targetObjectId, this.ruleDayOffsetPreview, this.ruleDraft.roundNumber, minGames, maxGames, this.dates.parseTimeToHHMM(this.ruleDraft.time)].join(",");
  }

  get ruleDayOffsetPreview(): number | string {
    const date = this.ruleDateInput();
    return date ? this.dates.dateToDayOffset(date, this.seasonBaseDate) : "Invalid date";
  }

  get canSaveRule(): boolean {
    const targetObjectId = this.ruleDraft.targetMode === "group" ? this.ruleDraft.groupId : this.ruleDraft.phaseId;
    const minGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.minGames);
    const maxGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.maxGames);
    const date = this.ruleDateInput();
    return targetObjectId > 0 && Boolean(date) && this.dates.isValidDateInput(this.seasonBaseDate) && this.dates.isValidHHMM(this.ruleDraft.time) && Number(this.ruleDraft.roundNumber) >= 1 && minGames >= 0 && maxGames >= minGames;
  }

  get fixtureFriendlyPreview(): string {
    if (!this.canSaveFixture) return "Choose the phase, date, time, home team and away team.";
    return this.scheduleDisplay.fixtureSummary(this.fixtureDraft.homeTeamId, this.fixtureDraft.awayTeamId, this.fixtureDateInput(), this.fixtureDraft.time, this.referenceProject);
  }

  get fixtureFilePreview(): string {
    const phase = this.tree.object(this.project, this.fixtureDraft.phaseId);
    return phase ? this.schedule.specificFileName(this.competition.shortName, phase.shortName, Number(this.fixtureDraft.year)) : "";
  }

  get fixtureTechnicalPreview(): string {
    if (!this.canSaveFixture) return "";
    return [this.dates.dateInputToSpecific(this.fixtureDateInput()), this.dates.parseTimeToHHMM(this.fixtureDraft.time), this.fixtureDraft.homeTeamId, this.fixtureDraft.awayTeamId].join(",");
  }

  get fixtureDateWithYearPreview(): string {
    const date = this.fixtureDateInput();
    return date ? this.dates.formatDateInput(date) : "Invalid date";
  }

  get canSaveFixture(): boolean {
    return this.fixtureDraft.phaseId > 0 && Number(this.fixtureDraft.year) > 1900 && Boolean(this.fixtureDateInput()) && this.dates.isValidHHMM(this.fixtureDraft.time) && Boolean(String(this.fixtureDraft.homeTeamId).trim()) && Boolean(String(this.fixtureDraft.awayTeamId).trim()) && String(this.fixtureDraft.homeTeamId).trim() !== String(this.fixtureDraft.awayTeamId).trim();
  }

  get generatedTechnicalLines(): string[] {
    return this.generatedPreview.map((item) => {
      const date = this.generatedDateInput(item);
      return [item.phaseId, date ? this.dates.dateToDayOffset(date, this.seasonBaseDate) : "dayOffset", item.roundNumber, item.minGames, item.maxGames, this.dates.parseTimeToHHMM(item.time) || "time"].join(",");
    });
  }

  get canApplyGeneratedCalendar(): boolean {
    return this.generatedPreview.length > 0 && this.generatedPreview.every((item) =>
      Boolean(this.generatedDateInput(item)) &&
      Number(item.roundNumber) >= 1 &&
      Number(item.minGames) >= 0 &&
      Number(item.maxGames) >= Number(item.minGames) &&
      this.dates.isValidHHMM(item.time)
    );
  }

  refreshData(): void {
    if (!this.seasonBaseDate) this.seasonBaseDate = this.dates.defaultSeasonBaseDate;
    this.phases = this.tree.phases(this.project, this.competition.id);
    this.phaseOptions = this.phases.map((phase) => ({ value: String(phase.id), label: this.phaseName(phase), detail: phase.shortName }));
    this.rules = this.schedule.listMatchdayRules(this.project, this.competition);
    this.fixtures = this.schedule.listSpecificFixtures(this.project, this.competition);
    this.validationIssues = this.validation.validateTournament(this.project, this.competition, this.referenceProject);
    this.teamOptions = this.referenceProject ? this.teamEditor.findTeams(this.referenceProject, "", 5000).map((team) => ({ value: team.teamId, label: team.displayName, detail: `Team ID ${team.teamId}`, searchText: `${team.displayName} ${team.teamId}` })) : [];
  }

  openAddRule(): void {
    const lastRule = this.rules[this.rules.length - 1];
    const firstPhase = this.phases[0];
    const defaultMonthDay = lastRule
      ? this.dates.dayOffsetToMonthDay(lastRule.entry.day + 7, this.seasonBaseDate)
      : { month: 8, day: 18 };
    this.editingRule = undefined;
    this.ruleDraft = {
      targetMode: "phase",
      phaseId: firstPhase?.id ?? 0,
      groupId: 0,
      roundNumber: (Math.max(0, ...this.rules.map((rule) => rule.entry.round)) || 0) + 1,
      month: defaultMonthDay.month,
      day: defaultMonthDay.day,
      time: lastRule ? this.dates.formatTimeHHMM(lastRule.entry.time) : "20:00",
      matchCountMode: "exact",
      matches: this.defaultMatchesForPhase(firstPhase),
      minGames: 1,
      maxGames: Math.max(1, this.defaultMatchesForPhase(firstPhase))
    };
    this.syncRuleTarget();
    this.dialog = "rule";
  }

  openEditRule(row: MatchdayRuleRow): void {
    this.editingRule = row;
    const monthDay = this.dates.dayOffsetToMonthDay(row.entry.day, this.seasonBaseDate);
    this.ruleDraft = {
      targetMode: row.group ? "group" : "phase",
      phaseId: row.phase?.id ?? 0,
      groupId: row.group?.id ?? 0,
      roundNumber: row.entry.round,
      month: monthDay.month,
      day: monthDay.day,
      time: this.dates.formatTimeHHMM(row.entry.time),
      matchCountMode: row.entry.minGames === row.entry.maxGames ? "exact" : "range",
      matches: row.entry.maxGames,
      minGames: row.entry.minGames,
      maxGames: row.entry.maxGames
    };
    this.syncRuleTarget();
    this.dialog = "rule";
  }

  setRulePhase(value: string): void {
    this.ruleDraft.phaseId = this.numberValue(value);
    this.syncRuleTarget();
  }

  syncRuleTarget(): void {
    const groups = this.tree.groups(this.project, this.ruleDraft.phaseId);
    this.ruleGroupOptions = groups.map((group) => ({ value: String(group.id), label: this.display.objectName(group, this.referenceProject, this.project), detail: group.shortName }));
    if (this.ruleDraft.targetMode === "group" && !groups.some((group) => group.id === this.ruleDraft.groupId)) {
      this.ruleDraft.groupId = groups[0]?.id ?? 0;
    }
    if (this.ruleDraft.targetMode === "phase") {
      this.ruleDraft.groupId = 0;
    }
  }

  saveRule(): void {
    if (!this.canSaveRule) return;
    const minGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.minGames);
    const maxGames = this.ruleDraft.matchCountMode === "exact" ? Number(this.ruleDraft.matches) : Number(this.ruleDraft.maxGames);
    const draft = {
      targetObjectId: this.ruleDraft.targetMode === "group" ? this.ruleDraft.groupId : this.ruleDraft.phaseId,
      date: this.ruleDateInput(),
      seasonBaseDate: this.seasonBaseDate,
      roundNumber: Number(this.ruleDraft.roundNumber),
      minGames,
      maxGames,
      time: this.ruleDraft.time
    };
    if (this.editingRule) this.schedule.updateMatchdayRule(this.project, this.editingRule.globalIndex, draft);
    else this.schedule.addMatchdayRule(this.project, draft);
    this.afterChange();
    this.closeDialog();
  }

  requestDeleteRule(row: MatchdayRuleRow): void {
    this.pendingDeleteRule = row;
    this.decisionType = "deleteRule";
    this.decisionTitle = "Remove this matchday rule?";
    this.decisionText = "This removes only the matchday rule. It will not remove phases or specific fixtures.";
    this.decisionOptions = [{ value: "cancel", label: "Cancel" }, { value: "confirm", label: "Remove rule", danger: true }];
  }

  openAddFixture(): void {
    const firstPhase = this.phases[0];
    const initTeams = this.project.initTeams.filter((team) => team.competitionId === this.competition.id).sort((a, b) => a.position - b.position);
    const year = new Date().getFullYear();
    this.editingFixture = undefined;
    this.fixtureDraft = {
      phaseId: firstPhase?.id ?? 0,
      year,
      month: 8,
      day: 18,
      time: "15:00",
      homeTeamId: initTeams[0]?.teamId ?? "",
      awayTeamId: initTeams[1]?.teamId ?? ""
    };
    this.dialog = "fixture";
  }

  openEditFixture(row: SpecificFixtureRow): void {
    this.editingFixture = row;
    const monthDay = this.dates.dateInputToMonthDay(this.dates.specificDateToInput(row.fixture.date));
    this.fixtureDraft = {
      phaseId: row.phase?.id ?? 0,
      year: row.file.year,
      month: monthDay.month,
      day: monthDay.day,
      time: this.dates.formatTimeHHMM(row.fixture.time),
      homeTeamId: row.fixture.homeTeamId,
      awayTeamId: row.fixture.awayTeamId
    };
    this.dialog = "fixture";
  }

  saveFixture(): void {
    if (!this.canSaveFixture) return;
    const draft = { ...this.fixtureDraft, year: Number(this.fixtureDraft.year), date: this.fixtureDateInput() };
    if (this.editingFixture) this.schedule.updateSpecificFixture(this.project, this.competition, this.editingFixture, draft);
    else this.schedule.addSpecificFixture(this.project, this.competition, draft);
    this.afterChange();
    this.closeDialog();
  }

  requestDeleteFixture(row: SpecificFixtureRow): void {
    this.pendingDeleteFixture = row;
    this.decisionType = "deleteFixture";
    this.decisionTitle = "Remove this fixture?";
    this.decisionText = "This removes only this fixture. It will not remove teams, seeding or tournament structure.";
    this.decisionOptions = [{ value: "cancel", label: "Cancel" }, { value: "confirm", label: "Remove fixture", danger: true }];
  }

  openGenerateCalendar(): void {
    const firstPhase = this.phases[0];
    this.generateMode = firstPhase?.description === "FCE_Group_Stage" ? "groupStage" : this.phases.some((phase) => this.display.isKnockoutPhase(phase)) ? "cup" : "league";
    this.generateStartMonth = 8;
    this.generateStartDay = 18;
    this.generateTime = "20:00";
    this.generateIntervalDays = 7;
    this.generateRounds = this.defaultRoundsForGenerate();
    const matches = this.defaultMatchesForPhase(firstPhase);
    this.generateMinGames = matches;
    this.generateMaxGames = matches;
    this.generateIncludeSetup = false;
    this.buildGeneratedPreview();
    this.dialog = "generate";
  }

  buildGeneratedPreview(): void {
    this.generatedPreview = [];
    const startDate = this.dates.monthDayToDateInput(Number(this.generateStartMonth), Number(this.generateStartDay), this.seasonBaseDate);
    if (!startDate) return;
    if (this.generateMode === "cup") {
      const phases = this.phases.filter((phase) => this.generateIncludeSetup || !/setup/i.test(phase.description));
      phases.forEach((phase, index) => {
        const matches = this.defaultMatchesForPhase(phase);
        const monthDay = this.dates.dateInputToMonthDay(this.dates.addDays(startDate, index * Number(this.generateIntervalDays || 7)));
        this.generatedPreview.push({
          phaseId: phase.id,
          roundNumber: 1,
          month: monthDay.month,
          day: monthDay.day,
          time: this.generateTime,
          minGames: matches,
          maxGames: matches
        });
      });
      return;
    }

    const phase = this.phases.find((candidate) => candidate.description === (this.generateMode === "groupStage" ? "FCE_Group_Stage" : "FCE_League_Stage")) ?? this.phases[0];
    if (!phase) return;
    for (let round = 1; round <= Number(this.generateRounds || 1); round += 1) {
      const monthDay = this.dates.dateInputToMonthDay(this.dates.addDays(startDate, (round - 1) * Number(this.generateIntervalDays || 7)));
      this.generatedPreview.push({
        phaseId: phase.id,
        roundNumber: round,
        month: monthDay.month,
        day: monthDay.day,
        time: this.generateTime,
        minGames: Number(this.generateMinGames || 0),
        maxGames: Number(this.generateMaxGames || this.generateMinGames || 0)
      });
    }
  }

  addGeneratedMatchday(): void {
    const last = this.generatedPreview[this.generatedPreview.length - 1];
    const phase = last?.phaseId ?? this.phases[0]?.id ?? 0;
    const monthDay = last
      ? this.dates.addDaysToMonthDay(last.month, last.day, Number(this.generateIntervalDays || 7), this.seasonBaseDate)
      : { month: this.generateStartMonth, day: this.generateStartDay };
    this.generatedPreview.push({
      phaseId: phase,
      roundNumber: (last?.roundNumber ?? 0) + 1,
      month: monthDay.month,
      day: monthDay.day,
      time: last?.time ?? this.generateTime,
      minGames: last?.minGames ?? this.generateMinGames,
      maxGames: last?.maxGames ?? this.generateMaxGames
    });
  }

  applyGeneratedCalendar(): void {
    for (const item of this.generatedPreview) {
      this.schedule.addMatchdayRule(this.project, {
        targetObjectId: item.phaseId,
        date: this.generatedDateInput(item),
        seasonBaseDate: this.seasonBaseDate,
        roundNumber: item.roundNumber,
        minGames: Number(item.minGames),
        maxGames: Number(item.maxGames),
        time: item.time
      });
    }
    this.afterChange();
    this.closeDialog();
  }

  openImportFixtures(): void {
    this.importPhaseId = this.phases[0]?.id ?? 0;
    this.importYear = new Date().getFullYear();
    this.importCsv = "date,time,homeTeamId,awayTeamId\n20260818,1500,1,106";
    this.dialog = "import";
  }

  applyImportFixtures(): void {
    const count = this.schedule.importFixtures(this.project, this.competition, this.importPhaseId, Number(this.importYear), this.importCsv);
    if (!count) {
      this.decisionType = "alert";
      this.decisionTitle = "No fixtures imported";
      this.decisionText = "Check the CSV format and try again.";
      this.decisionOptions = [{ value: "cancel", label: "OK", primary: true }];
      return;
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
    this.editingRule = undefined;
    this.editingFixture = undefined;
  }

  onDecisionAction(action: string): void {
    const type = this.decisionType;
    this.decisionType = null;
    if (action !== "confirm") return;
    if (type === "deleteRule" && this.pendingDeleteRule) {
      this.schedule.removeMatchdayRule(this.project, this.pendingDeleteRule.globalIndex);
      this.afterChange();
    }
    if (type === "deleteFixture" && this.pendingDeleteFixture) {
      this.schedule.removeSpecificFixture(this.pendingDeleteFixture);
      this.afterChange();
    }
    this.pendingDeleteRule = undefined;
    this.pendingDeleteFixture = undefined;
  }

  phaseName(phase: CompdataObject | undefined): string {
    return this.scheduleDisplay.phaseName(phase, this.project, this.referenceProject);
  }

  phaseNameById(id: number): string {
    return this.phaseName(this.tree.object(this.project, Number(id)));
  }

  appliesTo(row: MatchdayRuleRow): string {
    return this.scheduleDisplay.appliesTo(row.target, row.phase, this.project, this.referenceProject);
  }

  matchdayDate(dayOffset: number): string {
    return this.dates.formatSeasonDateInput(this.dates.dayOffsetToDate(dayOffset, this.seasonBaseDate));
  }

  stringValue(value: number): string {
    return value > 0 ? String(value) : "";
  }

  numberValue(value: string): number {
    return Number(value) || 0;
  }

  private ruleDateInput(): string {
    return this.dates.monthDayToDateInput(Number(this.ruleDraft.month), Number(this.ruleDraft.day), this.seasonBaseDate);
  }

  private fixtureDateInput(): string {
    return this.dates.dateFromParts(Number(this.fixtureDraft.year), Number(this.fixtureDraft.month), Number(this.fixtureDraft.day));
  }

  private generatedDateInput(item: GeneratedRulePreview): string {
    return this.dates.monthDayToDateInput(Number(item.month), Number(item.day), this.seasonBaseDate);
  }

  private afterChange(): void {
    this.refreshData();
    this.structureChanged.emit();
  }

  private defaultRoundsForGenerate(): number {
    const firstPhase = this.phases[0];
    const teams = firstPhase ? this.defaultTeamsForPhase(firstPhase) : 2;
    if (this.generateMode === "league") return Math.max(1, (teams - 1) * 2);
    if (this.generateMode === "groupStage") return teams <= 4 ? 6 : Math.max(1, teams - 1);
    return Math.max(1, this.phases.filter((phase) => !/setup/i.test(phase.description)).length);
  }

  private defaultMatchesForPhase(phase: CompdataObject | undefined): number {
    if (!phase) return 1;
    const groups = this.tree.groups(this.project, phase.id);
    if (this.display.isKnockoutPhase(phase)) return Math.max(1, groups.length);
    const teamsPerGroup = this.defaultTeamsForPhase(phase);
    return Math.max(1, groups.length * Math.floor(teamsPerGroup / 2));
  }

  private defaultTeamsForPhase(phase: CompdataObject): number {
    const groups = this.tree.groups(this.project, phase.id);
    const firstGroup = groups[0];
    return firstGroup ? Math.max(2, this.tree.getPositionsCount(this.project, firstGroup.id)) : 2;
  }

  private emptyRuleDraft(): RuleDraft {
    return { targetMode: "phase", phaseId: 0, groupId: 0, roundNumber: 1, month: 8, day: 18, time: "20:00", matchCountMode: "exact", matches: 1, minGames: 1, maxGames: 1 };
  }

  private emptyFixtureDraft(): FixtureDraft {
    return { phaseId: 0, year: new Date().getFullYear(), month: 8, day: 18, time: "15:00", homeTeamId: "", awayTeamId: "" };
  }
}
