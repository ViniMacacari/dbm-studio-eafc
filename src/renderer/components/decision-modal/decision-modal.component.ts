import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

export interface DecisionOption {
  value: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

@Component({
  selector: "app-decision-modal",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tse-modal-backdrop">
      <section class="tse-modal" style="width: 450px; max-width: 90vw;" role="dialog" aria-modal="true">
        <header class="tse-modal-header">
          <div><h2 style="margin: 0; font-size: 16px;">{{ title }}</h2></div>
          <button type="button" aria-label="Close" (click)="close()">×</button>
        </header>
        <div class="tse-modal-body" style="padding: 24px; font-size: 14px;">
          <p style="margin: 0;">{{ text }}</p>
        </div>
        <footer class="tse-modal-actions" style="display: flex; justify-content: flex-end; gap: 8px;">
          <button 
            *ngFor="let opt of options" 
            type="button" 
            [class.tse-primary]="opt.primary && !opt.danger"
            [class.tse-danger]="opt.danger"
            (click)="selectOption(opt.value)"
          >
            {{ opt.label }}
          </button>
        </footer>
      </section>
    </div>
  `
})
export class DecisionModalComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) text!: string;
  @Input({ required: true }) options!: DecisionOption[];
  @Output() action = new EventEmitter<string>();

  close() {
    this.action.emit('cancel');
  }

  selectOption(value: string) {
    this.action.emit(value);
  }
}
