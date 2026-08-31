import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, ViewEncapsulation } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import type { DataTable, DbProject, FieldDescriptor } from "../../../shared/types";
import { InputCheckboxComponent } from "../../components/input-checkbox/input-checkbox.component";
import type { DbMasterApi } from "../../services/dbmaster-api";
import { LeagueEditorService } from "../../services/league-editor.service";
import { NationService } from "../../services/nation.service";
import { PlayerEditorService } from "../../services/player-editor.service";
import { TeamEditorService } from "../../services/team-editor.service";
import { ProjectService } from "../../services/project.service";
import { TableRowClipboardService } from "../../services/table-row-clipboard.service";
import { ToastService } from "../../services/toast.service";
import { LoadingService } from "../../services/loading.service";

interface TableListItem {
  table: DataTable;
  index: number;
}

@Component({
  selector: "app-table-workspace",
  standalone: true,
  imports: [CommonModule, FormsModule, InputCheckboxComponent],
  templateUrl: "./table-workspace.component.html",
  encapsulation: ViewEncapsulation.None
})
export class TableWorkspaceComponent implements AfterViewInit {
  @Input() project?: DbProject;
  @Output() showHome = new EventEmitter<void>();
  @Output() showModules = new EventEmitter<void>();
  @Output() openPlayer = new EventEmitter<{ rowIndex: number }>();
  @Output() statusChanged = new EventEmitter<string>();

  @ViewChild("gridWrap") private gridWrap?: ElementRef<HTMLElement>;
  @ViewChild("dataGrid") private dataGrid?: ElementRef<HTMLTableElement>;
  @ViewChild("horizontalScroll") private horizontalScroll?: ElementRef<HTMLElement>;
  @ViewChild("horizontalScrollInner") private horizontalScrollInner?: ElementRef<HTMLElement>;

  private readonly api: DbMasterApi = window.dbmaster;
  private readonly minimumLoadingDurationMs = 400;
  readonly appName = "DBM Studio";

