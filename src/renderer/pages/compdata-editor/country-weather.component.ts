import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CompdataCompetitionSummary, CompdataObject, CompdataProject, CompdataWeatherEntry, DbProject } from "../../../shared/types";
import { WeatherDisplayService } from "../../services/compdata/weather-display.service";
import { MissingWeatherFillMode, WeatherMonthDraft, WeatherPresetApplyMode, WeatherPresetKey, WeatherService } from "../../services/compdata/weather.service";
import { WeatherValidationIssue } from "../../services/compdata/weather-validation.service";
import { nations } from "../../../utils/get-nations/get-nations";

type WeatherDialog = "country" | "month" | "preset" | "copy" | "missing" | "validation" | "preview" | undefined;

interface WeatherMonthRow {
  month: number;
  entry?: CompdataWeatherEntry;
}

@Component({
  selector: "app-country-weather",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tse-content tse-weather-content">
      <header class="tse-entity-header">
        <div>
          <div class="tse-breadcrumb">Global Weather</div>
          <h1>Global Weather</h1>
          <p>Edit weather and lighting by country. These settings can affect all tournaments played in that country.</p>
          <small class="tse-entity-note">Weather is configured by country, not by tournament.</small>
        </div>
        <div class="tse-weather-header-actions">
          <button type="button" class="tse-primary" (click)="openCreateCountry()" [disabled]="!availableCountryOptions.length">Add country</button>
          <span class="tse-structure-badge">Global country setting</span>
        </div>
      </header>

      <div class="tse-field-help" *ngIf="contextCountry as country">
        Weather for {{ countryName(country) }}. This climate profile is shared by all competitions in this country.
      </div>
      <div class="tse-field-help" *ngIf="competition && !contextCountry">
        Weather depends on match country or stadium for this tournament. Use Global Weather to edit countries.
      </div>

      <div class="tse-weather-layout">
        <aside class="tse-weather-sidebar">
          <header>
            <strong>Country climate</strong>
            <span>{{ countries.length }} countries</span>
          </header>
          <input class="tse-search" [(ngModel)]="countrySearch" placeholder="Search country..." />
          <button type="button" class="tse-create" (click)="openCreateCountry()" [disabled]="!availableCountryOptions.length">+ Add country</button>
          <div class="tse-country-list">
            <button type="button" *ngFor="let country of filteredCountries" [class.active]="country.id === selectedCountryId" (click)="selectCountry(country.id)">
              <strong>{{ countryName(country) }}</strong>
              <span>{{ countryStatus(country) }}</span>
            </button>
          </div>
        </aside>

        <main class="tse-weather-main" *ngIf="selectedCountry as country; else noCountry">
          <header class="tse-section-heading">
            <div>
              <h2>Weather profile for {{ countryName(country) }}</h2>
              <p>Monthly climate, sunset and night time for this country.</p>
            </div>
          </header>

          <div class="tse-summary-grid">
            <div><strong>{{ summary.monthsConfigured }}/12</strong><span>Months configured</span></div>
            <div><strong>{{ summary.snowiestMonth }}</strong><span>Snowiest month</span></div>
            <div><strong>{{ summary.rainiestMonth }}</strong><span>Rainiest month</span></div>
            <div [class.warn]="summary.status !== 'OK'"><strong>{{ summary.status }}</strong><span>Status</span></div>
          </div>
          <div class="tse-summary-grid three">
            <div><strong>{{ summary.sunsetRange }}</strong><span>Sunset range</span></div>
            <div><strong>{{ missingMonths.length }}</strong><span>Missing months</span></div>
            <div><strong>{{ countryIssues.length }}</strong><span>Warnings / errors</span></div>
          </div>

          <div class="tse-actions">
            <button type="button" class="tse-primary" (click)="openEditMonth(1)">Edit month</button>
            <button type="button" (click)="openPresetDialog()">Generate climate preset</button>
            <button type="button" (click)="openCopyDialog()">Copy from another country</button>
            <button type="button" (click)="openMissingDialog()" [disabled]="!missingMonths.length">Add missing months</button>
            <button type="button" (click)="openValidation()">Validate weather</button>
            <button type="button" (click)="openPreview()">Preview weather.txt lines</button>
          </div>

          <div class="tse-data-table weather">
            <div class="head"><span>Month</span><span>Dry</span><span>Rain</span><span>Snow</span><span>Overcast</span><span>Sunset</span><span>Night</span><span>Actions</span></div>
            <div class="row" *ngFor="let row of monthRows">
              <span>{{ weatherDisplay.monthName(row.month) }}</span>
              <span>{{ row.entry ? row.entry.dryChance + '%' : 'Missing' }}</span>
              <span>{{ row.entry ? row.entry.rainChance + '%' : '-' }}</span>
              <span>{{ row.entry ? row.entry.snowChance + '%' : '-' }}</span>
              <span>{{ row.entry ? row.entry.overcastChance + '%' : '-' }}</span>
              <span>{{ row.entry ? weatherDisplay.formatTime(row.entry.sunsetTime) : '-' }}</span>
              <span>{{ row.entry ? weatherDisplay.formatTime(row.entry.nightTime) : '-' }}</span>
              <span class="tse-row-actions"><button type="button" (click)="openEditMonth(row.month)">{{ row.entry ? 'Edit' : 'Add' }}</button></span>
            </div>
          </div>

          <details class="tse-technical">
            <summary>Show technical details</summary>
            <p>weather.txt stores country weather as country objectId, month, weather chances and lighting times.</p>
            <div class="tse-code-panel">
              <span>Generated weather.txt lines for {{ countryName(country) }}</span>
              <code *ngFor="let line of technicalPreviewLines">{{ line }}</code>
              <code *ngIf="!technicalPreviewLines.length">No weather.txt lines for this country.</code>
            </div>
          </details>
        </main>

        <ng-template #noCountry>
          <main class="tse-main-empty">
            <strong>No countries found</strong>
            <span>Create or load Country objects before adding weather profiles.</span>
            <button type="button" class="tse-primary" (click)="openCreateCountry()" [disabled]="!availableCountryOptions.length">Add country</button>
          </main>
        </ng-template>
      </div>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'country'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Global Weather</span><h2>Add country</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <p>Create the country entry in compobj.txt, then configure its weather profile.</p>
          <label class="tse-field"><span>Country</span><select [(ngModel)]="newCountryNationId">
            <option *ngFor="let option of availableCountryOptions" [ngValue]="option.id">{{ option.name }}</option>
          </select></label>
          <label class="tse-checkline"><input type="checkbox" [(ngModel)]="createCountryWithPreset" /> Generate weather for all months now</label>
          <label class="tse-field" *ngIf="createCountryWithPreset"><span>Climate preset</span><select [(ngModel)]="createCountryPreset">
            <option *ngFor="let preset of weather.presets" [ngValue]="preset.key">{{ preset.label }}</option>
          </select></label>
          <div class="tse-field-help">DBM Studio will create the country as a normal compdata country object, using the same NationName entry used by tournament creation.</div>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!newCountryNationId" (click)="createCountry()">Create country</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'month' && selectedCountry">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Country weather</span><h2>Edit {{ weatherDisplay.monthName(editingMonth) }} weather</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Dry chance</span><input type="number" min="0" max="100" [(ngModel)]="monthDraft.dryChance" /></label>
            <label class="tse-field"><span>Rain chance</span><input type="number" min="0" max="100" [(ngModel)]="monthDraft.rainChance" /></label>
            <label class="tse-field"><span>Snow chance</span><input type="number" min="0" max="100" [(ngModel)]="monthDraft.snowChance" /></label>
            <label class="tse-field"><span>Overcast chance</span><input type="number" min="0" max="100" [(ngModel)]="monthDraft.overcastChance" /></label>
          </div>
          <div class="tse-form-grid two">
            <label class="tse-field"><span>Sunset</span><input type="time" [(ngModel)]="monthDraft.sunsetTime" /></label>
            <label class="tse-field"><span>Night time</span><input type="time" [(ngModel)]="monthDraft.nightTime" /></label>
          </div>
          <div class="tse-field-help" *ngIf="monthChanceTotal !== 100">
            Dry, rain and snow currently add up to {{ monthChanceTotal }}%. Values created by DBM Studio should add up to 100%.
            <button type="button" style="margin-left: 8px;" (click)="normalizeMonthDraft()">Normalize chances</button>
          </div>
          <details class="tse-technical">
            <summary>Advanced details</summary>
            <dl>
              <div><dt>Country objectId</dt><dd>{{ selectedCountryId }}</dd></div>
              <div><dt>Month</dt><dd>{{ editingMonth }}</dd></div>
              <div class="wide"><dt>Raw line</dt><dd>{{ monthTechnicalPreview }}</dd></div>
            </dl>
          </details>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" (click)="applyMonthDraftToAll()" [disabled]="!canSaveMonth">Apply to all months</button>
          <button type="button" class="tse-primary" [disabled]="!canSaveMonth" (click)="saveMonth()">Save month</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'preset' && selectedCountry">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Country climate</span><h2>Choose climate preset</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-choice-grid">
            <button type="button" *ngFor="let preset of weather.presets" [class.active]="preset.key === selectedPreset" (click)="selectedPreset = preset.key">
              <strong>{{ preset.label }}</strong>
              <span>{{ preset.description }}</span>
            </button>
          </div>
          <label class="tse-field"><span>Apply preset to</span><select [(ngModel)]="presetApplyMode"><option value="empty">Empty months only</option><option value="all">All months</option><option value="selected">Selected months</option></select></label>
          <div class="tse-month-picker" *ngIf="presetApplyMode === 'selected'">
            <label *ngFor="let month of monthRows"><input type="checkbox" [checked]="presetSelectedMonths.has(month.month)" (change)="togglePresetMonth(month.month)" /> {{ weatherDisplay.monthName(month.month) }}</label>
          </div>
          <div class="tse-data-table weather compact">
            <div class="head"><span>Month</span><span>Dry</span><span>Rain</span><span>Snow</span><span>Overcast</span><span>Sunset</span><span>Night</span><span></span></div>
            <div class="row" *ngFor="let entry of presetPreview">
              <span>{{ weatherDisplay.monthName(entry.month) }}</span>
              <span>{{ entry.dryChance }}%</span>
              <span>{{ entry.rainChance }}%</span>
              <span>{{ entry.snowChance }}%</span>
              <span>{{ entry.overcastChance }}%</span>
              <span>{{ weatherDisplay.formatTime(entry.sunsetTime) }}</span>
              <span>{{ weatherDisplay.formatTime(entry.nightTime) }}</span>
              <span></span>
            </div>
          </div>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" (click)="applyPreset()">Apply preset</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'copy' && selectedCountry">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Country climate</span><h2>Copy weather from country</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <label class="tse-field"><span>Select source country</span><select [(ngModel)]="copySourceCountryId"><option *ngFor="let country of copySourceCountries" [ngValue]="country.id">{{ countryName(country) }}</option></select></label>
          <div class="tse-resolved">
            <small>Preview</small>
            <strong>{{ copyPreviewText }}</strong>
          </div>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" [disabled]="!copySourceCountryId" (click)="copyWeather()">Copy weather</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'missing' && selectedCountry">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Country climate</span><h2>Add missing months</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <p>{{ missingMonths.length }} month(s) are missing for {{ countryName(selectedCountry) }}.</p>
          <label class="tse-field"><span>How should missing months be filled?</span><select [(ngModel)]="missingFillMode"><option value="nearest">Copy from nearest existing month</option><option value="temperate">Use temperate default</option><option value="custom">Use custom values</option></select></label>
          <div class="tse-form-grid two" *ngIf="missingFillMode === 'custom'">
            <label class="tse-field"><span>Dry chance</span><input type="number" min="0" max="100" [(ngModel)]="missingCustomDraft.dryChance" /></label>
            <label class="tse-field"><span>Rain chance</span><input type="number" min="0" max="100" [(ngModel)]="missingCustomDraft.rainChance" /></label>
            <label class="tse-field"><span>Snow chance</span><input type="number" min="0" max="100" [(ngModel)]="missingCustomDraft.snowChance" /></label>
            <label class="tse-field"><span>Overcast chance</span><input type="number" min="0" max="100" [(ngModel)]="missingCustomDraft.overcastChance" /></label>
            <label class="tse-field"><span>Sunset</span><input type="time" [(ngModel)]="missingCustomDraft.sunsetTime" /></label>
            <label class="tse-field"><span>Night time</span><input type="time" [(ngModel)]="missingCustomDraft.nightTime" /></label>
          </div>
        </div>
        <footer class="tse-modal-actions">
          <button type="button" (click)="closeDialog()">Cancel</button>
          <button type="button" class="tse-primary" (click)="addMissingMonths()">Add missing months</button>
        </footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'validation'">
      <section class="tse-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>Validation result</span><h2>{{ countryIssues.length ? 'Weather has warnings' : 'Weather looks valid' }}</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body tse-validation-list">
          <ng-container *ngIf="countryIssues.length; else noWeatherIssues">
            <article *ngFor="let issue of countryIssues" [class.error]="issue.severity === 'error'">
              <strong>{{ issue.severity === 'error' ? 'Error' : 'Warning' }}</strong>
              <span>{{ issue.message }}</span>
              <small *ngIf="issue.technical">Technical detail: {{ issue.technical }}</small>
            </article>
          </ng-container>
          <ng-template #noWeatherIssues>
            <ul class="tse-success-list">
              <li>Country has a valid weather profile</li>
              <li>Months and weather chances are valid</li>
              <li>Lighting times are valid</li>
            </ul>
          </ng-template>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Done</button></footer>
      </section>
    </div>

    <div class="tse-modal-backdrop" *ngIf="dialog === 'preview' && selectedCountry">
      <section class="tse-modal tse-preview-modal" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><span>weather.txt preview</span><h2>Generated weather lines</h2></div>
          <button type="button" (click)="closeDialog()">×</button>
        </header>
        <div class="tse-modal-body">
          <div class="tse-generated-lines">
            <code *ngFor="let line of technicalPreviewLines">{{ line }}</code>
            <code *ngIf="!technicalPreviewLines.length">No weather.txt lines for this country.</code>
          </div>
        </div>
        <footer class="tse-modal-actions"><button type="button" class="tse-primary" (click)="closeDialog()">Close preview</button></footer>
      </section>
    </div>
  `
})
export class CountryWeatherComponent implements OnChanges {
  @Input({ required: true }) project!: CompdataProject;
  @Input() reference?: DbProject;
  @Input() competition?: CompdataCompetitionSummary;
  @Output() structureChanged = new EventEmitter<void>();

  countries: CompdataObject[] = [];
  countrySearch = "";
  selectedCountryId = 0;
  dialog: WeatherDialog;
  editingMonth = 1;
  monthDraft: WeatherMonthDraft = this.defaultDraft();
  selectedPreset: WeatherPresetKey = "temperate";
  presetApplyMode: WeatherPresetApplyMode = "empty";
  presetSelectedMonths = new Set<number>(Array.from({ length: 12 }, (_, index) => index + 1));
  copySourceCountryId = 0;
  missingFillMode: MissingWeatherFillMode = "nearest";
  missingCustomDraft: WeatherMonthDraft = this.defaultDraft();
  newCountryNationId = 0;
  createCountryWithPreset = true;
  createCountryPreset: WeatherPresetKey = "temperate";

  constructor(
    public readonly weather: WeatherService,
    public readonly weatherDisplay: WeatherDisplayService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["project"] || changes["reference"] || changes["competition"]) {
      this.refreshCountries();
    }
  }

  get filteredCountries(): CompdataObject[] {
    const search = this.countrySearch.trim().toLowerCase();
    if (!search) return this.countries;
    return this.countries.filter((country) => {
      const label = this.countryName(country).toLowerCase();
      return label.includes(search) || country.shortName.toLowerCase().includes(search) || String(country.id).includes(search);
    });
  }

  get selectedCountry(): CompdataObject | undefined {
    return this.countries.find((country) => country.id === this.selectedCountryId);
  }

  get availableCountryOptions(): Array<{ id: number; name: string }> {
    const existingNationIds = new Set<number>();
    for (const country of this.project.objects.filter((object) => object.kind === 2)) {
      const nationId = /^NationName_(\d+)$/i.exec(country.description)?.[1];
      if (nationId) existingNationIds.add(Number(nationId));
    }
    return nations
      .filter((nation) => !existingNationIds.has(nation.id))
      .map((nation) => ({ id: nation.id, name: nation.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get contextCountry(): CompdataObject | undefined {
    if (!this.competition) return undefined;
    const country = this.project.objects.find((object) => object.id === this.competition!.parentId);
    return country?.kind === 2 ? country : undefined;
  }

  get monthRows(): WeatherMonthRow[] {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return { month, entry: this.weather.monthEntry(this.project, this.selectedCountryId, month) };
    });
  }

  get summary() {
    return this.weather.summary(this.project, this.selectedCountryId);
  }

  get missingMonths(): number[] {
    return this.weather.missingMonths(this.project, this.selectedCountryId);
  }

  get countryIssues(): WeatherValidationIssue[] {
    return this.selectedCountryId > 0 ? this.weather.validateCountry(this.project, this.selectedCountryId) : [];
  }

  get technicalPreviewLines(): string[] {
    return this.selectedCountryId > 0 ? this.weather.technicalPreview(this.project, this.selectedCountryId) : [];
  }

  get monthChanceTotal(): number {
    return Number(this.monthDraft.dryChance) + Number(this.monthDraft.rainChance) + Number(this.monthDraft.snowChance);
  }

  get canSaveMonth(): boolean {
    return this.selectedCountryId > 0
      && this.editingMonth >= 1
      && this.editingMonth <= 12
      && this.validPercent(this.monthDraft.dryChance)
      && this.validPercent(this.monthDraft.rainChance)
      && this.validPercent(this.monthDraft.snowChance)
      && this.validPercent(this.monthDraft.overcastChance)
      && Boolean(this.weatherDisplay.parseTime(this.monthDraft.sunsetTime))
      && Boolean(this.weatherDisplay.parseTime(this.monthDraft.nightTime));
  }

  get monthTechnicalPreview(): string {
    if (!this.selectedCountryId) return "";
    return [
      this.selectedCountryId,
      this.editingMonth,
      this.percent(this.monthDraft.dryChance),
      this.percent(this.monthDraft.rainChance),
      this.percent(this.monthDraft.snowChance),
      this.percent(this.monthDraft.overcastChance),
      this.weatherDisplay.parseTime(this.monthDraft.sunsetTime) || "sunsetTime",
      this.weatherDisplay.parseTime(this.monthDraft.nightTime) || "nightTime"
    ].join(",");
  }

  get presetPreview(): CompdataWeatherEntry[] {
    return this.weather.presetEntries(this.selectedCountryId || 0, this.selectedPreset);
  }

  get copySourceCountries(): CompdataObject[] {
    return this.countries.filter((country) => country.id !== this.selectedCountryId && this.weather.configuredMonths(this.project, country.id).size > 0);
  }

  get copyPreviewText(): string {
    const source = this.countries.find((country) => country.id === this.copySourceCountryId);
    if (!source || !this.selectedCountry) return "Choose a source country.";
    const count = this.weather.configuredMonths(this.project, source.id).size;
    return `${count} months will be copied from ${this.countryName(source)} to ${this.countryName(this.selectedCountry)}.`;
  }

  selectCountry(countryObjectId: number): void {
    this.selectedCountryId = countryObjectId;
  }

  countryName(country: CompdataObject): string {
    return this.weatherDisplay.countryObjectName(country, this.project, this.reference);
  }

  countryStatus(country: CompdataObject): string {
    const configured = this.weather.configuredMonths(this.project, country.id).size;
    return configured === 12 ? "12 months configured" : configured > 0 ? `${configured} months configured` : "Missing weather profile";
  }

  openCreateCountry(): void {
    const options = this.availableCountryOptions;
    this.newCountryNationId = options[0]?.id ?? 0;
    this.createCountryWithPreset = true;
    this.createCountryPreset = "temperate";
    this.dialog = "country";
  }

  createCountry(): void {
    const nation = nations.find((candidate) => candidate.id === Number(this.newCountryNationId));
    if (!nation) return;
    const existing = this.project.objects.find((object) => object.kind === 2 && object.description.toLowerCase() === `nationname_${nation.id}`);
    if (existing) {
      this.refreshCountries(existing.id);
      this.closeDialog();
      return;
    }

    const countryObjectId = this.nextObjectId();
    const worldObject = this.project.objects.find((object) => object.kind === 0);
    const shortCode = nation.name.substring(0, 4).toUpperCase();
    this.project.objects.push({
      id: countryObjectId,
      kind: 2,
      shortName: shortCode,
      description: `NationName_${nation.id}`,
      parentId: worldObject?.id ?? 0
    });

    if (this.createCountryWithPreset) {
      this.weather.applyPreset(this.project, countryObjectId, this.createCountryPreset, "all");
    }
    this.refreshCountries(countryObjectId);
    this.afterChange();
    this.closeDialog();
  }

  openEditMonth(month: number): void {
    this.editingMonth = month;
    const entry = this.weather.monthEntry(this.project, this.selectedCountryId, month);
    this.monthDraft = entry ? this.entryToDraft(entry) : this.weather.presetMonthDraft("temperate", month);
    this.dialog = "month";
  }

  saveMonth(): void {
    if (!this.canSaveMonth) return;
    this.weather.updateMonth(this.project, this.selectedCountryId, this.editingMonth, this.monthDraft);
    this.afterChange();
    this.closeDialog();
  }

  applyMonthDraftToAll(): void {
    if (!this.canSaveMonth) return;
    for (let month = 1; month <= 12; month += 1) {
      this.weather.updateMonth(this.project, this.selectedCountryId, month, this.monthDraft);
    }
    this.afterChange();
    this.closeDialog();
  }

  normalizeMonthDraft(): void {
    this.monthDraft = this.weather.normalizeDraft(this.monthDraft);
  }

  openPresetDialog(): void {
    this.selectedPreset = "temperate";
    this.presetApplyMode = this.missingMonths.length ? "empty" : "all";
    this.presetSelectedMonths = new Set(Array.from({ length: 12 }, (_, index) => index + 1));
    this.dialog = "preset";
  }

  togglePresetMonth(month: number): void {
    if (this.presetSelectedMonths.has(month)) {
      this.presetSelectedMonths.delete(month);
    } else {
      this.presetSelectedMonths.add(month);
    }
  }

  applyPreset(): void {
    this.weather.applyPreset(this.project, this.selectedCountryId, this.selectedPreset, this.presetApplyMode, [...this.presetSelectedMonths]);
    this.afterChange();
    this.closeDialog();
  }

  openCopyDialog(): void {
    this.copySourceCountryId = this.copySourceCountries[0]?.id ?? 0;
    this.dialog = "copy";
  }

  copyWeather(): void {
    if (!this.copySourceCountryId) return;
    this.weather.copyFromCountry(this.project, this.copySourceCountryId, this.selectedCountryId);
    this.afterChange();
    this.closeDialog();
  }

  openMissingDialog(): void {
    this.missingFillMode = "nearest";
    this.missingCustomDraft = this.defaultDraft();
    this.dialog = "missing";
  }

  addMissingMonths(): void {
    this.weather.addMissingMonths(this.project, this.selectedCountryId, this.missingFillMode, this.missingCustomDraft);
    this.afterChange();
    this.closeDialog();
  }

  openValidation(): void {
    this.dialog = "validation";
  }

  openPreview(): void {
    this.dialog = "preview";
  }

  closeDialog(): void {
    this.dialog = undefined;
  }

  private refreshCountries(preferredCountryId = 0): void {
    this.project.weatherEntries ??= [];
    this.project.weatherInvalidLines ??= [];
    this.countries = this.weather.countries(this.project, this.reference);
    const contextId = this.contextCountry?.id ?? 0;
    if (preferredCountryId && this.countries.some((country) => country.id === preferredCountryId)) {
      this.selectedCountryId = preferredCountryId;
    } else if (contextId && this.countries.some((country) => country.id === contextId)) {
      this.selectedCountryId = contextId;
    } else if (!this.countries.some((country) => country.id === this.selectedCountryId)) {
      this.selectedCountryId = this.countries[0]?.id ?? 0;
    }
  }

  private nextObjectId(): number {
    return Math.max(0, ...this.project.objects.map((object) => object.id)) + 1;
  }

  private afterChange(): void {
    this.structureChanged.emit();
  }

  private entryToDraft(entry: CompdataWeatherEntry): WeatherMonthDraft {
    return {
      dryChance: entry.dryChance,
      rainChance: entry.rainChance,
      snowChance: entry.snowChance,
      overcastChance: entry.overcastChance,
      sunsetTime: this.weatherDisplay.formatTime(entry.sunsetTime),
      nightTime: this.weatherDisplay.formatTime(entry.nightTime)
    };
  }

  private defaultDraft(): WeatherMonthDraft {
    return { dryChance: 60, rainChance: 35, snowChance: 5, overcastChance: 50, sunsetTime: "18:00", nightTime: "19:00" };
  }

  private validPercent(value: number): boolean {
    return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
  }

  private percent(value: number): number {
    return Math.max(0, Math.min(100, Math.trunc(Number(value) || 0)));
  }
}
