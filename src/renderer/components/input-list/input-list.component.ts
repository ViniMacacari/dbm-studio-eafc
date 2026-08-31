import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ElementRef, HostListener } from "@angular/core";
import { filterInputListOptions, InputListOption } from "./input-list-options";

export type { InputListOption } from "./input-list-options";

@Component({
  selector: "app-input-list",
  standalone: true,
  imports: [CommonModule],
  styleUrl: "./input-list.component.scss",
  template: `
    <div class="input-list-container" [class.open]="isOpen" [class.disabled]="disabled" [class.inline]="inlineDropdown">
      <div 
        class="input-list-trigger" 
        (click)="toggleOpen($event)" 
        tabindex="0"
        (keydown)="onKeydown($event)"
      >
        <span class="trigger-value">{{ displayLabel || placeholder }}</span>
        <span class="trigger-arrow"></span>
      </div>

      <div class="input-list-dropdown" *ngIf="isOpen" role="listbox">
        <div class="input-list-search" *ngIf="searchable">
          <input
            type="search"
            [value]="searchQuery"
            [placeholder]="searchPlaceholder"
            (input)="onSearch($event)"
            (keydown.escape)="close()"
            (click)="$event.stopPropagation()"
            autofocus
          />
        </div>
        <button
          *ngFor="let option of filteredOptions; trackBy: trackByOption"
          type="button"
          role="option"
          [class.active]="option.value === value"
          (mousedown)="selectOption(option, $event)"
        >
          <span class="option-copy">
            <strong>{{ option.label }}</strong>
            <small *ngIf="option.detail">{{ option.detail }}</small>
          </span>
        </button>
        <div class="input-list-empty" *ngIf="filteredOptions.length === 0">{{ emptyText }}</div>
      </div>
    </div>
  `
})
export class InputListComponent implements OnChanges {
  @Input() value = "";
  @Input() options: InputListOption[] = [];
  @Input() placeholder = "Select option";
  @Input() disabled = false;
  @Input() searchable = false;
  @Input() searchPlaceholder = "Search...";
  @Input() emptyText = "No options found.";
  @Input() inlineDropdown = false;
  @Output() valueChange = new EventEmitter<string>();

  displayLabel = "";
  isOpen = false;
  searchQuery = "";
  filteredOptions: InputListOption[] = [];

  constructor(private readonly elementRef: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["value"] || changes["options"]) {
      this.syncDisplayLabel();
    }
    if (changes["options"]) {
      this.resetFilter();
    }
  }

  toggleOpen(event: MouseEvent): void {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) this.resetFilter();
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      this.isOpen = !this.isOpen;
      if (this.isOpen) this.resetFilter();
      event.preventDefault();
    } else if (event.key === "Escape") {
      this.isOpen = false;
      event.preventDefault();
    }
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  selectOption(option: InputListOption, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.value = option.value;
    this.displayLabel = option.label;
    this.isOpen = false;
    this.valueChange.emit(option.value);
  }

  onSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    if (query === this.searchQuery) return;
    this.searchQuery = query;
    this.filteredOptions = filterInputListOptions(this.options, query);
  }

  close(): void {
    this.isOpen = false;
  }

  trackByOption(_index: number, option: InputListOption): string {
    return option.value;
  }

  private syncDisplayLabel(): void {
    const matched = this.options.find(opt => opt.value === this.value);
    this.displayLabel = matched ? matched.label : this.value;
  }

  private resetFilter(): void {
    this.searchQuery = "";
    this.filteredOptions = this.options;
  }
}
