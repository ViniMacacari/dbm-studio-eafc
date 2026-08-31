import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataProject, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjValidationService } from "../../services/compdata/compobj-validation.service";

type TournamentFilter = "all" | "countries" | "continental" | "world" | "warnings";

@Component({
  selector: "app-tournament-sidebar",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="tse-sidebar">
      <div class="tse-sidebar-tools">
        <button type="button" class="tse-primary tse-create" (click)="createTournament.emit()">+ Create Tournament</button>
        <input class="tse-search" [(ngModel)]="query" placeholder="Search tournaments..." aria-label="Search tournaments" />
        <div class="tse-filters" aria-label="Tournament filters">
          <button *ngFor="let option of filters" type="button" [class.active]="filter === option.value" (click)="filter = option.value">{{ option.label }}</button>
        </div>
      </div>

      <div class="tse-tournament-list" *ngIf="filteredTournaments.length; else empty">
        <button
          *ngFor="let competition of filteredTournaments"
          type="button"
          class="tse-tournament-card"
          [class.active]="competition.id === selectedId"
          (click)="selectTournament.emit(competition.id)"
        >
          <strong>{{ name(competition) }}</strong>
          <span>{{ location(competition) }} · {{ competition.stages.length }} {{ competition.stages.length === 1 ? 'phase' : 'phases' }} · {{ slotSummary(competition) }}</span>
          <small *ngIf="warningCount(competition) as warnings" class="tse-warning">⚠ {{ warnings }} {{ warnings === 1 ? 'warning' : 'warnings' }}</small>
        </button>
      </div>
      <ng-template #empty>
        <div class="tse-sidebar-empty">
          <strong>No tournaments found</strong>
          <span>Try another search or filter.</span>
        </div>
      </ng-template>
    </aside>
  `
})
export class TournamentSidebarComponent {
  @Input({ required: true }) project!: CompdataProject;
  @Input() reference?: DbProject;
  @Input() selectedId = 0;
  @Output() selectTournament = new EventEmitter<number>();
  @Output() createTournament = new EventEmitter<void>();

  query = "";
  filter: TournamentFilter = "all";
  readonly filters: Array<{ value: TournamentFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "countries", label: "Countries" },
    { value: "continental", label: "Continental" },
    { value: "world", label: "World/FIFA" },
    { value: "warnings", label: "With warnings" }
  ];

  constructor(
    public readonly display: CompObjDisplayService,
    private readonly validation: CompObjValidationService
  ) {}

  get filteredTournaments(): CompdataCompetitionSummary[] {
    const query = this.query.trim().toLowerCase();
    return this.project.competitions.filter((competition) => {
      if (this.filter === "warnings" && this.warningCount(competition) === 0) return false;
      if (this.filter !== "all" && this.filter !== "warnings" && this.display.locationCategory(competition, this.project) !== this.filter) return false;
      return !query || [this.name(competition), this.location(competition), competition.shortName, competition.description]
        .some((value) => value.toLowerCase().includes(query));
    });
  }

  name(competition: CompdataCompetitionSummary): string {
    return this.display.objectName(this.display.object(this.project, competition.id), this.reference, this.project);
  }

  location(competition: CompdataCompetitionSummary): string {
    return this.display.locationName(competition, this.project, this.reference);
  }

  slotSummary(competition: CompdataCompetitionSummary): string {
    const count = competition.groups.length;
    const phases = competition.stages;
    const onlyGroups = phases.length > 0 && phases.every((phase) => this.display.isGroupPhase(phase));
    const onlySlots = phases.length > 0 && phases.every((phase) => !this.display.isGroupPhase(phase));
    if (onlyGroups) return `${count} ${count === 1 ? "group" : "groups"}`;
    if (onlySlots) return `${count} ${count === 1 ? "slot" : "slots"}`;
    return `${count} groups / slots`;
  }

  warningCount(competition: CompdataCompetitionSummary): number {
    return this.validation.warningCount(this.project, competition, this.reference);
  }
}