  // Grid/Pager parameters
  currentTableIndex = 0;
  page = 0;
  pageSize = 100;
  selectedColumnIndex = 0;
  selectedRows = new Set<number>();
  sort?: { column: number; direction: 1 | -1 };
  tableFilter = "";
  searchTerm = "";
  searchExact = false;
  statusLine = "Ready";

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    private readonly projectService: ProjectService,
    private readonly leagueEditor: LeagueEditorService,
    private readonly nations: NationService,
    private readonly playerEditor: PlayerEditorService,
    private readonly teamEditor: TeamEditorService,
    private readonly tableRowClipboard: TableRowClipboardService,
    private readonly toastService: ToastService,
    private readonly loadingService: LoadingService
  ) {}

  ngAfterViewInit(): void {
    this.syncHorizontalScrollbar();
  }

  get projectSubtitle(): string {
    return this.projectService.projectSubtitle;
  }

  get hasProject(): boolean {
    return this.projectService.hasProject;
  }

  get canSaveDatabase(): boolean {
    return this.projectService.canSaveDatabase;
  }

  get hasTable(): boolean {
    return Boolean(this.currentTable());
  }

  get isPlayersTable(): boolean {
    return this.playerEditor.isPlayersTable(this.currentTable());
  }

  get canOpenPlayerEditor(): boolean {
    return this.isPlayersTable && this.selectedRows.size === 1;
  }

  get selectedPlayerName(): string {
    if (!this.project || !this.isPlayersTable || this.selectedRows.size !== 1) {
      return "";
    }
    return this.playerEditor.resolvePlayerName(this.project, this.selectedRowIndexes()[0]);
  }

  get hasSelection(): boolean {
    return this.selectedRows.size > 0;
  }

  get canPaste(): boolean {
    return this.hasTable && this.tableRowClipboard.hasRows;
  }

  get canReplace(): boolean {
    return this.hasSelection && this.canPaste;
  }

  get fieldInfo(): string {
    const table = this.currentTable();
    if (!table) {
      return "-";
    }
    const field = table.fields[this.selectedColumnIndex];
    if (!field) {
      return table.warning || `${table.rows.length} records`;
    }
    const range = field.rangeHigh >= field.rangeLow ? ` / ${field.rangeLow}..${field.rangeHigh}` : "";
    const depth = field.depth ? ` / ${field.depth} bits` : "";
    return `${field.kind}${range}${depth}`;
  }

  get pageInfo(): string {
    const table = this.currentTable();
    if (!table || table.rows.length === 0) {
      return "0 - 0 / 0";
    }
    const { start, end, total } = this.pageBounds(table);
    return `${start + 1} - ${end} / ${total}`;
  }

  get isPrevDisabled(): boolean {
    return this.page === 0;
  }

  get isNextDisabled(): boolean {
    const table = this.currentTable();
    if (!table) {
      return true;
    }
    return this.pageBounds(table).end >= table.rows.length;
  }

  filteredTables(): TableListItem[] {
    const filter = this.tableFilter.trim().toLowerCase();
    return (this.project?.tables ?? [])
      .map((table, index) => ({ table, index }))
      .filter((item) => !filter || item.table.name.toLowerCase().includes(filter));
  }

  currentTable(): DataTable | undefined {
    return this.project?.tables[this.currentTableIndex];
  }

  visibleRowIndexes(): number[] {
    const table = this.currentTable();
    if (!table) {
      return [];
    }
    const { start, end } = this.pageBounds(table);
    const indexes: number[] = [];
    for (let index = start; index < end; index += 1) {
      indexes.push(index);
    }
    return indexes;
  }

  trackByTable(_index: number, item: TableListItem): string {
    return `${item.index}:${item.table.name}`;
  }

  trackByColumn(index: number): number {
    return index;
  }

  trackByRowIndex(_index: number, rowIndex: number): number {
    return rowIndex;
  }

  async openDatabase(): Promise<void> {
    await this.projectService.openDatabase();
    this.setStatus(this.projectService.statusLine);
  }

  async saveProject(): Promise<void> {
    await this.projectService.saveProject();
    this.setStatus(this.projectService.statusLine);
  }

  async exportAll(): Promise<void> {
    await this.projectService.exportAll();
    this.setStatus(this.projectService.statusLine);
  }

  async importAll(): Promise<void> {
    await this.projectService.importAll();
    this.setStatus(this.projectService.statusLine);
  }

  async exportTable(): Promise<void> {
    await this.guarded(async () => {
      const table = this.currentTable();
      if (!table) {
        return;
      }
      const result = await this.api.exportTable(table);
      if (result.filePath) {
        this.setStatus(`${table.name} exported`);
      }
    });
  }

  async importTable(): Promise<void> {
    await this.guarded(async () => {
      const table = this.currentTable();
      const result = await this.api.importTable(table?.name);
      if (result.table) {
        this.mergeImportedTable(result.table);
      }
    });
  }

  async calculateHashes(): Promise<void> {
    await this.guarded(async () => {
      const table = this.currentTable();
      if (!table) {
        return;
      }
      const hashIndex = table.columns.findIndex((column) => column.toLowerCase() === "hashid");
      const stringIndex = table.columns.findIndex((column) => column.toLowerCase() === "stringid");
      if (hashIndex < 0 || stringIndex < 0) {
        this.toastService.show("This table needs hashid and stringid columns.", "warn");
        return;
      }

      const hashes = await this.api.computeLanguageHashes(table.rows.map((row) => row[stringIndex] ?? ""));
      hashes.forEach((hash, index) => {
        table.rows[index][hashIndex] = String(hash);
      });
      table.changed = true;
      this.syncHorizontalScrollbar();
      this.setStatus(`Calculated ${hashes.length} hash value(s)`);
    }, "Calculating hashes", "Updating hashid values");
  }

  selectTable(index: number): void {
    this.currentTableIndex = index;
    this.page = 0;
    this.selectedColumnIndex = 0;
    this.selectedRows.clear();
    this.resetHorizontalScroll();
  }

  selectColumn(index: number): void {
    this.selectedColumnIndex = index;
  }

  sortByColumn(column: number): void {
    const table = this.currentTable();
    if (!table) {
      return;
    }
    const direction = this.sort?.column === column ? (this.sort.direction * -1) as 1 | -1 : 1;
    this.sort = { column, direction };
    table.rows.sort((left, right) => {
      const a = left[column] ?? "";
      const b = right[column] ?? "";
      const na = Number(a);
      const nb = Number(b);
      const result = Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
      return result * direction;
    });
    table.changed = true;
    this.syncHorizontalScrollbar();
  }

  updateCell(rowIndex: number, columnIndex: number, event: Event): void {
    const table = this.currentTable();
    const input = event.target as HTMLInputElement;
    if (!table) {
      return;
    }
    table.rows[rowIndex][columnIndex] = input.value;
    table.changed = true;
    this.invalidateTableCaches(table);
    this.setStatus(`${table.name} changed`);
  }

  toggleRow(rowIndex: number, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.selectedRows.add(rowIndex);
    } else {
      this.selectedRows.delete(rowIndex);
    }
  }

  selectGridRow(rowIndex: number, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedRows.has(rowIndex)) {
        this.selectedRows.delete(rowIndex);
      } else {
        this.selectedRows.add(rowIndex);
      }
      return;
    }

    this.selectedRows.clear();
    this.selectedRows.add(rowIndex);
    if (this.isPlayersTable) {
      const name = this.selectedPlayerName;
      this.setStatus(name ? `${name} selected` : `Player row ${rowIndex + 1} selected`);
    }
  }

  openPlayerEditor(): void {
    if (!this.canOpenPlayerEditor) {
      this.toastService.show("Select one player row.", "warn");
      return;
    }
    this.openPlayer.emit({ rowIndex: this.selectedRowIndexes()[0] });
  }

  copyRows(): void {
    const table = this.currentTable();
    if (!table) {
      return;
    }
    const rows = this.selectedRowIndexes().map((index) => [...table.rows[index]]);
    if (rows.length === 0) {
      this.toastService.show("Select at least one row.", "warn");
      return;
    }
    this.tableRowClipboard.copy(table.name, rows);
    this.setStatus(`${rows.length} row(s) copied`);
  }

  pasteRows(replace = false): void {
    const table = this.currentTable();
    const copied = this.tableRowClipboard.read();
    if (!table || !copied) {
      return;
    }
    if (copied.tableName !== table.name) {
      this.toastService.show("Copied rows belong to another table.", "warn");
      return;
    }
    if (replace) {
      this.deleteRows(false);
    }
    table.rows.push(...copied.rows);
    table.changed = true;
    this.invalidateTableCaches(table);
    this.syncHorizontalScrollbar();
    this.setStatus(`${copied.rows.length} row(s) pasted`);
  }

  addRow(): void {
    const table = this.currentTable();
    if (!table) {
      return;
    }

    const row = table.columns.map((_column, columnIndex) => this.defaultCellValue(table.fields[columnIndex]));
    table.rows.push(row);
    table.changed = true;
    this.sort = undefined;
    this.invalidateTableCaches(table);

    const rowIndex = table.rows.length - 1;
    this.page = Math.floor(rowIndex / this.pageSize);
    this.selectedRows.clear();
    this.selectedRows.add(rowIndex);
    this.selectedColumnIndex = 0;
    this.scrollToLastRow();
    this.setStatus(`New row added to ${table.name}`);
  }

  deleteRows(showMessage = true): void {
    const table = this.currentTable();
    if (!table) {
      return;
    }
    const selected = new Set(this.selectedRowIndexes());
    if (selected.size === 0) {
      if (showMessage) {
        this.toastService.show("Select at least one row.", "warn");
      }
      return;
    }
    table.rows = table.rows.filter((_row, index) => !selected.has(index));
    table.changed = true;
    this.invalidateTableCaches(table);
    this.selectedRows.clear();
    this.syncHorizontalScrollbar();
    if (showMessage) {
      this.setStatus(`${selected.size} row(s) deleted`);
    }
  }

  countRows(): void {
    const table = this.currentTable();
    if (table) {
      this.toastService.show(`Record counter = ${table.rows.length}`);
    }
  }

  findNext(): void {
    const table = this.currentTable();
    if (!table) {
      return;
    }
    const term = this.searchTerm.toLowerCase();
    const column = this.selectedColumnIndex;
    if (!term) {
      this.toastService.show("Type a search value.", "warn");
      return;
    }

    const total = table.rows.length;
    const current = this.selectedRows.size > 0 ? this.selectedRowIndexes()[0] : this.page * this.pageSize;
    for (let step = 1; step <= total; step += 1) {
      const index = (current + step) % total;
      const value = String(table.rows[index][column] ?? "").toLowerCase();
      const ok = this.searchExact ? value === term : value.includes(term);
      if (ok) {
        this.selectedRows.clear();
        this.selectedRows.add(index);
        this.page = Math.floor(index / this.pageSize);
        this.syncHorizontalScrollbar();
        this.scrollToRow(index);
        return;
      }
    }
    this.toastService.show("Not found", "warn");
  }

  previousPage(): void {
    this.page = Math.max(0, this.page - 1);
    this.syncHorizontalScrollbar();
  }

  nextPage(): void {
    this.page += 1;
    this.syncHorizontalScrollbar();
  }

  onPageSizeChange(): void {
    this.page = 0;
    this.syncHorizontalScrollbar();
  }

  scrollToSelectedColumn(): void {
    requestAnimationFrame(() => {
      const gridWrap = this.gridWrap?.nativeElement;
      const dataGrid = this.dataGrid?.nativeElement;
      const horizontalScroll = this.horizontalScroll?.nativeElement;
      const columnHeader = dataGrid?.querySelector<HTMLElement>(
        `thead th[data-column-index="${this.selectedColumnIndex}"]`
      );
      if (!gridWrap || !dataGrid || !columnHeader) {
        return;
      }

      const frozenColumnWidth = dataGrid.querySelector<HTMLElement>("thead .row-select")?.offsetWidth ?? 0;
      const availableWidth = Math.max(0, gridWrap.clientWidth - frozenColumnWidth);
      const centeredPosition = columnHeader.offsetLeft
        - frozenColumnWidth
        - (availableWidth - columnHeader.offsetWidth) / 2;
      const maximumScroll = Math.max(0, gridWrap.scrollWidth - gridWrap.clientWidth);
      gridWrap.scrollLeft = Math.min(maximumScroll, Math.max(0, centeredPosition));
      if (horizontalScroll) {
        horizontalScroll.scrollLeft = gridWrap.scrollLeft;
      }
    });
  }

  onHorizontalScroll(): void {
    const gridWrap = this.gridWrap?.nativeElement;
    const horizontalScroll = this.horizontalScroll?.nativeElement;
    if (!gridWrap || !horizontalScroll) {
      return;
    }
    if (Math.abs(gridWrap.scrollLeft - horizontalScroll.scrollLeft) > 1) {
      gridWrap.scrollLeft = horizontalScroll.scrollLeft;
    }
  }

  onGridScroll(): void {
    const gridWrap = this.gridWrap?.nativeElement;
    const horizontalScroll = this.horizontalScroll?.nativeElement;
    if (!gridWrap || !horizontalScroll) {
      return;
    }
    if (Math.abs(horizontalScroll.scrollLeft - gridWrap.scrollLeft) > 1) {
      horizontalScroll.scrollLeft = gridWrap.scrollLeft;
    }
  }

  onGridWheel(event: WheelEvent): void {
    const gridWrap = this.gridWrap?.nativeElement;
    const horizontalScroll = this.horizontalScroll?.nativeElement;
    if (!gridWrap || !horizontalScroll || !event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    gridWrap.scrollLeft += event.deltaY;
    horizontalScroll.scrollLeft = gridWrap.scrollLeft;
    event.preventDefault();
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    this.syncHorizontalScrollbar();
  }

  setStatus(message: string): void {
    this.statusLine = message;
    this.statusChanged.emit(message);
  }

  private mergeImportedTable(imported: DataTable): void {
    const project = this.project;
    const table = this.currentTable();
    if (!project || !table) {
      return;
    }

    if (imported.columns.join("\t") !== table.columns.join("\t")) {
      this.toastService.show("Imported columns do not match the current table.", "warn");
      return;
    }

    imported.name = table.name;
    imported.fields = table.fields;
    imported.changed = true;
    project.tables[this.currentTableIndex] = imported;
    this.invalidateTableCaches(imported);
    this.syncHorizontalScrollbar();
    this.setStatus(`${table.name} imported`);
  }

  private invalidateTableCaches(table: DataTable): void {
    this.leagueEditor.invalidateTable(table);
    this.nations.invalidateTable(table);
    this.playerEditor.invalidateTable(table);
    this.teamEditor.invalidateTable(table);
  }

  private defaultCellValue(field: FieldDescriptor | undefined): string {
    if (!field) {
      return "";
    }
    if (field.kind === "string" || field.kind === "shortCompressedString" || field.kind === "longCompressedString" || field.kind === "unknown") {
      return "";
    }
    if (field.rangeHigh >= field.rangeLow) {
      if (field.rangeLow <= 0 && field.rangeHigh >= 0) {
        return "0";
      }
      return String(Math.trunc(field.rangeLow));
    }
    return "0";
  }

  selectedRowIndexes(): number[] {
    return [...this.selectedRows].sort((left, right) => left - right);
  }

  private pageBounds(table: DataTable): { start: number; end: number; total: number } {
    const total = table.rows.length;
    const maxPage = Math.max(0, Math.ceil(total / this.pageSize) - 1);
    this.page = Math.min(this.page, maxPage);
    const start = this.page * this.pageSize;
    const end = Math.min(total, start + this.pageSize);
    return { start, end, total };
  }

  private async guarded(action: () => Promise<void>, title?: string, detail?: string): Promise<void> {
    let loadingStartedAt = 0;
    try {
      if (title) {
        this.loadingService.show(title, detail ?? "Please wait");
        this.changeDetector.detectChanges();
        loadingStartedAt = performance.now();
      }
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.toastService.show(message, "error");
      this.setStatus("Error");
    } finally {
      if (title) {
        const elapsed = performance.now() - loadingStartedAt;
        const remaining = Math.max(0, this.minimumLoadingDurationMs - elapsed);
        if (remaining > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
        }
        this.loadingService.hide();
        this.changeDetector.detectChanges();
      }
    }
  }

  private resetHorizontalScroll(): void {
    requestAnimationFrame(() => {
      if (this.gridWrap?.nativeElement) {
        this.gridWrap.nativeElement.scrollLeft = 0;
      }
      if (this.horizontalScroll?.nativeElement) {
        this.horizontalScroll.nativeElement.scrollLeft = 0;
      }
      this.syncHorizontalScrollbar();
    });
  }

  private scrollToLastRow(): void {
    requestAnimationFrame(() => {
      if (this.gridWrap?.nativeElement) {
        this.gridWrap.nativeElement.scrollTop = this.gridWrap.nativeElement.scrollHeight;
        this.gridWrap.nativeElement.scrollLeft = 0;
      }
      if (this.horizontalScroll?.nativeElement) {
        this.horizontalScroll.nativeElement.scrollLeft = 0;
      }
      this.syncHorizontalScrollbar();
    });
  }

  private scrollToRow(rowIndex: number): void {
    requestAnimationFrame(() => {
      const gridWrap = this.gridWrap?.nativeElement;
      const dataGrid = this.dataGrid?.nativeElement;
      const row = dataGrid?.querySelector<HTMLElement>(`tbody tr[data-row-index="${rowIndex}"]`);
      if (!gridWrap || !dataGrid || !row) {
        return;
      }

      const headerHeight = dataGrid.tHead?.offsetHeight ?? 0;
      const availableHeight = Math.max(0, gridWrap.clientHeight - headerHeight);
      const centeredPosition = row.offsetTop
        - headerHeight
        - (availableHeight - row.offsetHeight) / 2;
      const maximumScroll = Math.max(0, gridWrap.scrollHeight - gridWrap.clientHeight);
      gridWrap.scrollTop = Math.min(maximumScroll, Math.max(0, centeredPosition));
    });
  }

  syncHorizontalScrollbar(): void {
    requestAnimationFrame(() => {
      const table = this.currentTable();
      const gridWrap = this.gridWrap?.nativeElement;
      const dataGrid = this.dataGrid?.nativeElement;
      const horizontalScroll = this.horizontalScroll?.nativeElement;
      const horizontalScrollInner = this.horizontalScrollInner?.nativeElement;
      if (!table || !gridWrap || !dataGrid || !horizontalScroll || !horizontalScrollInner) {
        return;
      }

      const scrollWidth = dataGrid.scrollWidth;
      const clientWidth = gridWrap.clientWidth;
      horizontalScrollInner.style.width = `${Math.max(scrollWidth, clientWidth)}px`;
      horizontalScroll.classList.toggle("hidden", scrollWidth <= clientWidth + 1);
      horizontalScroll.scrollLeft = gridWrap.scrollLeft;
    });
  }
}
