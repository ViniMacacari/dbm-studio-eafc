import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "../../services/compdata/compobj-display.service";
import { CompObjTreeService } from "../../services/compdata/compobj-tree.service";
import { EffectiveSetting, SettingsInheritanceService } from "../../services/compdata/settings-inheritance.service";
import { SETTINGS_SECTIONS, SettingsService } from "../../services/compdata/settings.service";
import { SettingsDisplayService } from "../../services/compdata/settings-display.service";
import { SettingsValidationIssue, SettingsValidationService } from "../../services/compdata/settings-validation.service";

type RulesScope = "tournament" | "phases" | "groups" | "inherited" | "global";
type CopySectionKey = "profile" | "points" | "match" | "ending" | "season" | "promotion" | "stage" | "group";
type RulesSelection = {
  selectedObject?: CompdataObject;
  chain: CompdataObject[];
  validationIssues: SettingsValidationIssue[];
  settingsEntries: ReturnType<SettingsService["objectEntries"]>;
  previewLines: string[];
};

@Component({
  selector: "app-tournament-rules-settings",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="tse-content tse-rules-content">
      <div class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Tournament Editor / Rules & Settings</div>
          <h1>Rules & Settings</h1>
          <p>Edit how this tournament behaves in-game.</p>
        </div>
        <span class="tse-structure-badge">{{ validationStatus }}</span>
      </div>

      <div class="tse-summary-grid">
        <div><strong>{{ competitionTypeSummary }}</strong><span>Competition type</span></div>
        <div><strong>{{ pointsSummary }}</strong><span>Points</span></div>
        <div><strong>{{ substitutionsSummary }}</strong><span>Substitutions</span></div>
        <div [class.warn]="objectValidationIssues.length"><strong>{{ validationStatus }}</strong><span>Status</span></div>
      </div>

      <div class="tse-actions">
        <button type="button" class="tse-primary" (click)="setScope('tournament')">Edit tournament rules</button>
        <button type="button" (click)="setScope('phases')">Edit phase rules</button>
        <button type="button" (click)="setScope('groups')">Edit group rules</button>
        <button type="button" (click)="setScope('global')">Global Settings</button>
        <button type="button" (click)="showCopy = !showCopy">Copy rules from another tournament</button>
        <button type="button" (click)="resetCurrentObject()" [disabled]="!selectedObjectSettings.length">Reset to inherited values</button>
        <button type="button" (click)="showValidation = !showValidation">Validate settings</button>
        <button type="button" (click)="showPreview = !showPreview">Preview settings.txt lines</button>
      </div>

      <section class="tse-section tse-rules-panel" *ngIf="showCopy">
        <div class="tse-section-heading"><div><h2>Copy rules</h2><p>Preview the copied settings before applying them.</p></div></div>
        <div class="tse-form-grid two">
          <label class="tse-field"><span>Source tournament</span><select [(ngModel)]="copySourceId">
            <option [ngValue]="0">Choose tournament...</option>
            <option *ngFor="let option of tournamentOptions" [ngValue]="option.id">{{ option.label }}</option>
          </select></label>
          <div class="tse-rules-checks">
            <label><input type="checkbox" [(ngModel)]="copySections.profile" /> Competition profile</label>
            <label><input type="checkbox" [(ngModel)]="copySections.points" /> Points and table rules</label>
            <label><input type="checkbox" [(ngModel)]="copySections.match" /> Match rules</label>
            <label><input type="checkbox" [(ngModel)]="copySections.ending" /> Extra time and penalties</label>
            <label><input type="checkbox" [(ngModel)]="copySections.season" /> Season rules</label>
            <label><input type="checkbox" [(ngModel)]="copySections.promotion" /> Promotion/relegation</label>
            <label><input type="checkbox" [(ngModel)]="copySections.stage" /> Phase rules</label>
            <label><input type="checkbox" [(ngModel)]="copySections.group" /> Group rules</label>
          </div>
        </div>
        <details class="tse-technical" open>
          <summary>Preview copied settings.txt lines</summary>
          <code *ngFor="let line of copyPreviewLines">{{ line }}</code>
          <p *ngIf="!copyPreviewLines.length">Choose a source tournament and at least one section.</p>
        </details>
        <div class="tse-actions"><button type="button" class="tse-primary" [disabled]="!copyPreviewLines.length" (click)="applyCopy()">Apply copied rules</button></div>
      </section>

      <div class="tse-tab-bar compact">
        <button type="button" class="tse-tab" [class.active]="scope === 'tournament'" (click)="setScope('tournament')">Tournament</button>
        <button type="button" class="tse-tab" [class.active]="scope === 'phases'" (click)="setScope('phases')">Phases</button>
        <button type="button" class="tse-tab" [class.active]="scope === 'groups'" (click)="setScope('groups')">Groups</button>
        <button type="button" class="tse-tab" [class.active]="scope === 'inherited'" (click)="setScope('inherited')">Inherited settings</button>
        <button type="button" class="tse-tab" [class.active]="scope === 'global'" (click)="setScope('global')">Global Settings</button>
      </div>

      <div class="tse-rules-target">
        <label class="tse-field" *ngIf="scope === 'phases'"><span>Editing phase rules</span><select [(ngModel)]="selectedPhaseId" (ngModelChange)="refreshSelectionCache()">
          <option *ngFor="let phase of phases" [ngValue]="phase.id">{{ display.objectName(phase, reference, project) }}</option>
        </select></label>
        <label class="tse-field" *ngIf="scope === 'groups'"><span>Editing group/slot rules</span><select [(ngModel)]="selectedGroupId" (ngModelChange)="refreshSelectionCache()">
          <option *ngFor="let group of groups" [ngValue]="group.id">{{ groupPathLabel(group) }}</option>
        </select></label>
        <label class="tse-field" *ngIf="scope === 'global'"><span>Editing global rules</span><select [(ngModel)]="selectedGlobalId" (ngModelChange)="refreshSelectionCache()">
          <option *ngFor="let object of globalObjects" [ngValue]="object.id">{{ display.objectName(object, reference, project) }} · {{ display.typeLabel(object.kind) }}</option>
        </select></label>
        <div class="tse-resolved">
          <small>Editing</small>
          <strong>{{ selectedObjectLabel }}</strong>
          <small *ngIf="inheritancePath">Inherited from: {{ inheritancePath }}</small>
        </div>
      </div>

      <ng-container *ngIf="scope === 'inherited'; else editableRules">
        <section class="tse-section tse-rules-panel">
          <div class="tse-section-heading"><div><h2>Inherited settings</h2><p>Effective rules for this tournament, resolved from the nearest custom level.</p></div></div>
          <div class="tse-inheritance-chain">
            <article *ngFor="let object of inheritanceChain; let first = first" [class.active]="first">
              <strong>{{ display.objectName(object, reference, project) }}</strong>
              <span>{{ display.typeLabel(object.kind) }}</span>
            </article>
          </div>
          <div class="tse-data-table settings-advanced">
            <div class="head"><span>Rule</span><span>Value</span><span>Source</span><span>Status</span></div>
            <div class="row" *ngFor="let row of inheritedRows">
              <span>{{ rulesDisplay.attributeLabel(row.attribute) }}</span>
              <span>{{ row.value || 'Not configured' }}</span>
              <span>{{ row.sourceObject ? display.objectName(row.sourceObject, reference, project) : 'None' }}</span>
              <span>{{ row.isCustom ? 'Custom' : row.isInherited ? 'Inherited' : 'Not configured' }}</span>
            </div>
          </div>
        </section>
      </ng-container>

      <ng-template #editableRules>
        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Competition profile</h2><p>League or cup identity used by the game.</p></div><button type="button" (click)="resetSection('profile')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Competition type <em>{{ badge('comp_type') }}</em></span><select [ngModel]="single('comp_type', defaultCompetitionType)" (ngModelChange)="setSingle('comp_type', $event)">
              <option *ngFor="let option of rulesDisplay.compTypeOptions" [value]="option.value">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Competition asset / Game asset <em>{{ badge('asset_id') }}</em></span><input type="number" min="0" [ngModel]="single('asset_id', '')" (ngModelChange)="setSingle('asset_id', $event)" /></label>
            <label class="tse-field"><span>Match importance <em>{{ badge('match_matchimportance') }}</em></span><input type="number" min="0" max="100" [ngModel]="single('match_matchimportance', '')" (ngModelChange)="setSingle('match_matchimportance', $event)" /></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Points and table rules</h2><p>Points system and tie-breakers.</p></div><button type="button" (click)="resetSection('points')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Win <em>{{ badge('standings_pointswin') }}</em></span><input type="number" [ngModel]="single('standings_pointswin', '3')" (ngModelChange)="setSingle('standings_pointswin', $event)" /></label>
            <label class="tse-field"><span>Draw <em>{{ badge('standings_pointsdraw') }}</em></span><input type="number" [ngModel]="single('standings_pointsdraw', '1')" (ngModelChange)="setSingle('standings_pointsdraw', $event)" /></label>
            <label class="tse-field"><span>Loss <em>{{ badge('standings_pointsloss') }}</em></span><input type="number" [ngModel]="single('standings_pointsloss', '0')" (ngModelChange)="setSingle('standings_pointsloss', $event)" /></label>
          </div>
          <div class="tse-rules-list">
            <div class="tse-rules-list-head"><strong>Tie-breakers</strong><span>{{ badge('standings_sort', true) }}</span></div>
            <article *ngFor="let value of tieBreakers; let index = index">
              <span>{{ index + 1 }}</span>
              <strong>{{ rulesDisplay.tieBreakerLabel(value) }}</strong>
              <button type="button" (click)="moveTieBreaker(index, -1)" [disabled]="index === 0">Up</button>
              <button type="button" (click)="moveTieBreaker(index, 1)" [disabled]="index === tieBreakers.length - 1">Down</button>
              <button type="button" class="tse-danger-link" (click)="removeTieBreaker(index)">Remove</button>
            </article>
            <label class="tse-field"><span>Add tie-breaker</span><select [ngModel]="tieBreakerToAdd" (ngModelChange)="addTieBreaker($event)">
              <option value="">Choose...</option>
              <option *ngFor="let option of availableTieBreakerOptions" [value]="option.value">{{ option.label }}</option>
            </select></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Match rules</h2><p>Offside, bookings, injuries and substitutions.</p></div><button type="button" (click)="resetSection('match')">Reset section</button></div>
          <div class="tse-toggle-grid">
            <label><input type="checkbox" [ngModel]="onOff('rule_bookings', true)" (ngModelChange)="setOnOff('rule_bookings', $event)" /> Bookings <span>{{ badge('rule_bookings') }}</span></label>
            <label><input type="checkbox" [ngModel]="onOff('rule_offsides', true)" (ngModelChange)="setOnOff('rule_offsides', $event)" /> Offside <span>{{ badge('rule_offsides') }}</span></label>
            <label><input type="checkbox" [ngModel]="onOff('rule_injuries', true)" (ngModelChange)="setOnOff('rule_injuries', $event)" /> Injuries <span>{{ badge('rule_injuries') }}</span></label>
          </div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Substitutes on bench <em>{{ badge('rule_numsubsbench') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numsubsbench', '7')" (ngModelChange)="setSingle('rule_numsubsbench', $event)" /></label>
            <label class="tse-field"><span>Substitutions per match <em>{{ badge('rule_numsubsmatch') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numsubsmatch', '3')" (ngModelChange)="setSingle('rule_numsubsmatch', $event)" /></label>
          </div>
          <div class="tse-section-heading compact-heading"><div><h2>Cards and suspensions</h2></div></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Yellow cards before ban <em>{{ badge('rule_numyellowstored') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numyellowstored', '')" (ngModelChange)="setSingle('rule_numyellowstored', $event)" /></label>
            <label class="tse-field"><span>Red card ban min <em>{{ badge('rule_numgamesbanredmin') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbanredmin', '')" (ngModelChange)="setSingle('rule_numgamesbanredmin', $event)" /></label>
            <label class="tse-field"><span>Red card ban max <em>{{ badge('rule_numgamesbanredmax') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbanredmax', '')" (ngModelChange)="setSingle('rule_numgamesbanredmax', $event)" /></label>
            <label class="tse-field"><span>Double yellow ban min <em>{{ badge('rule_numgamesbandoubleyellowmin') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbandoubleyellowmin', '')" (ngModelChange)="setSingle('rule_numgamesbandoubleyellowmin', $event)" /></label>
            <label class="tse-field"><span>Double yellow ban max <em>{{ badge('rule_numgamesbandoubleyellowmax') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbandoubleyellowmax', '')" (ngModelChange)="setSingle('rule_numgamesbandoubleyellowmax', $event)" /></label>
            <label class="tse-field"><span>Stored yellows ban min <em>{{ badge('rule_numgamesbanyellowsmin') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbanyellowsmin', '')" (ngModelChange)="setSingle('rule_numgamesbanyellowsmin', $event)" /></label>
            <label class="tse-field"><span>Stored yellows ban max <em>{{ badge('rule_numgamesbanyellowsmax') }}</em></span><input type="number" min="0" [ngModel]="single('rule_numgamesbanyellowsmax', '')" (ngModelChange)="setSingle('rule_numgamesbanyellowsmax', $event)" /></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>How matches end</h2><p>Draws, extra time and penalties.</p></div><button type="button" (click)="resetSection('ending')">Reset section</button></div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>League match if draw <em>{{ badge('match_endruleleague') }}</em></span><select [ngModel]="single('match_endruleleague', 'END')" (ngModelChange)="setSingle('match_endruleleague', $event)">
              <option value="END">End as draw</option><option value="ET">Extra time</option><option value="PENS">Penalties</option>
            </select></label>
            <label class="tse-field"><span>Friendly if draw <em>{{ badge('match_endrulefriendly') }}</em></span><select [ngModel]="single('match_endrulefriendly', 'END')" (ngModelChange)="setSingle('match_endrulefriendly', $event)">
              <option value="END">End</option><option value="ET">Extra time</option><option value="PENS">Penalties</option>
            </select></label>
            <label class="tse-field"><span>Two-leg first leg if draw <em>{{ badge('match_endruleko2leg1') }}</em></span><select [ngModel]="single('match_endruleko2leg1', 'END')" (ngModelChange)="setSingle('match_endruleko2leg1', $event)">
              <option value="END">End</option><option value="ET">Extra time</option><option value="PENS">Penalties</option>
            </select></label>
          </div>
          <div class="tse-toggle-grid">
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko1leg', 'ET')" (ngModelChange)="toggleEndStep('match_endruleko1leg', 'ET', $event)" /> One-leg knockout: Extra time <span>{{ badge('match_endruleko1leg', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko1leg', 'PENS')" (ngModelChange)="toggleEndStep('match_endruleko1leg', 'PENS', $event)" /> One-leg knockout: Penalties <span>{{ badge('match_endruleko1leg', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko2leg2', 'AGG')" (ngModelChange)="toggleEndStep('match_endruleko2leg2', 'AGG', $event)" /> Two-leg second leg: Aggregate <span>{{ badge('match_endruleko2leg2', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko2leg2', 'AWAY')" (ngModelChange)="toggleEndStep('match_endruleko2leg2', 'AWAY', $event)" /> Two-leg second leg: Away goals <span>{{ badge('match_endruleko2leg2', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko2leg2', 'ET')" (ngModelChange)="toggleEndStep('match_endruleko2leg2', 'ET', $event)" /> Two-leg second leg: Extra time <span>{{ badge('match_endruleko2leg2', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko2leg2', 'ET_AWAY')" (ngModelChange)="toggleEndStep('match_endruleko2leg2', 'ET_AWAY', $event)" /> Two-leg second leg: Away goals after extra time <span>{{ badge('match_endruleko2leg2', true) }}</span></label>
            <label><input type="checkbox" [ngModel]="hasEndStep('match_endruleko2leg2', 'PENS')" (ngModelChange)="toggleEndStep('match_endruleko2leg2', 'PENS', $event)" /> Two-leg second leg: Penalties <span>{{ badge('match_endruleko2leg2', true) }}</span></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Season behavior</h2><p>Season start, repetition and calendar conflicts.</p></div><button type="button" (click)="resetSection('season')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Season starts in <em>{{ badge('schedule_seasonstartmonth') }}</em></span><select [ngModel]="single('schedule_seasonstartmonth', 'AUG')" (ngModelChange)="setSingle('schedule_seasonstartmonth', $event)">
              <option *ngFor="let option of rulesDisplay.monthOptions" [value]="option.value">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Start year <em>{{ badge('schedule_year_start') }}</em></span><input type="number" [ngModel]="single('schedule_year_start', '')" (ngModelChange)="setSingle('schedule_year_start', $event)" /></label>
            <label class="tse-field"><span>Repeat every <em>{{ badge('schedule_year_offset') }}</em></span><input type="number" min="1" [ngModel]="single('schedule_year_offset', '1')" (ngModelChange)="setSingle('schedule_year_offset', $event)" /></label>
            <label class="tse-field"><span>Minimum days before friendly <em>{{ badge('schedule_friendlydaysbefore') }}</em></span><input type="number" min="0" [ngModel]="single('schedule_friendlydaysbefore', '')" (ngModelChange)="setSingle('schedule_friendlydaysbefore', $event)" /></label>
            <label class="tse-field"><span>Minimum days between friendlies <em>{{ badge('schedule_friendlydaysbetweenmin') }}</em></span><input type="number" min="0" [ngModel]="single('schedule_friendlydaysbetweenmin', '')" (ngModelChange)="setSingle('schedule_friendlydaysbetweenmin', $event)" /></label>
            <label class="tse-field"><span>Use calendar dates from <em>{{ badge('schedule_use_dates_comp') }}</em></span><select [ngModel]="single('schedule_use_dates_comp', '')" (ngModelChange)="setSingle('schedule_use_dates_comp', $event)">
              <option value="">None</option><option *ngFor="let option of tournamentOptions" [value]="option.id">{{ option.label }}</option>
            </select></label>
          </div>
          <div class="tse-toggle-grid">
            <label><input type="checkbox" [ngModel]="numberToggle('schedule_internationaldependency', false)" (ngModelChange)="setNumberToggle('schedule_internationaldependency', $event)" /> Should this tournament avoid international match conflicts? <span>{{ badge('schedule_internationaldependency') }}</span></label>
            <label><input type="checkbox" [ngModel]="numberToggle('schedule_checkconflict', false)" (ngModelChange)="setNumberToggle('schedule_checkconflict', $event)" /> Check schedule conflicts and use backups <span>{{ badge('schedule_checkconflict') }}</span></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Promotion and relegation</h2><p>League movement and playoff targets.</p></div><button type="button" (click)="resetSection('promotion')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Promoted teams go to <em>{{ badge('info_league_promo') }}</em></span><select [ngModel]="single('info_league_promo', '')" (ngModelChange)="setSingle('info_league_promo', $event)">
              <option value="">None</option><option *ngFor="let option of tournamentOptions" [value]="option.id">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Relegated teams go to <em>{{ badge('info_league_releg') }}</em></span><select [ngModel]="single('info_league_releg', '')" (ngModelChange)="setSingle('info_league_releg', $event)">
              <option value="">None</option><option *ngFor="let option of tournamentOptions" [value]="option.id">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Promotion playoff <em>{{ badge('schedule_forcecomp') }}</em></span><select [ngModel]="single('schedule_forcecomp', '')" (ngModelChange)="setSingle('schedule_forcecomp', $event)">
              <option value="">None</option><option *ngFor="let option of tournamentOptions" [value]="option.id">{{ option.label }}</option>
            </select></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject">
          <div class="tse-section-heading"><div><h2>Prize money</h2><p>Simple values used by tournament rewards.</p></div><button type="button" (click)="resetSection('prize')">Reset section</button></div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Prize for winning <em>{{ badge('info_prize_money') }}</em></span><input type="number" min="0" [ngModel]="single('info_prize_money', '')" (ngModelChange)="setSingle('info_prize_money', $event)" /></label>
            <label class="tse-field"><span>Money drop / elimination drop <em>{{ badge('info_prize_money_drop') }}</em></span><input type="number" min="0" [ngModel]="single('info_prize_money_drop', '')" (ngModelChange)="setSingle('info_prize_money_drop', $event)" /></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject?.kind === 4">
          <div class="tse-section-heading"><div><h2>Stage rules</h2><p>Format and situation for the selected phase.</p></div><button type="button" (click)="resetSection('stage')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Stage format <em>{{ badge('match_stagetype') }}</em></span><select [ngModel]="single('match_stagetype', stageTypeDefault)" (ngModelChange)="setSingle('match_stagetype', $event)">
              <option *ngFor="let option of rulesDisplay.stageTypeOptions" [value]="option.value">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Match situation <em>{{ badge('match_matchsituation') }}</em></span><select [ngModel]="single('match_matchsituation', stageSituationDefault)" (ngModelChange)="setSingle('match_matchsituation', $event)">
              <option *ngFor="let option of rulesDisplay.matchSituationOptions" [value]="option.value">{{ option.label }}</option>
            </select></label>
            <label class="tse-field"><span>Max teams advancing per association <em>{{ badge('advance_maxteamsassoc') }}</em></span><input type="number" min="0" [ngModel]="single('advance_maxteamsassoc', '')" (ngModelChange)="setSingle('advance_maxteamsassoc', $event)" /></label>
            <label class="tse-field"><span>Advancing positions highlighted <em>{{ badge('info_color_slot_adv_group', true) }}</em></span><input [ngModel]="listValue('info_color_slot_adv_group')" (ngModelChange)="setList('info_color_slot_adv_group', $event)" placeholder="1,2,3" /></label>
          </div>
          <div class="tse-toggle-grid">
            <label><input type="checkbox" [ngModel]="numberToggle('advance_random_draw_event', false)" (ngModelChange)="setNumberToggle('advance_random_draw_event', $event)" /> Random draw <span>{{ badge('advance_random_draw_event') }}</span></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="selectedObject?.kind === 5">
          <div class="tse-section-heading"><div><h2>Group / Slot rules</h2><p>Table markers and points carryover for the selected group or slot.</p></div><button type="button" (click)="resetSection('group')">Reset section</button></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Games between teams <em>{{ badge('num_games') }}</em></span><input type="number" min="0" [ngModel]="single('num_games', '')" (ngModelChange)="setSingle('num_games', $event)" /></label>
            <label class="tse-field"><span>Stadium <em>{{ badge('match_stadium') }}</em></span><input type="number" min="0" [ngModel]="single('match_stadium', '')" (ngModelChange)="setSingle('match_stadium', $event)" /></label>
            <label class="tse-field"><span>Keep points from previous group <em>{{ badge('advance_pointskeep') }}</em></span><select [ngModel]="single('advance_pointskeep', '')" (ngModelChange)="setSingle('advance_pointskeep', $event)">
              <option value="">None</option><option *ngFor="let group of groups" [value]="group.id">{{ groupPathLabel(group) }}</option>
            </select></label>
            <label class="tse-field"><span>Percentage of points kept <em>{{ badge('advance_pointskeeppercentage') }}</em></span><input type="number" min="0" max="100" [ngModel]="single('advance_pointskeeppercentage', '')" (ngModelChange)="setSingle('advance_pointskeeppercentage', $event)" /></label>
          </div>
          <div class="tse-section-heading compact-heading"><div><h2>Table markers</h2></div></div>
          <div class="tse-form-grid three">
            <label class="tse-field"><span>Champion position <em>{{ badge('info_slot_champ') }}</em></span><input type="number" min="0" [ngModel]="single('info_slot_champ', '')" (ngModelChange)="setSingle('info_slot_champ', $event)" /></label>
            <label class="tse-field"><span>Promotion positions <em>{{ badge('info_slot_promo', true) }}</em></span><input [ngModel]="listValue('info_slot_promo')" (ngModelChange)="setList('info_slot_promo', $event)" placeholder="1,2" /></label>
            <label class="tse-field"><span>Playoff positions <em>{{ badge('info_slot_promo_poss', true) }}</em></span><input [ngModel]="listValue('info_slot_promo_poss')" (ngModelChange)="setList('info_slot_promo_poss', $event)" placeholder="3" /></label>
            <label class="tse-field"><span>Relegation positions <em>{{ badge('info_slot_releg', true) }}</em></span><input [ngModel]="listValue('info_slot_releg')" (ngModelChange)="setList('info_slot_releg', $event)" placeholder="19,20" /></label>
            <label class="tse-field"><span>Relegation playoff positions <em>{{ badge('info_slot_releg_poss', true) }}</em></span><input [ngModel]="listValue('info_slot_releg_poss')" (ngModelChange)="setList('info_slot_releg_poss', $event)" placeholder="18" /></label>
            <label class="tse-field"><span>European qualification positions <em>{{ badge('info_color_slot_euro_league', true) }}</em></span><input [ngModel]="listValue('info_color_slot_euro_league')" (ngModelChange)="setList('info_color_slot_euro_league', $event)" placeholder="5,6" /></label>
          </div>
        </section>

        <section class="tse-section tse-rules-panel" *ngIf="scope === 'global'">
          <div class="tse-section-heading"><div><h2>Global rules</h2><p>Changing global rules can affect many tournaments.</p></div><button type="button" (click)="resetSection('global')">Reset section</button></div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Country identity <em>{{ badge('nation_id') }}</em></span><input type="number" min="0" [ngModel]="single('nation_id', '')" (ngModelChange)="setSingle('nation_id', $event)" /></label>
            <label class="tse-field"><span>Discipline rules <em>{{ badge('rule_suspension') }}</em></span><input type="number" min="0" [ngModel]="single('rule_suspension', '')" (ngModelChange)="setSingle('rule_suspension', $event)" /></label>
          </div>
        </section>
      </ng-template>

      <section class="tse-section tse-rules-panel" *ngIf="showValidation">
        <div class="tse-section-heading"><div><h2>Validation</h2><p>Warnings preserve original data unless you change it.</p></div></div>
        <div class="tse-validation-list" *ngIf="objectValidationIssues.length; else rulesValid">
          <article *ngFor="let issue of objectValidationIssues" [class.error]="issue.severity === 'error'"><strong>{{ issue.severity === 'error' ? 'Error' : 'Warning' }}</strong><span>{{ issue.message }}</span><small *ngIf="issue.technical">Technical detail: {{ issue.technical }}</small></article>
        </div>
        <ng-template #rulesValid><ul class="tse-success-list"><li>Settings look valid for this scope</li></ul></ng-template>
      </section>

      <section class="tse-section tse-rules-panel" *ngIf="showPreview">
        <div class="tse-section-heading"><div><h2>settings.txt preview</h2><p>Technical lines generated for the selected object.</p></div></div>
        <div class="tse-generated-lines">
          <code *ngFor="let line of selectedPreviewLines">{{ line }}</code>
          <code *ngIf="!selectedPreviewLines.length">No custom settings for this object.</code>
        </div>
      </section>
    </section>
  `
})
export class TournamentRulesSettingsComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() reference?: DbProject;
  @Input({ required: true }) competition!: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<boolean>();

  scope: RulesScope = "tournament";
  selectedPhaseId = 0;
  selectedGroupId = 0;
  selectedGlobalId = 0;
  showCopy = false;
  showValidation = false;
  showPreview = false;
  copySourceId = 0;
  tieBreakerToAdd = "";
  copySections: Record<CopySectionKey, boolean> = {
    profile: true,
    points: true,
    match: true,
    ending: true,
    season: false,
    promotion: false,
    stage: false,
    group: false
  };

  readonly inheritedAttributes = [
    "comp_type",
    "standings_pointswin",
    "standings_pointsdraw",
    "standings_pointsloss",
    "standings_sort",
    "rule_numsubsbench",
    "rule_numsubsmatch",
    "rule_bookings",
    "rule_offsides",
    "rule_injuries",
    "match_endruleleague",
    "match_endruleko1leg",
    "schedule_seasonstartmonth",
    "schedule_year_offset",
    "info_league_promo",
    "info_league_releg"
  ];
  private selectionCache?: RulesSelection;
  private effectiveCache = new Map<string, EffectiveSetting>();

  constructor(
    public readonly display: CompObjDisplayService,
    private readonly tree: CompObjTreeService,
    private readonly settings: SettingsService,
    private readonly inheritance: SettingsInheritanceService,
    public readonly rulesDisplay: SettingsDisplayService,
    private readonly validation: SettingsValidationService
  ) {}

  ngOnChanges(): void {
    this.ensureSelections();
    this.refreshSelectionCache();
  }

  setScope(scope: RulesScope): void {
    this.scope = scope;
    this.ensureSelections();
    this.refreshSelectionCache();
  }

  ensureSelections(): void {
    if (!this.project || !this.competition) return;
    this.selectedPhaseId = this.selectedPhaseId && this.phases.some((phase) => phase.id === this.selectedPhaseId)
      ? this.selectedPhaseId
      : this.phases[0]?.id ?? 0;
    this.selectedGroupId = this.selectedGroupId && this.groups.some((group) => group.id === this.selectedGroupId)
      ? this.selectedGroupId
      : this.groups[0]?.id ?? 0;
    this.selectedGlobalId = this.selectedGlobalId && this.globalObjects.some((object) => object.id === this.selectedGlobalId)
      ? this.selectedGlobalId
      : this.tournamentObject?.parentId ?? this.globalObjects[0]?.id ?? 0;
    this.copySourceId = this.copySourceId || this.project.competitions.find((candidate) => candidate.id !== this.competition.id)?.id || 0;
  }

  refreshSelectionCache(): void {
    if (!this.project || !this.competition) return;
    const selectedObject = this.tree.object(this.project, this.selectedObjectId);
    const chainTargetId = selectedObject ? this.selectedObjectId : this.competition.id;
    this.selectionCache = {
      selectedObject,
      chain: this.inheritance.inheritanceChain(this.project, chainTargetId),
      validationIssues: selectedObject ? this.validation.validateObject(this.project, this.selectedObjectId) : [],
      settingsEntries: selectedObject ? this.settings.objectEntries(this.project, this.selectedObjectId) : [],
      previewLines: selectedObject ? this.settings.previewLines(this.project, this.selectedObjectId) : []
    };
    this.effectiveCache.clear();
  }

  get tournamentObject(): CompdataObject | undefined {
    return this.tree.object(this.project, this.competition.id);
  }

  get phases(): CompdataObject[] {
    return this.tree.phases(this.project, this.competition.id);
  }

  get groups(): CompdataObject[] {
    return this.phases.flatMap((phase) => this.tree.groups(this.project, phase.id));
  }

  get globalObjects(): CompdataObject[] {
    return this.project.objects.filter((object) => object.kind >= 0 && object.kind <= 2);
  }

  get selectedObjectId(): number {
    if (this.scope === "phases") return this.selectedPhaseId;
    if (this.scope === "groups") return this.selectedGroupId;
    if (this.scope === "global") return this.selectedGlobalId;
    return this.competition.id;
  }

  get selectedObject(): CompdataObject | undefined {
    return this.selectionCache?.selectedObject ?? this.tree.object(this.project, this.selectedObjectId);
  }

  get selectedObjectLabel(): string {
    return this.display.objectName(this.selectedObject, this.reference, this.project);
  }

  get inheritanceChain(): CompdataObject[] {
    return this.selectionCache?.chain ?? [];
  }

  get inheritancePath(): string {
    return this.inheritanceChain.slice(1).map((object) => this.display.objectName(object, this.reference, this.project)).join(" -> ");
  }

  get inheritedRows(): EffectiveSetting[] {
    return this.inheritedAttributes.map((attribute) => {
      const multi = attribute === "standings_sort" || attribute === "match_endruleko1leg";
      return multi
        ? this.inheritance.getEffectiveMultiSetting(this.project, this.competition.id, attribute)
        : this.inheritance.getEffectiveSetting(this.project, this.competition.id, attribute);
    });
  }

  get selectedObjectSettings() {
    return this.selectionCache?.settingsEntries ?? [];
  }

  get selectedPreviewLines(): string[] {
    return this.selectionCache?.previewLines ?? [];
  }

  get tournamentOptions(): Array<{ id: number; label: string }> {
    return this.project.competitions.map((competition) => ({
      id: competition.id,
      label: this.display.objectName(this.tree.object(this.project, competition.id), this.reference, this.project)
    }));
  }

  get competitionTypeSummary(): string {
    return this.rulesDisplay.competitionTypeLabel(this.single("comp_type", ""));
  }

  get pointsSummary(): string {
    return `${this.single("standings_pointswin", "3")} / ${this.single("standings_pointsdraw", "1")} / ${this.single("standings_pointsloss", "0")}`;
  }

  get substitutionsSummary(): string {
    return `${this.single("rule_numsubsmatch", "3")} match / ${this.single("rule_numsubsbench", "7")} bench`;
  }

  get validationStatus(): string {
    if (this.objectValidationIssues.some((issue) => issue.severity === "error")) return "Error";
    return this.objectValidationIssues.length ? "Warning" : "OK";
  }

  get objectValidationIssues(): SettingsValidationIssue[] {
    return this.selectionCache?.validationIssues ?? [];
  }

  get defaultCompetitionType(): string {
    if (this.scope === "global") return "NONE";
    const phases = this.phases;
    if (phases.some((phase) => this.display.isKnockoutPhase(phase))) return "CUP";
    return "LEAGUE";
  }

  get stageTypeDefault(): string {
    const object = this.selectedObject;
    if (!object || object.kind !== 4) return "LEAGUE";
    if (/setup/i.test(object.description)) return "SETUP";
    if (this.display.isKnockoutPhase(object)) return "KO1LEG";
    if (this.display.isGroupPhase(object)) return object.description === "FCE_Group_Stage" ? "GROUP" : "LEAGUE";
    return "LEAGUE";
  }

  get stageSituationDefault(): string {
    const object = this.selectedObject;
    if (!object || object.kind !== 4) return "LEAGUE";
    if (this.display.isKnockoutPhase(object)) {
      if (/quarter/i.test(object.description)) return "QUARTER";
      if (/semi/i.test(object.description)) return "SEMI";
      if (/third/i.test(object.description)) return "THIRDPLACE";
      if (/final/i.test(object.description)) return "FINAL";
      return "ROUNDX";
    }
    return object.description === "FCE_Group_Stage" ? "GROUP" : "LEAGUE";
  }

  get tieBreakers(): string[] {
    return this.multi("standings_sort", ["POINTS", "GOALDIFF", "GOALSFOR", "WINS"]);
  }

  get availableTieBreakerOptions() {
    const used = new Set(this.tieBreakers);
    return this.rulesDisplay.tieBreakerOptions.filter((option) => !used.has(option.value));
  }

  get copyPreviewLines(): string[] {
    if (!this.copySourceId || !this.selectedObject) return [];
    const attributes = this.copyAttributes();
    const lines: string[] = [];
    for (const attribute of attributes) {
      const values = this.settings.getMultiValues(this.project, this.copySourceId, attribute);
      values.forEach((value) => lines.push([this.selectedObjectId, attribute, value].join(",")));
    }
    return lines;
  }

  single(attribute: string, fallback: string): string {
    const effective = this.effective(attribute, false);
    return effective.value ?? fallback;
  }

  multi(attribute: string, fallback: string[] = []): string[] {
    const effective = this.effective(attribute, true);
    return effective.entries.length ? effective.entries.map((entry) => entry.value) : fallback;
  }

  badge(attribute: string, multi = false): string {
    const effective = this.effective(attribute, multi);
    if (!effective.isConfigured) return "Not configured";
    if (effective.isCustom) return this.scope === "global" ? "Global default" : "Custom";
    return `Inherited from ${this.display.objectName(effective.sourceObject, this.reference, this.project)}`;
  }

  setSingle(attribute: string, value: string | number): void {
    if (!this.selectedObject) return;
    const hadLocal = this.settings.hasLocalSetting(this.project, this.selectedObjectId, attribute);
    const normalized = String(value).trim();
    if (!normalized) {
      this.settings.removeSetting(this.project, this.selectedObjectId, attribute);
    } else {
      this.settings.setSingleSetting(this.project, this.selectedObjectId, attribute, normalized);
    }
    const hasLocal = this.settings.hasLocalSetting(this.project, this.selectedObjectId, attribute);
    this.changed(hadLocal !== hasLocal);
  }

  onOff(attribute: string, fallback: boolean): boolean {
    const value = this.single(attribute, fallback ? "on" : "off").toLowerCase();
    return value === "on" || value === "1";
  }

  setOnOff(attribute: string, enabled: boolean): void {
    this.setSingle(attribute, enabled ? "on" : "off");
  }

  numberToggle(attribute: string, fallback: boolean): boolean {
    return this.single(attribute, fallback ? "1" : "0") === "1";
  }

  setNumberToggle(attribute: string, enabled: boolean): void {
    this.setSingle(attribute, enabled ? "1" : "0");
  }

  moveTieBreaker(index: number, direction: -1 | 1): void {
    const values = [...this.tieBreakers];
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    [values[index], values[target]] = [values[target], values[index]];
    this.settings.setMultiSetting(this.project, this.selectedObjectId, "standings_sort", values);
    this.changed(false);
  }

  addTieBreaker(value: string): void {
    if (!value) return;
    const previousCount = this.settings.entries(this.project, this.selectedObjectId, "standings_sort").length;
    this.settings.setMultiSetting(this.project, this.selectedObjectId, "standings_sort", [...this.tieBreakers, value]);
    this.tieBreakerToAdd = "";
    this.changed(this.settings.entries(this.project, this.selectedObjectId, "standings_sort").length !== previousCount);
  }

  removeTieBreaker(index: number): void {
    const previousCount = this.settings.entries(this.project, this.selectedObjectId, "standings_sort").length;
    const values = this.tieBreakers.filter((_value, valueIndex) => valueIndex !== index);
    this.settings.setMultiSetting(this.project, this.selectedObjectId, "standings_sort", values);
    this.changed(this.settings.entries(this.project, this.selectedObjectId, "standings_sort").length !== previousCount);
  }

  hasEndStep(attribute: string, value: string): boolean {
    return this.multi(attribute, attribute === "match_endruleko1leg" ? ["ET", "PENS"] : []).includes(value);
  }

  toggleEndStep(attribute: string, value: string, enabled: boolean): void {
    const previousCount = this.settings.entries(this.project, this.selectedObjectId, attribute).length;
    const order = attribute === "match_endruleko2leg2" ? ["AGG", "AWAY", "ET", "ET_AWAY", "PENS"] : ["ET", "PENS"];
    const values = new Set(this.multi(attribute, []));
    if (enabled) values.add(value); else values.delete(value);
    this.settings.setMultiSetting(this.project, this.selectedObjectId, attribute, order.filter((candidate) => values.has(candidate)));
    this.changed(this.settings.entries(this.project, this.selectedObjectId, attribute).length !== previousCount);
  }

  listValue(attribute: string): string {
    return this.multi(attribute, []).join(",");
  }

  setList(attribute: string, value: string): void {
    const previousCount = this.settings.entries(this.project, this.selectedObjectId, attribute).length;
    this.settings.setMultiSetting(this.project, this.selectedObjectId, attribute, String(value).split(",").map((part) => part.trim()).filter(Boolean));
    this.changed(this.settings.entries(this.project, this.selectedObjectId, attribute).length !== previousCount);
  }

  resetSection(section: keyof typeof SETTINGS_SECTIONS): void {
    if (!this.selectedObject) return;
    this.settings.resetSettings(this.project, this.selectedObjectId, SETTINGS_SECTIONS[section]);
    this.changed(true);
  }

  resetCurrentObject(): void {
    if (!this.selectedObject) return;
    const attributes = [...new Set(this.selectedObjectSettings.map((setting) => setting.key))];
    this.settings.resetSettings(this.project, this.selectedObjectId, attributes);
    this.changed(true);
  }

  applyCopy(): void {
    if (!this.copySourceId || !this.selectedObject) return;
    this.settings.copyAttributes(this.project, this.copySourceId, this.selectedObjectId, this.copyAttributes());
    this.showCopy = false;
    this.changed(true);
  }

  groupPathLabel(group: CompdataObject): string {
    const phase = this.tree.object(this.project, group.parentId);
    return `${phase ? this.display.objectName(phase, this.reference, this.project) : "Phase"} / ${this.display.objectName(group, this.reference, this.project)}`;
  }

  private copyAttributes(): string[] {
    const attributes: string[] = [];
    (Object.keys(this.copySections) as CopySectionKey[]).forEach((section) => {
      if (!this.copySections[section]) return;
      attributes.push(...SETTINGS_SECTIONS[section]);
    });
    return [...new Set(attributes)];
  }

  private changed(settingsCountChanged = false): void {
    this.refreshSelectionCache();
    this.structureChanged.emit(settingsCountChanged);
  }

  private effective(attribute: string, multi: boolean): EffectiveSetting {
    const key = `${this.selectedObjectId}\u0000${multi ? "multi" : "single"}\u0000${attribute}`;
    const cached = this.effectiveCache.get(key);
    if (cached) return cached;
    const effective = multi
      ? this.inheritance.getEffectiveMultiSetting(this.project, this.selectedObjectId, attribute)
      : this.inheritance.getEffectiveSetting(this.project, this.selectedObjectId, attribute);
    this.effectiveCache.set(key, effective);
    return effective;
  }
}
