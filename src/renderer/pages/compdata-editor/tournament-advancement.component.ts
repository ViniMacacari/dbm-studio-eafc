import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataAdvancement, CompdataObject, CompdataProject, DbProject, CompdataCompetitionSummary } from "../../../shared/types";
import { AdvancementDisplayService } from "../../services/compdata/advancement-display.service";
import { AdvancementService, AdvancementValidationResult } from "../../services/compdata/advancement.service";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { InputListComponent, InputListOption } from "../../components/input-list/input-list.component";
import { DecisionModalComponent, DecisionOption } from "../../components/decision-modal/decision-modal.component";

@Component({
  selector: "app-tournament-advancement",
  standalone: true,
  imports: [CommonModule, FormsModule, InputListComponent, DecisionModalComponent],
  template: `
    <div class="tse-panel" style="padding: 24px;">
      <header style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h2 style="margin: 0 0 8px 0; font-size: 20px;">Advancement</h2>
          <p style="margin: 0; color: var(--tse-text-muted);">Use this to decide where winners, runners-up or group positions go next.</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" (click)="autoGenerate()">Auto-generate</button>
          <button type="button" class="tse-primary" (click)="openAddModal()">Add rule</button>
          <button type="button" class="tse-danger-link" *ngIf="rules.length > 0" (click)="clearRules()">Clear rules</button>
        </div>
      </header>

      <div class="tse-stats-row" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
        <div class="tse-stat-card" style="padding: 16px; border: 1px solid var(--tse-border); border-radius: 6px;">
          <div style="font-size: 13px; color: var(--tse-text-muted); margin-bottom: 4px;">Rules</div>
          <div style="font-size: 24px; font-weight: 600;">{{ rules.length }}</div>
        </div>
      </div>

      <div *ngIf="rules.length === 0" class="tse-main-empty">
        <strong>No advancement rules configured yet</strong>
        <span>Add rules to define how teams move between phases.</span>
        <div>
          <button type="button" class="tse-primary" (click)="openAddModal()">Add rule manually</button>
          <button type="button" (click)="autoGenerate()">Auto-generate from structure</button>
        </div>
      </div>

      <div *ngIf="rules.length > 0" style="display: flex; flex-direction: column; gap: 12px;">
        <article *ngFor="let rule of rules; let i = index" style="padding: 16px; border: 1px solid var(--tse-border); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; background: var(--tse-bg-subtle);">
          <div>
            <div style="font-size: 15px; font-weight: 500; margin-bottom: 4px;">{{ describeRule(rule) }}</div>
            <div style="font-size: 12px; color: var(--tse-text-muted); font-family: monospace;">Raw line: {{ rule.fromGroupId }},{{ rule.fromPosition }},{{ rule.toGroupId }},{{ rule.toPosition }}</div>
            
            <div *ngIf="validations[i]?.errors?.length" style="color: var(--tse-danger); font-size: 12px; margin-top: 4px;">
              <div *ngFor="let err of validations[i].errors">⚠ {{ err }}</div>
            </div>
            <div *ngIf="validations[i]?.warnings?.length" style="color: var(--tse-warning); font-size: 12px; margin-top: 4px;">
              <div *ngFor="let warn of validations[i].warnings">⚠ {{ warn }}</div>
            </div>
          </div>
          <button type="button" class="tse-danger-link" (click)="deleteRule(i)" title="Delete rule">×</button>
        </article>
      </div>
    </div>

    <!-- Add Rule Modal -->
    <div class="tse-modal-backdrop" *ngIf="showAddModal">
      <section class="tse-modal tse-wizard" style="width: 800px; max-width: 90vw;">
        <header class="tse-modal-header">
          <div><h2 style="margin: 0; font-size: 18px;">Add advancement rule</h2></div>
          <button type="button" aria-label="Close" (click)="closeAddModal()">×</button>
        </header>
        <div class="tse-modal-body" style="display: flex; flex-direction: column; gap: 24px; min-height: 350px; overflow: visible;">
          <div>
            <strong style="display: block; margin-bottom: 12px;">Step 1: Who moves?</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
              <label class="tse-field">
                <span>From phase</span>
                <app-input-list 
                  [value]="fromPhaseId === -1 ? '' : fromPhaseId.toString()" 
                  [options]="phaseOptions" 
                  placeholder="Select a phase..." 
                  (valueChange)="setFromPhase($event)"></app-input-list>
              </label>
              <label class="tse-field">
                <span>From slot</span>
                <app-input-list 
                  [disabled]="fromPhaseId === -1"
                  [value]="fromSlotId === -1 ? '' : fromSlotId.toString()" 
                  [options]="fromSlotOptions" 
                  placeholder="Select a slot..." 
                  (valueChange)="setFromSlot($event)"></app-input-list>
              </label>
              <label class="tse-field">
                <span>Position</span>
                <app-input-list 
                  [value]="fromPosition.toString()" 
                  [options]="fromPositionOptions" 
                  placeholder="Select position" 
                  (valueChange)="setFromPosition($event)"></app-input-list>
              </label>
            </div>
          </div>

          <div style="border-top: 1px solid var(--tse-border); margin: 0 -24px;"></div>

          <div>
            <strong style="display: block; margin-bottom: 12px;">Step 2: Where does it go?</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
              <label class="tse-field">
                <span>To phase</span>
                <app-input-list 
                  [value]="toPhaseId === -1 ? '' : toPhaseId.toString()" 
                  [options]="phaseOptions" 
                  placeholder="Select a phase..." 
                  (valueChange)="setToPhase($event)"></app-input-list>
              </label>
              <label class="tse-field">
                <span>To slot</span>
                <app-input-list 
                  [disabled]="toPhaseId === -1"
                  [value]="toSlotId === -1 ? '' : toSlotId.toString()" 
                  [options]="toSlotOptions" 
                  placeholder="Select a slot..." 
                  (valueChange)="setToSlot($event)"></app-input-list>
              </label>
              <label class="tse-field">
                <span>Target position</span>
                <app-input-list 
                  [value]="toPosition.toString()" 
                  [options]="toPositionOptions" 
                  placeholder="Select position" 
                  (valueChange)="setToPosition($event)"></app-input-list>
              </label>
            </div>
          </div>
          
          <div *ngIf="fromSlotId !== -1 && toSlotId !== -1" style="padding: 16px; background: var(--tse-bg-subtle); border-radius: 6px;">
            <strong style="font-size: 13px; color: var(--tse-text-muted); display: block; margin-bottom: 4px;">Preview</strong>
            <div>{{ previewRule() }}</div>
          </div>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeAddModal()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!canAddRule" (click)="addRule()">Create rule</button>
        </footer>
      </section>
    </div>

    <!-- Decision Modal -->
    <app-decision-modal
      *ngIf="decisionType"
      [title]="decisionTitle"
      [text]="decisionText"
      [options]="decisionOptions"
      (action)="onDecisionAction($event)"
    ></app-decision-modal>
  `
})
export class TournamentAdvancementComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() referenceProject?: DbProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<void>();

  rules: CompdataAdvancement[] = [];
  validations: AdvancementValidationResult[] = [];
  
  phases: CompdataObject[] = [];
  
  showAddModal = false;
  fromPhaseId = -1;
  fromSlotId = -1;
  fromPosition = 1;
  fromSlots: CompdataObject[] = [];
  
  toPhaseId = -1;
  toSlotId = -1;
  toPosition = 1;
  toSlots: CompdataObject[] = [];

  phaseOptions: InputListOption[] = [];
  fromSlotOptions: InputListOption[] = [];
  toSlotOptions: InputListOption[] = [];

  fromPositionOptions: InputListOption[] = [
    { value: "1", label: "Winner / 1st place" },
    { value: "2", label: "Runner-up / 2nd place" },
    { value: "3", label: "3rd place" },
    { value: "4", label: "4th place" },
    { value: "5", label: "5th place" },
    { value: "6", label: "6th place" },
    { value: "7", label: "7th place" },
    { value: "8", label: "8th place" }
  ];

  toPositionOptions: InputListOption[] = [
    { value: "1", label: "Position 1" },
    { value: "2", label: "Position 2" },
    { value: "3", label: "Position 3" },
    { value: "4", label: "Position 4" },
    { value: "5", label: "Position 5" },
    { value: "6", label: "Position 6" },
    { value: "7", label: "Position 7" },
    { value: "8", label: "Position 8" }
  ];

  decisionType: "clear" | "autoGenerate" | "alert" | null = null;
  decisionTitle = "";
  decisionText = "";
  decisionOptions: DecisionOption[] = [];

  constructor(
    public readonly display: CompObjDisplayService,
    private advDisplay: AdvancementDisplayService,
    private advService: AdvancementService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['competition'] || changes['project']) {
      this.loadData();
    }
  }

  loadData() {
    this.rules = this.advService.getRulesForCompetition(this.competition.id, this.project);
    this.validations = this.rules.map(r => this.advService.validateRule(r, this.project));
    
    // Load phases
    this.phases = this.project.objects.filter(o => o.parentId === this.competition.id && o.kind === 4).sort((a, b) => a.id - b.id);
    this.phaseOptions = this.phases.map(p => ({
      value: p.id.toString(),
      label: this.display.objectName(p, this.referenceProject, this.project),
      detail: `ID: ${p.id} (${p.shortName})`
    }));
  }

  describeRule(rule: CompdataAdvancement): string {
    return this.advDisplay.describeRule(rule, this.project, this.referenceProject);
  }

  deleteRule(index: number) {
    const ruleToRemove = this.rules[index];
    // Remove from the main project array
    const globalIndex = this.project.advancements.findIndex(r => 
      r.fromGroupId === ruleToRemove.fromGroupId &&
      r.fromPosition === ruleToRemove.fromPosition &&
      r.toGroupId === ruleToRemove.toGroupId &&
      r.toPosition === ruleToRemove.toPosition
    );
    if (globalIndex !== -1) {
      this.project.advancements.splice(globalIndex, 1);
    }
    
    this.loadData();
    this.structureChanged.emit();
  }

  clearRules() {
    this.decisionType = "clear";
    this.decisionTitle = "Clear advancement rules";
    this.decisionText = "Are you sure you want to delete all advancement rules for this tournament?";
    this.decisionOptions = [
      { value: "cancel", label: "Cancel" },
      { value: "confirm", label: "Clear rules", danger: true }
    ];
  }

  executeClearRules() {
    // Find rules belonging to this competition and remove them
    for (const rule of this.rules) {
      const globalIndex = this.project.advancements.findIndex(r => 
        r.fromGroupId === rule.fromGroupId &&
        r.fromPosition === rule.fromPosition &&
        r.toGroupId === rule.toGroupId &&
        r.toPosition === rule.toPosition
      );
      if (globalIndex !== -1) {
        this.project.advancements.splice(globalIndex, 1);
      }
    }
    
    this.loadData();
    this.structureChanged.emit();
  }

  autoGenerate() {
    if (this.rules.length > 0) {
      this.decisionType = "autoGenerate";
      this.decisionTitle = "Auto-generate rules";
      this.decisionText = "This will add new generated rules to your existing ones. Continue?";
      this.decisionOptions = [
        { value: "cancel", label: "Cancel" },
        { value: "confirm", label: "Continue", primary: true }
      ];
      return;
    }
    this.executeAutoGenerate();
  }

  executeAutoGenerate() {
    const newRules = this.advService.autoGenerateKnockoutRules(this.phases, this.project);
    if (newRules.length === 0) {
      this.decisionType = "alert";
      this.decisionTitle = "Cannot auto-generate";
      this.decisionText = "No obvious knockout phase connections could be detected.";
      this.decisionOptions = [{ value: "cancel", label: "OK", primary: true }];
      return;
    }
    
    this.project.advancements.push(...newRules);
    this.loadData();
    this.structureChanged.emit();
  }

  onDecisionAction(action: string) {
    const type = this.decisionType;
    this.decisionType = null;
    
    if (action === "confirm") {
      if (type === "clear") this.executeClearRules();
      else if (type === "autoGenerate") this.executeAutoGenerate();
    }
  }

  openAddModal() {
    this.fromPhaseId = -1;
    this.fromSlotId = -1;
    this.fromPosition = 1;
    this.fromSlots = [];
    
    this.toPhaseId = -1;
    this.toSlotId = -1;
    this.toPosition = 1;
    this.toSlots = [];
    
    this.showAddModal = true;
  }

  closeAddModal() {
    this.showAddModal = false;
  }

  setFromPhase(val: string) {
    this.fromPhaseId = parseInt(val, 10) || -1;
    this.onFromPhaseChange();
  }

  onFromPhaseChange() {
    this.fromSlotId = -1;
    this.fromSlots = this.project.objects.filter(o => o.parentId === this.fromPhaseId && o.kind === 5).sort((a, b) => a.id - b.id);
    this.fromSlotOptions = this.fromSlots.map(s => ({
      value: s.id.toString(),
      label: this.display.objectName(s, this.referenceProject, this.project),
      detail: `ID: ${s.id} (${s.shortName})`
    }));
  }

  setFromSlot(val: string) { this.fromSlotId = parseInt(val, 10) || -1; }
  setFromPosition(val: string) { this.fromPosition = parseInt(val, 10) || 1; }

  setToPhase(val: string) {
    this.toPhaseId = parseInt(val, 10) || -1;
    this.onToPhaseChange();
  }

  onToPhaseChange() {
    this.toSlotId = -1;
    this.toSlots = this.project.objects.filter(o => o.parentId === this.toPhaseId && o.kind === 5).sort((a, b) => a.id - b.id);
    this.toSlotOptions = this.toSlots.map(s => ({
      value: s.id.toString(),
      label: this.display.objectName(s, this.referenceProject, this.project),
      detail: `ID: ${s.id} (${s.shortName})`
    }));
  }

  setToSlot(val: string) { this.toSlotId = parseInt(val, 10) || -1; }
  setToPosition(val: string) { this.toPosition = parseInt(val, 10) || 1; }

  get canAddRule(): boolean {
    return this.fromSlotId !== -1 && this.toSlotId !== -1;
  }

  previewRule(): string {
    if (!this.canAddRule) return "";
    const mockRule: CompdataAdvancement = {
      fromGroupId: this.fromSlotId,
      fromPosition: this.fromPosition,
      toGroupId: this.toSlotId,
      toPosition: this.toPosition
    };
    return this.advDisplay.describeRule(mockRule, this.project, this.referenceProject);
  }

  addRule() {
    if (!this.canAddRule) return;
    
    const rule: CompdataAdvancement = {
      fromGroupId: this.fromSlotId,
      fromPosition: this.fromPosition,
      toGroupId: this.toSlotId,
      toPosition: this.toPosition
    };
    
    this.project.advancements.push(rule);
    this.loadData();
    this.structureChanged.emit();
    this.closeAddModal();
  }
}
