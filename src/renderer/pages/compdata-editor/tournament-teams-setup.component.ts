import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataProject, CompdataInitTeam, DbProject } from "../../../shared/types";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { TeamEditorService } from "../../services/team-editor.service";

@Component({
  selector: "app-tournament-teams-setup",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tse-content">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Teams / Seeding</div>
          <h1>Initial Teams Setup</h1>
          <p>Set the teams connected to this tournament and their previous-season order.</p>
          <small class="tse-entity-note">These entries are saved in initteams.txt. DBM Studio uses them to tell the game which teams are linked to this competition and in which order.</small>
        </div>
      </header>

      <div class="tse-summary-grid three">
        <div><strong>{{ sortedTeams.length }}</strong><span>Teams configured</span></div>
        <div><strong class="tse-truncate" [title]="firstTeamName">{{ firstTeamName || 'None' }}</strong><span>First position</span></div>
        <div><strong>initteams.txt</strong><span>Source</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="openAddTeam()">+ Add team</button>
        <button type="button" (click)="openBulkAdd()">Bulk add</button>
        <button type="button" (click)="normalizeOrder()" [disabled]="!sortedTeams.length">Normalize order</button>
        <button type="button" class="tse-danger-link" (click)="clearTeams()" [disabled]="!sortedTeams.length">Clear teams</button>
      </div>

      <section class="tse-section">
        <div class="tse-section-heading">
          <h3>Teams List</h3>
        </div>
        
        <div class="tse-empty-state" *ngIf="sortedTeams.length === 0">
          <div class="icon">👥</div>
          <h3>No teams configured yet</h3>
          <p>This tournament has no teams in initteams.txt. You can add teams now or leave it empty if this competition does not need previous-season teams.</p>
          <div class="actions">
            <button type="button" class="tse-primary" (click)="openAddTeam()">Add team</button>
            <button type="button" (click)="openBulkAdd()">Paste team IDs</button>
          </div>
        </div>

        <div class="tse-child-list" *ngIf="sortedTeams.length > 0">
          <article *ngFor="let team of sortedTeams">
            <span class="tse-child-icon">{{ team.position + 1 }}</span>
            <strong>{{ resolveTeamName(team.teamId) }}</strong>
            <span>Team ID: {{ team.teamId }}</span>
            <button type="button" (click)="openEditTeam(team)">Edit</button>
            <button type="button" class="tse-danger-link" (click)="removeTeam(team)">Remove</button>
          </article>
        </div>
      </section>

      <!-- Add/Edit Team Modal -->
      <div class="tse-modal-backdrop" *ngIf="dialog === 'team'">
        <section class="tse-modal" role="dialog" aria-modal="true">
          <header class="tse-modal-header">
            <div><span>Teams / Seeding</span>
              <h2>{{ isEditing ? 'Edit team' : 'Add team to tournament' }}</h2>
            </div><button type="button" (click)="closeDialog()">×</button>
          </header>
          <div class="tse-modal-body">
            <label class="tse-field"><span>Position (starts at 1)</span><input type="number" min="1" [(ngModel)]="teamDraft.displayPosition" /></label>
            <label class="tse-field">
              <span>Team ID or Search</span>
              <div style="display: flex; gap: 8px;">
                <input type="text" [(ngModel)]="teamDraft.teamId" placeholder="e.g. 191" (ngModelChange)="onTeamDraftIdChange()" style="flex: 1;" />
              </div>
            </label>
            <div class="tse-field-help" style="margin-top: 4px;" *ngIf="teamDraftResolvedName">
              Resolved: <strong>{{ teamDraftResolvedName }}</strong>
            </div>
            
            <ng-container *ngIf="referenceProject">
            </ng-container>
            
          </div>
          <footer class="tse-modal-actions">
            <button type="button" (click)="closeDialog()">Cancel</button>
            <button type="button" class="tse-primary" [disabled]="!teamDraft.teamId || teamDraft.displayPosition < 1" (click)="saveTeam()">{{ isEditing ? 'Save changes' : 'Add team' }}</button>
          </footer>
        </section>
      </div>

      <!-- Bulk Add Modal -->
      <div class="tse-modal-backdrop" *ngIf="dialog === 'bulk'">
        <section class="tse-modal" role="dialog" aria-modal="true">
          <header class="tse-modal-header">
            <div><span>Teams / Seeding</span>
              <h2>Bulk add teams</h2>
            </div><button type="button" (click)="closeDialog()">×</button>
          </header>
          <div class="tse-modal-body">
            <p style="margin-bottom: 12px;">Paste a list of Team IDs (one per line, or comma-separated). They will be added sequentially.</p>
            <label class="tse-field">
              <textarea [(ngModel)]="bulkDraft" rows="8" placeholder="191&#10;254&#10;111821" style="width: 100%; resize: vertical; font-family: monospace;"></textarea>
            </label>
          </div>
          <footer class="tse-modal-actions">
            <button type="button" (click)="closeDialog()">Cancel</button>
            <button type="button" class="tse-primary" [disabled]="!bulkDraft.trim()" (click)="saveBulk()">Add teams</button>
          </footer>
        </section>
      </div>

    </div>
  `,
  styles: [`
    .tse-search-result-item:hover { background-color: rgba(0,0,0,0.05); }
    :host-context([data-theme='dark']) .tse-search-result-item:hover { background-color: rgba(255,255,255,0.05); }
  `]
})
export class TournamentTeamsSetupComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() referenceProject?: DbProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<void>();

  sortedTeams: CompdataInitTeam[] = [];
  teamNamesCache = new Map<string, string>();
  
  dialog?: "team" | "bulk" | "clear";
  isEditing = false;
  editingOriginalPosition = -1;
  teamDraft = { displayPosition: 1, teamId: "" };
  bulkDraft = "";

  teamSearchQuery = "";
  teamSearchResults: any[] = [];

  constructor(
    private readonly tree: CompObjTreeService,
    public readonly display: CompObjDisplayService,
    private readonly teamEditor: TeamEditorService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['competition'] || changes['project']) {
      this.refreshTeams();
    }
  }

  refreshTeams(): void {
    if (!this.project || !this.competition) return;
    this.sortedTeams = this.tree.getInitTeams(this.project, this.competition.id);
  }

  get firstTeamName(): string {
    if (this.sortedTeams.length === 0) return "";
    return this.resolveTeamName(this.sortedTeams[0].teamId);
  }

  resolveTeamName(teamId: string): string {
    if (!this.referenceProject || !teamId) return "Unknown team";
    if (this.teamNamesCache.has(teamId)) return this.teamNamesCache.get(teamId)!;
    
    // Quick search
    const results = this.teamEditor.findTeams(this.referenceProject, teamId, 5);
    const exact = results.find(r => r.teamId === teamId);
    const name = exact ? exact.displayName : "Unknown team";
    this.teamNamesCache.set(teamId, name);
    return name;
  }

  openAddTeam(): void {
    const nextPos = this.sortedTeams.length > 0 ? Math.max(...this.sortedTeams.map(t => t.position)) + 2 : 1;
    this.teamDraft = { displayPosition: nextPos, teamId: "" };
    this.teamSearchQuery = "";
    this.teamSearchResults = [];
    this.isEditing = false;
    this.dialog = "team";
  }

  openEditTeam(team: CompdataInitTeam): void {
    this.teamDraft = { displayPosition: team.position + 1, teamId: team.teamId };
    this.editingOriginalPosition = team.position;
    this.isEditing = true;
    this.dialog = "team";
  }

  openBulkAdd(): void {
    this.bulkDraft = "";
    this.dialog = "bulk";
  }

  closeDialog(): void {
    this.dialog = undefined;
  }

  searchTeams(): void {
    if (!this.referenceProject || !this.teamSearchQuery.trim()) {
      this.teamSearchResults = [];
      return;
    }
    this.teamSearchResults = this.teamEditor.findTeams(this.referenceProject, this.teamSearchQuery.trim(), 20);
  }

  selectTeamResult(result: any): void {
    this.teamDraft.teamId = result.teamId;
    this.teamSearchResults = [];
    this.teamSearchQuery = "";
  }

  get teamDraftResolvedName(): string {
    if (!this.teamDraft.teamId) return "";
    const name = this.resolveTeamName(this.teamDraft.teamId);
    return name === "Unknown team" ? "" : name;
  }

  onTeamDraftIdChange(): void {
    // just triggers resolution via getter
  }

  saveTeam(): void {
    const pos = Math.max(0, this.teamDraft.displayPosition - 1);
    
    if (this.isEditing) {
      // Check if trying to move to a position already occupied by ANOTHER team
      if (this.editingOriginalPosition !== pos) {
        const existingTarget = this.sortedTeams.find(t => t.position === pos);
        if (existingTarget) {
          alert("Warning: This position is already used by another team.");
          return;
        }
      }
      // Always remove the old and add the new so both teamId and pos get updated
      this.tree.removeInitTeam(this.project, this.competition.id, this.editingOriginalPosition);
      this.tree.addInitTeam(this.project, this.competition.id, pos, this.teamDraft.teamId);
    } else {
      const existingTarget = this.sortedTeams.find(t => t.position === pos);
      if (existingTarget) {
        alert("Warning: This position is already used by another team.");
        return;
      }
      this.tree.addInitTeam(this.project, this.competition.id, pos, this.teamDraft.teamId);
    }
    
    this.closeDialog();
    this.refreshTeams();
    this.structureChanged.emit();
  }

  removeTeam(team: CompdataInitTeam): void {
    if (confirm("Remove this team from the tournament setup?")) {
      this.tree.removeInitTeam(this.project, this.competition.id, team.position);
      this.refreshTeams();
      this.structureChanged.emit();
    }
  }

  clearTeams(): void {
    if (confirm("Remove all teams from this tournament setup?")) {
      this.tree.clearInitTeams(this.project, this.competition.id);
      this.refreshTeams();
      this.structureChanged.emit();
    }
  }

  normalizeOrder(): void {
    this.tree.normalizeInitTeamsOrder(this.project, this.competition.id);
    this.refreshTeams();
    this.structureChanged.emit();
  }

  saveBulk(): void {
    const rawIds = this.bulkDraft.split(/[\n,]/).map(s => s.trim()).filter(s => s);
    if (!rawIds.length) return;
    
    let nextPos = this.sortedTeams.length > 0 ? Math.max(...this.sortedTeams.map(t => t.position)) + 1 : 0;
    
    for (const tid of rawIds) {
      this.tree.addInitTeam(this.project, this.competition.id, nextPos, tid);
      nextPos++;
    }
    
    this.closeDialog();
    this.refreshTeams();
    this.structureChanged.emit();
  }
}
