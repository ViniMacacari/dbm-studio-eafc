import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";

@Component({
  selector: "app-tournament-phase-details",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tse-content">
      <button type="button" class="tse-back-link" (click)="back.emit()">← Back to tournament</button>
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">{{ display.objectName(tournament, reference, project) }} / {{ info.label }}</div>
          <h1>{{ info.label }}</h1>
          <p>Phase inside {{ display.objectName(tournament, reference, project) }}</p>
        </div>
      </header>

      <div class="tse-summary-grid three">
        <div><strong>{{ groups.length }}</strong><span><span class="tse-capitalize">{{ display.childNoun(phase, groups.length) }}</span></span></div>
        <div><strong>{{ totalPositions }}</strong><span>Total clubs</span></div>
        <div [class.warn]="groups.length === 0"><strong>{{ groups.length ? 'OK' : 'Warning' }}</strong><span>Validation status</span></div>
      </div>
      <p class="tse-phase-description">{{ info.description }}</p>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="addChild.emit()">+ Add {{ display.childNoun(phase, 1) }}</button>
        <button type="button" (click)="editQuantities.emit()">Edit quantities</button>
        <button type="button" (click)="editPhase.emit()">Edit phase details</button>
        <button type="button" class="tse-danger-link" (click)="deletePhase.emit()">Delete phase</button>
      </div>

      <section class="tse-section">
        <div class="tse-section-heading"><div><h2 class="tse-capitalize">{{ display.childNoun(phase, 2) }}</h2><p>Only the items inside this phase are shown here.</p></div></div>
        <div class="tse-child-list" *ngIf="groups.length; else emptyChildren">
          <article *ngFor="let group of groups; let index = index">
            <span class="tse-child-icon">{{ index + 1 }}</span>
            <strong>{{ display.childLabel(group, project) }}</strong>
            <span>{{ group.shortName }} · {{ teamsCount(group.id) }} teams</span>
            <button type="button" (click)="editChild.emit(group.id)">Edit</button>
            <button type="button" class="tse-danger-link" (click)="deleteChild.emit(group.id)">Delete</button>
            <details class="tse-technical compact">
              <summary>Technical details</summary>
              <code>{{ display.rawLine(group) }}</code>
            </details>
          </article>
        </div>
        <ng-template #emptyChildren><div class="tse-inline-empty"><strong>No {{ display.childNoun(phase, 2) }} yet</strong><button type="button" class="tse-primary" (click)="addChild.emit()">Add {{ display.childNoun(phase, 1) }}</button></div></ng-template>
      </section>

      <details class="tse-technical">
        <summary>Show technical details</summary>
        <dl>
          <div><dt>Object ID</dt><dd>{{ phase.id }}</dd></div><div><dt>Type</dt><dd>{{ phase.kind }}</dd></div>
          <div><dt>Internal code</dt><dd>{{ phase.shortName }}</dd></div><div><dt>Name key</dt><dd>{{ phase.description }}</dd></div>
          <div><dt>Parent ID</dt><dd>{{ phase.parentId }}</dd></div><div class="wide"><dt>Raw line</dt><dd><code>{{ display.rawLine(phase) }}</code></dd></div>
        </dl>
      </details>
    </div>
  `
})
export class TournamentPhaseDetailsComponent {
  @Input({ required: true }) project!: CompdataProject;
  @Input({ required: true }) tournament!: CompdataObject;
  @Input({ required: true }) phase!: CompdataObject;
  @Input() reference?: DbProject;
  @Output() back = new EventEmitter<void>();
  @Output() addChild = new EventEmitter<void>();
  @Output() editPhase = new EventEmitter<void>();
  @Output() deletePhase = new EventEmitter<void>();
  @Output() editChild = new EventEmitter<number>();
  @Output() deleteChild = new EventEmitter<number>();

  @Output() editQuantities = new EventEmitter<void>();

  constructor(public readonly display: CompObjDisplayService, private readonly tree: CompObjTreeService) {}
  get info() { return this.display.phaseInfo(this.phase.description); }
  get groups(): CompdataObject[] { return this.tree.groups(this.project, this.phase.id); }

  get totalPositions(): number {
    return this.tree.getTotalPositionsForPhase(this.project, this.phase.id);
  }

  teamsCount(groupId: number): number {
    return this.tree.getPositionsCount(this.project, groupId);
  }
}
