import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataProject, CompdataTask, DbProject } from "../../../shared/types";
import { nations } from "../../../utils/get-nations/get-nations";
import { InputListComponent, InputListOption } from "../../components/input-list/input-list.component";
import { LeagueEditorService } from "../../services/league-editor.service";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import {
  ContinentalCompetition,
  ContinentalQualificationService,
  ContinentalRegion,
  ContinentalValidationIssue,
  QualificationKind,
  QualificationOption,
  QualificationSlot
} from "../../services/compdata/continental-qualification.service";
import { SettingsService } from "../../services/compdata/settings.service";
import { TasksDisplayService } from "../../services/compdata/tasks-display.service";
import { KnownTaskAction, TasksService, TeamSourceTaskDraft, TeamSourceTaskRow } from "../../services/compdata/tasks.service";

type ContinentalDialog = "slot" | "allocation" | "copy" | "fillRule" | "validation" | "preview" | undefined;
type FillSourceType = "league" | "leagueLimit" | "coefficient" | "specialNation" | "competition" | "backupLeague" | "backupCompetition";

@Component({
  selector: "app-continental-qualification",
  standalone: true,
  imports: [CommonModule, FormsModule, InputListComponent],
  template: `
    <section class="tse-content tse-rules-content">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Tournament Editor / Continental Qualification</div>
          <h1>Continental Qualification</h1>
          <p>Choose which league or cup positions qualify for continental competitions.</p>
        </div>
        <span class="tse-structure-badge">{{ validationStatus }}</span>
      </header>

      <div class="tse-summary-grid">
        <div><strong>{{ qualificationSummary('libertadores') || qualificationSummary('ucl') || 'Not set' }}</strong><span>{{ region === 'CONMEBOL' ? 'Libertadores' : 'Champions League' }}</span></div>
        <div><strong>{{ qualificationSummary('libertadoresQual') || qualificationSummary('uel') || 'Not set' }}</strong><span>{{ region === 'CONMEBOL' ? 'Libertadores Qualifying' : 'Europa League' }}</span></div>
        <div><strong>{{ qualificationSummary('sudamericana') || qualificationSummary('uecl') || 'Not set' }}</strong><span>{{ region === 'CONMEBOL' ? 'Sudamericana' : 'Conference League' }}</span></div>
        <div [class.warn]="validationIssues.length"><strong>{{ validationStatus }}</strong><span>Status</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="openAddSlot()">Add qualification slot</button>
        <button type="button" (click)="openCopySlots()">Copy from another league</button>
        <button type="button" (click)="clearSlots()" [disabled]="!qualificationSlots.length">Clear continental slots</button>
        <button type="button" (click)="openAllocation()">Configure country allocation</button>
        <button type="button" (click)="openValidation()">Validate</button>
        <button type="button" (click)="openPreview()">Preview technical lines</button>
      </div>

      <section class="tse-section tse-rules-panel">
        <div class="tse-section-heading">
          <div>
            <h2>Continental qualification positions</h2>
            <p>League table markers for continental competition places.</p>
          </div>
          <label class="tse-field tse-inline-select" *ngIf="tableGroups.length > 1"><span>Table/group</span><select [(ngModel)]="selectedGroupId" (ngModelChange)="refresh()">
            <option *ngFor="let group of tableGroups" [ngValue]="group.id">{{ groupPathLabel(group.id) }}</option>
          </select></label>
        </div>
        <div class="tse-data-table qualification">
          <div class="head"><span>Position</span><span>Qualification</span><span>Actions</span></div>
          <div class="row" *ngFor="let row of positionRows">
            <span>{{ row.position }}</span>
            <span>{{ row.slot?.label || 'No continental qualification' }}</span>
            <span class="tse-row-actions"><button type="button" (click)="openEditSlot(row.position)">Edit</button></span>
          </div>
        </div>
        <div class="tse-field-help" *ngIf="!positionRows.length">No league positions were found for this table. Add standings/teams first.</div>
      </section>

      <section class="tse-section tse-rules-panel">
        <div class="tse-section-heading">
          <div>
            <h2>Country allocation</h2>
            <p>These values are used by the game when filling continental competitions.</p>
          </div>
          <button type="button" (click)="openAllocation()">Edit allocation</button>
        </div>
        <div class="tse-summary-grid three">
          <div><strong>{{ countryLabel }}</strong><span>Country</span></div>
          <div><strong>{{ regionLabel }}</strong><span>Confederation</span></div>
          <div [class.warn]="!countryAllocation.length"><strong>{{ countryAllocation.length ? countryAllocation.join(', ') : 'Missing' }}</strong><span>Allocation values</span></div>
        </div>
        <div class="tse-field-help" *ngIf="!countryAllocation.length && countryObject">
          This country has no continental allocation configured.
        </div>
        <div class="tse-field-help" *ngIf="!countryObject">
          This tournament is not directly attached to a country, so domestic country allocation could not be resolved.
        </div>
      </section>

      <section class="tse-section tse-rules-panel" *ngIf="specialPools.length">
        <div class="tse-section-heading">
          <div>
            <h2>Special qualification pools</h2>
            <p>Special teams by nation, grouped from confederation settings.</p>
          </div>
        </div>
        <div class="tse-summary-grid three">
          <div *ngFor="let pool of specialPools"><strong>{{ pool.values.join(' / ') || 'No values' }}</strong><span>{{ pool.nationLabel }}</span></div>
        </div>
      </section>

      <section class="tse-section tse-rules-panel">
        <div class="tse-section-heading">
          <div>
            <h2>How continental competitions are filled</h2>
            <p>These rules tell the game where teams come from at the start of the season.</p>
          </div>
          <button type="button" class="tse-primary" (click)="openAddFillRule()">Add fill rule</button>
        </div>

        <div class="tse-tab-bar compact">
          <button type="button" class="tse-tab" [class.active]="competitionRegionFilter === 'UEFA'" (click)="competitionRegionFilter = 'UEFA'">UEFA</button>
          <button type="button" class="tse-tab" [class.active]="competitionRegionFilter === 'CONMEBOL'" (click)="competitionRegionFilter = 'CONMEBOL'">CONMEBOL</button>
          <button type="button" class="tse-tab" [class.active]="competitionRegionFilter === 'OTHER'" (click)="competitionRegionFilter = 'OTHER'">Other confederations</button>
        </div>

        <div class="tse-continental-list" *ngIf="filteredContinentalCompetitions.length; else noContinentalCompetitions">
          <article *ngFor="let competition of filteredContinentalCompetitions">
            <header>
              <div><strong>{{ competition.label }}</strong><span>{{ competition.region }} competition</span></div>
              <button type="button" (click)="openAddFillRule(competition.object.id)">Add rule</button>
            </header>
            <div class="tse-inline-empty" *ngIf="!competition.startRules.length"><strong>No start rules</strong><span>This competition has no rules to fill teams.</span></div>
            <div class="tse-rule-list" *ngIf="competition.startRules.length">
              <div *ngFor="let row of competition.startRules">
                <span>{{ continental.fillRuleSentence(project, row.task, reference) }}</span>
                <div class="tse-row-actions">
                  <button type="button" *ngIf="row.known" (click)="openEditFillRule(row)">Edit</button>
                  <button type="button" (click)="moveFillRule(row, -1)">Up</button>
                  <button type="button" (click)="moveFillRule(row, 1)">Down</button>
                  <button type="button" (click)="duplicateFillRule(row)">Duplicate</button>
                  <button type="button" class="tse-danger-link" (click)="deleteFillRule(row)">Delete</button>
                </div>
                <details class="tse-technical compact">
                  <summary>Technical preview</summary>
                  <code>{{ tasks.rawLine(row.task) }}</code>
                </details>
              </div>
            </div>
          </article>
        </div>
        <ng-template #noContinentalCompetitions>
          <div class="tse-main-empty"><strong>No continental competitions found</strong><span>Competitions must be under a confederation object in compobj.txt.</span></div>
        </ng-template>
      </section>
    </section>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'slot'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Continental qualification</span><h2>Edit qualification slot</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>League position</span><input type="number" min="1" [(ngModel)]="slotDraft.position" /></label>
          <label class="tse-field"><span>Qualification</span><select [(ngModel)]="slotDraft.kind">
            <option *ngFor="let option of qualificationOptions" [ngValue]="option.kind">{{ option.label }}</option>
          </select></label>
          <div class="tse-resolved"><small>Preview</small><strong>{{ slotPreviewText }}</strong></div>
          <details class="tse-technical">
            <summary>Show technical details</summary>
            <code>{{ slotTechnicalPreview }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!slotDraft.position" (click)="saveSlot()">Save slot</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'allocation'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Country allocation</span><h2>Edit allocation values</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <p>{{ regionLabel }} allocation for {{ countryLabel }}.</p>
          <label class="tse-field"><span>Allocation values</span><input [(ngModel)]="allocationDraft" placeholder="4,2,1,1" /></label>
          <div class="tse-field-help">Preserves the order of repeated allocation values. Use commas between values.</div>
          <details class="tse-technical">
            <summary>Show technical details</summary>
            <code *ngFor="let line of allocationTechnicalPreview">{{ line }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!countryObject" (click)="saveAllocation()">Save allocation</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'copy'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Continental qualification</span><h2>Copy from another league</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>Source league/tournament</span><select [(ngModel)]="copySourceCompetitionId" (ngModelChange)="updateCopySourceGroup()">
            <option [ngValue]="0">Choose league...</option>
            <option *ngFor="let option of domesticCompetitionOptions" [ngValue]="option.id">{{ option.label }}</option>
          </select></label>
          <label class="tse-field"><span>Source table/group</span><select [(ngModel)]="copySourceGroupId">
            <option *ngFor="let option of copySourceGroups" [ngValue]="option.id">{{ option.label }}</option>
          </select></label>
          <details class="tse-technical">
            <summary>Preview copied settings.txt lines</summary>
            <code *ngFor="let line of copyPreviewLines">{{ line }}</code>
            <p *ngIf="!copyPreviewLines.length">Choose a source league with qualification slots.</p>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!copyPreviewLines.length" (click)="applyCopySlots()">Apply copied slots</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'fillRule'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Fill continental competition</span><h2>{{ editingFillRule ? 'Edit fill rule' : 'Add fill rule' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>Continental competition</span><select [(ngModel)]="fillCompetitionId" (ngModelChange)="onFillCompetitionChange()">
            <option *ngFor="let competition of continentalCompetitions" [ngValue]="competition.object.id">{{ competition.label }}</option>
          </select></label>
          <label class="tse-field"><span>Where should teams go?</span><app-input-list [value]="stringValue(fillDraft.targetId)" [options]="fillTargetOptions" [searchable]="true" searchPlaceholder="Search setup group..." placeholder="Choose setup group" (valueChange)="fillDraft.targetId = numberValue($event)"></app-input-list></label>
          <label class="tse-field"><span>Where do teams come from?</span><select [(ngModel)]="fillSourceType" (ngModelChange)="applyFillSourceDefaults()">
            <option value="league">League position / domestic league</option>
            <option value="leagueLimit">League with country limit</option>
            <option value="coefficient">Country allocation / coefficient ranking</option>
            <option value="specialNation">Special teams by nation</option>
            <option value="competition">Another competition table</option>
            <option value="backupLeague">Another competition with backup league</option>
            <option value="backupCompetition">Another competition with backup tournament</option>
          </select></label>

          <ng-container [ngSwitch]="fillSourceType">
            <ng-container *ngSwitchCase="'league'">
              <label class="tse-field"><span>League</span><app-input-list [value]="fillDraft.param1" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="fillDraft.param1 = $event"></app-input-list></label>
            </ng-container>
            <ng-container *ngSwitchCase="'leagueLimit'">
              <label class="tse-field"><span>League</span><app-input-list [value]="fillDraft.param1" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose league" (valueChange)="fillDraft.param1 = $event"></app-input-list></label>
              <div class="tse-form-grid two"><label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param2" /></label><label class="tse-field"><span>Maximum from same country</span><input type="number" min="1" [(ngModel)]="fillDraft.param3" /></label></div>
            </ng-container>
            <ng-container *ngSwitchCase="'coefficient'">
              <div class="tse-form-grid three"><label class="tse-field"><span>Country coefficient rank</span><input type="number" min="1" [(ngModel)]="fillDraft.param1" /></label><label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param2" /></label><label class="tse-field"><span>Allocation/seed slot</span><input type="number" min="1" [(ngModel)]="fillDraft.param3" /></label></div>
            </ng-container>
            <ng-container *ngSwitchCase="'specialNation'">
              <label class="tse-field"><span>Nation</span><app-input-list [value]="fillDraft.param2" [options]="nationOptions" [searchable]="true" searchPlaceholder="Search nation..." placeholder="Choose nation" (valueChange)="fillDraft.param2 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param1" /></label>
            </ng-container>
            <ng-container *ngSwitchCase="'competition'">
              <label class="tse-field"><span>Source competition</span><app-input-list [value]="fillDraft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search competition..." placeholder="Choose source competition" (valueChange)="fillDraft.param1 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param2" /></label>
            </ng-container>
            <ng-container *ngSwitchCase="'backupLeague'">
              <label class="tse-field"><span>Source competition</span><app-input-list [value]="fillDraft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search competition..." placeholder="Choose source competition" (valueChange)="fillDraft.param1 = $event"></app-input-list></label>
              <label class="tse-field"><span>Backup league</span><app-input-list [value]="fillDraft.param2" [options]="leagueOptions" [searchable]="true" searchPlaceholder="Search league..." placeholder="Choose backup league" (valueChange)="fillDraft.param2 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param3" /></label>
            </ng-container>
            <ng-container *ngSwitchCase="'backupCompetition'">
              <label class="tse-field"><span>Source competition</span><app-input-list [value]="fillDraft.param1" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search competition..." placeholder="Choose source competition" (valueChange)="fillDraft.param1 = $event"></app-input-list></label>
              <label class="tse-field"><span>Backup competition</span><app-input-list [value]="fillDraft.param2" [options]="competitionOptions" [searchable]="true" searchPlaceholder="Search competition..." placeholder="Choose backup competition" (valueChange)="fillDraft.param2 = $event"></app-input-list></label>
              <label class="tse-field"><span>Number of teams</span><input type="number" min="1" [(ngModel)]="fillDraft.param3" /></label>
            </ng-container>
          </ng-container>

          <div class="tse-resolved"><small>Review</small><strong>{{ fillRulePreview }}</strong></div>
          <details class="tse-technical">
            <summary>Show technical details</summary>
            <code>{{ fillRuleTechnicalPreview }}</code>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canSaveFillRule" (click)="saveFillRule()">Save rule</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'validation'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header"><div><span>Validation</span><h2>{{ validationStatus }}</h2></div><button type="button" (click)="closeDialog()">×</button></header>
        <div class="tse-modal-body tse-validation-list">
          <ng-container *ngIf="validationIssues.length; else noIssues">
            <article *ngFor="let issue of validationIssues" [class.error]="issue.severity === 'error'"><strong>{{ issue.severity === 'error' ? 'Error' : 'Warning' }}</strong><span>{{ issue.message }}</span><small *ngIf="issue.technical">Technical detail: {{ issue.technical }}</small></article>
          </ng-container>
          <ng-template #noIssues><ul class="tse-success-list"><li>Continental qualification looks valid</li></ul></ng-template>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Done</button></footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'preview'">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header"><div><span>Technical preview</span><h2>Continental qualification lines</h2></div><button type="button" (click)="closeDialog()">×</button></header>
        <div class="tse-modal-body">
          <div class="tse-code-panel"><span>settings.txt qualification slots</span><code *ngFor="let line of settingsPreviewLines">{{ line }}</code><code *ngIf="!settingsPreviewLines.length">No continental settings for this league.</code></div>
          <div class="tse-code-panel"><span>tasks.txt continental fill rules</span><code *ngFor="let line of taskPreviewLines">{{ line }}</code><code *ngIf="!taskPreviewLines.length">No continental fill rules.</code></div>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Close preview</button></footer>
      </section>
    </div>
  `
})
export class ContinentalQualificationComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() reference?: DbProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<void>();

  dialog: ContinentalDialog;
  selectedGroupId = 0;
  region: ContinentalRegion = "OTHER";
  competitionRegionFilter: ContinentalRegion = "UEFA";
  qualificationSlots: QualificationSlot[] = [];
  countryAllocation: string[] = [];
  continentalCompetitions: ContinentalCompetition[] = [];
  validationIssues: ContinentalValidationIssue[] = [];
  allocationDraft = "";
  copySourceCompetitionId = 0;
  copySourceGroupId = 0;
  copySourceGroups: Array<{ id: number; label: string }> = [];
  editingFillRule?: TeamSourceTaskRow;
  fillCompetitionId = 0;
  fillSourceType: FillSourceType = "league";
  fillDraft: TeamSourceTaskDraft = { timing: "start", action: "FillFromLeague", targetId: 0, param1: "", param2: "1", param3: "0" };
  slotDraft: { position: number; kind: QualificationKind } = { position: 1, kind: "none" };
  leagueOptions: InputListOption[] = [];
  competitionOptions: InputListOption[] = [];
  fillTargetOptions: InputListOption[] = [];
  nationOptions: InputListOption[] = nations.map((nation) => ({ value: String(nation.id), label: nation.name, detail: `Nation ID ${nation.id}`, searchText: `${nation.name} ${nation.id}` }));
  private activeCompetitionId = 0;

  constructor(
    public readonly continental: ContinentalQualificationService,
    public readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly settings: SettingsService,
    public readonly tasks: TasksService,
    private readonly tasksDisplay: TasksDisplayService,
    private readonly leagues: LeagueEditorService
  ) {}

  ngOnChanges(): void {
    this.refresh();
  }

  get tableGroups() {
    return this.continental.tableGroups(this.project, this.competition);
  }

  get countryObject() {
    return this.continental.countryForCompetition(this.project, this.competition);
  }

  get countryLabel(): string {
    return this.countryObject ? this.display.objectName(this.countryObject, this.reference, this.project) : "No country";
  }

  get confederationObject() {
    return this.continental.confederationForObject(this.project, this.competition.id);
  }

  get regionLabel(): string {
    return this.region === "OTHER" ? this.display.objectName(this.confederationObject, this.reference, this.project) : this.region;
  }

  get qualificationOptions(): QualificationOption[] {
    return this.continental.qualificationOptions(this.region);
  }

  get positionRows(): Array<{ position: number; slot?: QualificationSlot }> {
    const count = this.continental.positionsCount(this.project, this.selectedGroupId);
    return Array.from({ length: count }, (_value, index) => {
      const position = index + 1;
      return { position, slot: this.continental.qualificationForPosition(this.project, this.selectedGroupId, position) };
    });
  }

  get validationStatus(): string {
    if (this.validationIssues.some((issue) => issue.severity === "error")) return "Error";
    return this.validationIssues.length ? "Warning" : "OK";
  }

  get specialPools() {
    const confed = this.confederationObject;
    return confed ? this.continental.specialTeamPools(this.project, confed.id, this.region) : [];
  }

  get filteredContinentalCompetitions(): ContinentalCompetition[] {
    return this.continentalCompetitions.filter((competition) => competition.region === this.competitionRegionFilter);
  }

  get domesticCompetitionOptions(): Array<{ id: number; label: string }> {
    return this.project.competitions
      .filter((competition) => competition.id !== this.competition.id)
      .filter((competition) => this.continental.tableGroups(this.project, competition).some((group) => this.continental.positionsCount(this.project, group.id) > 0))
      .map((competition) => ({ id: competition.id, label: this.display.objectName(this.tree.object(this.project, competition.id), this.reference, this.project) }));
  }

  get copyPreviewLines(): string[] {
    if (!this.copySourceGroupId || !this.selectedGroupId) return [];
    return this.continental.qualificationSlots(this.project, this.copySourceGroupId)
      .filter((slot) => slot.attribute)
      .map((slot) => `${this.selectedGroupId},${slot.attribute},${slot.position}`);
  }

  get allocationTechnicalPreview(): string[] {
    const country = this.countryObject;
    if (!country) return [];
    const attr = this.continental.allocationAttribute(this.region);
    return this.parseList(this.allocationDraft).map((value) => `${country.id},${attr},${value}`);
  }

  get slotPreviewText(): string {
    const option = this.qualificationOptions.find((candidate) => candidate.kind === this.slotDraft.kind);
    if (!option || option.kind === "none") return `Position ${this.slotDraft.position} has no continental qualification.`;
    return `Position ${this.slotDraft.position} qualifies for ${option.label}.`;
  }

  get slotTechnicalPreview(): string {
    const option = this.qualificationOptions.find((candidate) => candidate.kind === this.slotDraft.kind);
    return option?.attribute ? `${this.selectedGroupId},${option.attribute},${this.slotDraft.position}` : "No settings.txt line will be generated.";
  }

  get fillRulePreview(): string {
    if (!this.canSaveFillRule) return "Choose the rule details first.";
    return this.tasksDisplay.friendlySentence(this.project, this.tasks.taskFromDraft(this.fillCompetitionId, this.fillDraft), this.reference);
  }

  get fillRuleTechnicalPreview(): string {
    return this.tasks.rawLine(this.tasks.taskFromDraft(this.fillCompetitionId, this.fillDraft));
  }

  get canSaveFillRule(): boolean {
    if (this.fillCompetitionId <= 0 || this.fillDraft.targetId <= 0) return false;
    switch (this.fillSourceType) {
      case "league":
        return this.positive(this.fillDraft.param1);
      case "leagueLimit":
        return this.positive(this.fillDraft.param1) && this.positive(this.fillDraft.param2) && this.positive(this.fillDraft.param3);
      case "coefficient":
        return this.positive(this.fillDraft.param1) && this.positive(this.fillDraft.param2) && this.positive(this.fillDraft.param3);
      case "specialNation":
        return this.positive(this.fillDraft.param1) && this.positive(this.fillDraft.param2);
      case "competition":
        return this.positive(this.fillDraft.param1) && this.positive(this.fillDraft.param2);
      case "backupLeague":
      case "backupCompetition":
        return this.positive(this.fillDraft.param1) && this.positive(this.fillDraft.param2) && this.positive(this.fillDraft.param3);
      default:
        return false;
    }
  }

  get settingsPreviewLines(): string[] {
    const country = this.countryObject;
    const groupLines = this.qualificationSlots.flatMap((slot) => slot.entries.map((entry) => this.settings.rawLine(entry)));
    const allocationLines = country ? this.countryAllocation.map((value) => `${country.id},${this.continental.allocationAttribute(this.region)},${value}`) : [];
    return [...groupLines, ...allocationLines];
  }

  get taskPreviewLines(): string[] {
    return this.continentalCompetitions.flatMap((competition) => competition.startRules.map((row) => this.tasks.rawLine(row.task)));
  }

  refresh(): void {
    this.region = this.continental.regionForCompetition(this.project, this.competition);
    if (this.activeCompetitionId !== this.competition.id) {
      this.activeCompetitionId = this.competition.id;
      this.competitionRegionFilter = this.region === "OTHER" ? "UEFA" : this.region;
    }
    const primaryGroup = this.continental.primaryTableGroup(this.project, this.competition);
    if (!this.selectedGroupId || !this.tableGroups.some((group) => group.id === this.selectedGroupId)) {
      this.selectedGroupId = primaryGroup?.id ?? 0;
    }
    const country = this.countryObject;
    this.qualificationSlots = this.selectedGroupId ? this.continental.qualificationSlots(this.project, this.selectedGroupId) : [];
    this.countryAllocation = country ? this.continental.countryAllocation(this.project, country.id, this.region) : [];
    this.continentalCompetitions = this.continental.continentalCompetitions(this.project, this.reference);
    this.validationIssues = [
      ...this.continental.validateDomesticLeague(this.project, this.competition, this.selectedGroupId, this.region),
      ...this.continental.validateContinentalCompetitions(this.project, this.continentalCompetitions.filter((competition) => competition.region === this.region))
    ];
    this.competitionOptions = this.project.competitions.map((competition) => ({ value: String(competition.id), label: this.display.objectName(this.tree.object(this.project, competition.id), this.reference, this.project), detail: "Competition", searchText: `${competition.shortName} ${competition.description} ${competition.id}` }));
    this.leagueOptions = this.reference ? this.leagues.findLeagues(this.reference, "", "", 5000).map((league) => ({ value: league.leagueId, label: league.displayName, detail: `leagueId ${league.leagueId}`, searchText: `${league.displayName} ${league.leagueId}` })) : [];
  }

  qualificationSummary(kind: QualificationKind): string {
    const positions = this.qualificationSlots.filter((slot) => slot.kind === kind).map((slot) => slot.position).sort((a, b) => a - b);
    if (!positions.length) return "";
    return positions.length === 1 ? `position ${positions[0]}` : `positions ${positions.join(", ")}`;
  }

  groupPathLabel(groupId: number): string {
    return this.tasksDisplay.targetLabel(this.project, groupId, this.reference);
  }

  openAddSlot(): void {
    this.slotDraft = { position: Math.max(1, this.qualificationSlots.length + 1), kind: this.qualificationOptions.find((option) => option.kind !== "champion" && option.kind !== "none")?.kind ?? "none" };
    this.dialog = "slot";
  }

  openEditSlot(position: number): void {
    const slot = this.continental.qualificationForPosition(this.project, this.selectedGroupId, position);
    this.slotDraft = { position, kind: slot?.kind ?? "none" };
    this.dialog = "slot";
  }

  saveSlot(): void {
    this.continental.setQualificationSlot(this.project, this.selectedGroupId, Number(this.slotDraft.position), this.slotDraft.kind);
    this.afterChange();
    this.closeDialog();
  }

  clearSlots(): void {
    if (!confirm("Clear continental qualification slots for this table?")) return;
    this.continental.clearQualificationSlots(this.project, this.selectedGroupId);
    this.afterChange();
  }

  openAllocation(): void {
    this.allocationDraft = this.countryAllocation.join(", ");
    this.dialog = "allocation";
  }

  saveAllocation(): void {
    const country = this.countryObject;
    if (!country) return;
    this.continental.setCountryAllocation(this.project, country.id, this.region, this.parseList(this.allocationDraft));
    this.afterChange();
    this.closeDialog();
  }

  openCopySlots(): void {
    this.copySourceCompetitionId = this.domesticCompetitionOptions[0]?.id ?? 0;
    this.updateCopySourceGroup();
    this.dialog = "copy";
  }

  updateCopySourceGroup(): void {
    const source = this.project.competitions.find((competition) => competition.id === Number(this.copySourceCompetitionId));
    this.copySourceGroups = source ? this.continental.tableGroups(this.project, source).map((group) => ({ id: group.id, label: this.groupPathLabel(group.id) })) : [];
    this.copySourceGroupId = this.copySourceGroups[0]?.id ?? 0;
  }

  applyCopySlots(): void {
    this.continental.clearQualificationSlots(this.project, this.selectedGroupId);
    for (const slot of this.continental.qualificationSlots(this.project, this.copySourceGroupId)) {
      this.continental.setQualificationSlot(this.project, this.selectedGroupId, slot.position, slot.kind);
    }
    this.afterChange();
    this.closeDialog();
  }

  openAddFillRule(competitionId = this.filteredContinentalCompetitions[0]?.object.id ?? this.continentalCompetitions[0]?.object.id ?? 0): void {
    this.editingFillRule = undefined;
    this.fillCompetitionId = competitionId;
    this.fillSourceType = "league";
    this.fillDraft = { timing: "start", action: "FillFromLeague", targetId: 0, param1: this.leagueOptions[0]?.value ?? "", param2: "1", param3: "0" };
    this.onFillCompetitionChange();
    this.dialog = "fillRule";
  }

  openEditFillRule(row: TeamSourceTaskRow): void {
    this.editingFillRule = row;
    this.fillCompetitionId = row.task.competitionId;
    this.fillSourceType = this.sourceTypeFromAction(row.task.action);
    this.fillDraft = { timing: "start", action: row.task.action as KnownTaskAction, targetId: row.task.targetId, param1: row.task.param1, param2: row.task.param2, param3: row.task.param3 };
    this.onFillCompetitionChange(false);
    this.dialog = "fillRule";
  }

  onFillCompetitionChange(resetTarget = true): void {
    this.fillTargetOptions = this.continental.targetGroupOptions(this.project, Number(this.fillCompetitionId), this.reference);
    if (resetTarget || !this.fillDraft.targetId) this.fillDraft.targetId = Number(this.fillTargetOptions[0]?.value ?? 0);
  }

  applyFillSourceDefaults(): void {
    const targetId = this.fillDraft.targetId;
    if (this.fillSourceType === "league") this.fillDraft = { timing: "start", action: "FillFromLeague", targetId, param1: this.leagueOptions[0]?.value ?? "", param2: "0", param3: "0" };
    if (this.fillSourceType === "leagueLimit") this.fillDraft = { timing: "start", action: "FillFromLeagueMaxFromCountry", targetId, param1: this.leagueOptions[0]?.value ?? "", param2: "1", param3: "4" };
    if (this.fillSourceType === "coefficient") this.fillDraft = { timing: "start", action: "FillFromTopCoefficientCountry", targetId, param1: "1", param2: "1", param3: "1" };
    if (this.fillSourceType === "specialNation") this.fillDraft = { timing: "start", action: "FillFromSpecialTeamsWithNation", targetId, param1: "1", param2: String(nations[0]?.id ?? 0), param3: "0" };
    if (this.fillSourceType === "competition") this.fillDraft = { timing: "start", action: "FillFromCompTable", targetId, param1: this.competitionOptions[0]?.value ?? "", param2: "1", param3: "0" };
    if (this.fillSourceType === "backupLeague") this.fillDraft = { timing: "start", action: "FillFromCompTableBackupLeague", targetId, param1: this.competitionOptions[0]?.value ?? "", param2: this.leagueOptions[0]?.value ?? "", param3: "1" };
    if (this.fillSourceType === "backupCompetition") this.fillDraft = { timing: "start", action: "FillFromCompTableBackup", targetId, param1: this.competitionOptions[0]?.value ?? "", param2: this.competitionOptions[1]?.value ?? this.competitionOptions[0]?.value ?? "", param3: "1" };
  }

  saveFillRule(): void {
    if (!this.canSaveFillRule) return;
    if (this.editingFillRule) this.tasks.updateTask(this.project, this.editingFillRule.globalIndex, this.fillCompetitionId, this.fillDraft);
    else this.tasks.addTask(this.project, this.fillCompetitionId, this.fillDraft);
    this.afterChange();
    this.closeDialog();
  }

  duplicateFillRule(row: TeamSourceTaskRow): void {
    this.tasks.duplicateTask(this.project, row);
    this.afterChange();
  }

  deleteFillRule(row: TeamSourceTaskRow): void {
    if (!confirm("Remove this continental fill rule?")) return;
    this.tasks.removeTask(this.project, row.globalIndex);
    this.afterChange();
  }

  moveFillRule(row: TeamSourceTaskRow, direction: -1 | 1): void {
    this.tasks.moveTask(this.project, row.globalIndex, direction);
    this.afterChange();
  }

  openValidation(): void { this.dialog = "validation"; }
  openPreview(): void { this.dialog = "preview"; }
  closeDialog(): void { this.dialog = undefined; this.editingFillRule = undefined; }

  stringValue(value: number): string { return value > 0 ? String(value) : ""; }
  numberValue(value: string): number { return Number(value) || 0; }

  private afterChange(): void {
    this.refresh();
    this.structureChanged.emit();
  }

  private parseList(value: string): string[] {
    return String(value).split(",").map((part) => part.trim()).filter(Boolean);
  }

  private positive(value: string | number): boolean {
    return /^\d+$/.test(String(value).trim()) && Number(value) > 0;
  }

  private sourceTypeFromAction(action: string): FillSourceType {
    if (action === "FillFromLeagueMaxFromCountry") return "leagueLimit";
    if (action === "FillFromTopCoefficientCountry") return "coefficient";
    if (action === "FillFromSpecialTeamsWithNation") return "specialNation";
    if (action === "FillFromCompTable") return "competition";
    if (action === "FillFromCompTableBackupLeague") return "backupLeague";
    if (action === "FillFromCompTableBackup") return "backupCompetition";
    return "league";
  }
}
