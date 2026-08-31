import { Injectable } from "@angular/core";

export interface CopiedTableRows {
  tableName: string;
  rows: string[][];
}

@Injectable({
  providedIn: "root"
})
export class TableRowClipboardService {
  private copied?: CopiedTableRows;

  get hasRows(): boolean {
    return Boolean(this.copied);
  }

  copy(tableName: string, rows: string[][]): void {
    this.copied = {
      tableName,
      rows: rows.map((row) => [...row])
    };
  }

  read(): CopiedTableRows | undefined {
    if (!this.copied) {
      return undefined;
    }
    return {
      tableName: this.copied.tableName,
      rows: this.copied.rows.map((row) => [...row])
    };
  }
}
