import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import { CompObjValidationService } from "../../services/compdata/compobj-validation.service";

@Component({
  selector: "app-tournament-overview",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tse-content" *ngIf="tournamentObject as tournament">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Tournaments</div>
          <h1>{{ display.objectName(tournament, reference, project) }}</h1>
          <p>Tournament in {{ display.parentName(tournament, project, reference) }}</p>
          <small class="tse-entity-note">This tournament structure comes from compobj.txt.</small>
        </div>
        <span class="tse-structure-badge">Structure only</span>
      </header>

      <div class="tse-summary-grid">
        <div><strong>{{ phases.length }}</strong><span>Phases</span></div>
        <div><strong>{{ competition.groups.length }}</strong><span>Groups / slots</span></div>
        <div><strong>{{ totalPositions }}</strong><span>Total clubs</span></div>
        <div [class.warn]="status !== 'OK'"><strong>{{ status }}</strong><span>Validation status</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="addPhase.emit()">+ Add phase</button>
        <button type="button" (click)="validate.emit()">Validate</button>
        <button type="button" (click)="preview.emit()">Preview compobj lines</button>
        <button type="button" (click)="edit.emit()">Edit tournament</button>
        <button type="button" class="tse-danger-link" (click)="deleteTournament.emit()">Delete tournament</button>
      </div>

      <section class="tse-section">
        <div class="tse-section-heading">
          <div><h2>Tournament phases</h2><p>Phases are the main steps of the tournament. Open a phase to manage its groups or match slots.</p></div>
        </div>
        <div class="tse-phase-list" *ngIf="phases.length; else emptyPhases">
          <article class="tse-phase-card" *ngFor="let phase of phases; let index = index">
            <span class="tse-phase-number">{{ index + 1 }}</span>
            <div class="tse-phase-copy">
              <strong>{{ display.phaseInfo(phase.description).label }}</strong>
              <span>{{ display.phaseInfo(phase.description).description }}</span>
            </div>
            <span class="tse-phase-total">{{ childCount(phase) }} {{ display.childNoun(phase, childCount(phase)) }}</span>
            <div class="tse-row-actions">
              <button type="button" class="tse-open" (click)="openPhase.emit(phase.id)">Open</button>
              <button type="button" (click)="editPhase.emit(phase.id)">Edit</button>
              <button type="button" class="tse-danger-link" (click)="deletePhase.emit(phase.id)">Delete</button>
            </div>
          </article>
        </div>
        <ng-template #emptyPhases><div class="tse-inline-empty"><strong>No phases yet</strong><span>Add the first phase to define this tournament structure.</span><button type="button" class="tse-primary" (click)="addPhase.emit()">Add phase</button></div></ng-template>
      </section>

      <details class="tse-technical">
        <summary>Show technical details</summary>
        <dl>
          <div><dt>Object ID</dt><dd>{{ tournament.id }}</dd></div>
          <div><dt>Type</dt><dd>{{ tournament.kind }}</dd></div>
          <div><dt>Internal code</dt><dd>{{ tournament.shortName }}</dd></div>
          <div><dt>Name key</dt><dd>{{ tournament.description }}</dd></div>
          <div><dt>Parent ID</dt><dd>{{ tournament.parentId }}</dd></div>
          <div class="wide"><dt>Raw line</dt><dd><code>{{ display.rawLine(tournament) }}</code></dd></div>
        </dl>
      </details>
    </div>
  `
})
export class TournamentOverviewComponent {
  @Input({ required: true }) project!: CompdataProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Input() reference?: DbProject;
  @Output() openPhase = new EventEmitter<number>();
  @Output() addPhase = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() editPhase = new EventEmitter<number>();
  @Output() deleteTournament = new EventEmitter<void>();
  @Output() deletePhase = new EventEmitter<number>();
  @Output() validate = new EventEmitter<void>();
  @Output() preview = new EventEmitter<void>();

  constructor(
    public readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly validationService: CompObjValidationService
  ) {}

  get tournamentObject(): CompdataObject | undefined { return this.display.object(this.project, this.competition.id); }
  get phases(): CompdataObject[] { return this.tree.phases(this.project, this.competition.id); }
  get status(): string { return this.validationService.status(this.project, this.competition, this.reference); }
  get totalPositions(): number { return this.tree.getTotalPositionsForTournament(this.project, this.competition.id); }
  childCount(phase: CompdataObject): number { return this.tree.groups(this.project, phase.id).length; }
}
