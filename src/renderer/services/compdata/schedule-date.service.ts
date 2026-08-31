import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ScheduleDateService {
  readonly defaultSeasonBaseDate = "2011-12-25";

  dateToDayOffset(date: string, seasonBaseDate = this.defaultSeasonBaseDate): number {
    const matchDate = this.utcDateFromInput(date);
    const baseDate = this.utcDateFromInput(seasonBaseDate);
    return Math.round((matchDate.getTime() - baseDate.getTime()) / 86400000);
  }

  dayOffsetToDate(dayOffset: number, seasonBaseDate = this.defaultSeasonBaseDate): string {
    const baseDate = this.utcDateFromInput(seasonBaseDate);
    const date = new Date(baseDate.getTime() + Math.trunc(dayOffset) * 86400000);
    return this.toDateInput(date);
  }

  dayOffsetToMonthDay(dayOffset: number, seasonBaseDate = this.defaultSeasonBaseDate): { month: number; day: number } {
    return this.dateInputToMonthDay(this.dayOffsetToDate(dayOffset, seasonBaseDate));
  }

  formatDateInput(date: string): string {
    if (!this.isValidDateInput(date)) return "Invalid date";
    const [year, month, day] = date.split("-").map(Number);
    return `${day} ${this.monthName(month)} ${year}`;
  }

  formatSeasonDateInput(date: string): string {
    if (!this.isValidDateInput(date)) return "Invalid date";
    const [, month, day] = date.split("-").map(Number);
    return this.formatMonthDay(month, day);
  }

  formatMonthDay(month: number, day: number): string {
    return `${String(day).padStart(2, "0")} ${this.monthName(month)}`;
  }

  formatSpecificDate(date: string): string {
    const input = this.specificDateToInput(date);
    return input ? this.formatSeasonDateInput(input) : "Invalid date";
  }

  formatSpecificDateWithYear(date: string): string {
    const input = this.specificDateToInput(date);
    return input ? this.formatDateInput(input) : "Invalid date";
  }

  specificDateToInput(date: string): string {
    const trimmed = date.trim();
    if (!/^\d{8}$/.test(trimmed)) return "";
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    const input = `${year}-${month}-${day}`;
    return this.isValidDateInput(input) ? input : "";
  }

  dateInputToSpecific(date: string): string {
    if (!this.isValidDateInput(date)) return "";
    return date.replace(/-/g, "");
  }

  dateInputToMonthDay(date: string): { month: number; day: number } {
    if (!this.isValidDateInput(date)) return { month: 1, day: 1 };
    const [, month, day] = date.split("-").map(Number);
    return { month, day };
  }

  dateFromParts(year: number, month: number, day: number): string {
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      return "";
    }
    return this.toDateInput(parsed);
  }

  monthDayToDateInput(month: number, day: number, seasonBaseDate = this.defaultSeasonBaseDate): string {
    const baseDate = this.utcDateFromInput(seasonBaseDate);
    const baseYear = baseDate.getUTCFullYear();
    for (let year = baseYear; year <= baseYear + 4; year += 1) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) continue;
      const candidate = this.toDateInput(parsed);
      if (!this.isValidDateInput(candidate)) continue;
      if (this.utcDateFromInput(candidate).getTime() >= baseDate.getTime()) {
        return candidate;
      }
    }
    return "";
  }

  isValidMonthDay(month: number, day: number, seasonBaseDate = this.defaultSeasonBaseDate): boolean {
    return Boolean(this.monthDayToDateInput(month, day, seasonBaseDate));
  }

  addDaysToMonthDay(month: number, day: number, days: number, seasonBaseDate = this.defaultSeasonBaseDate): { month: number; day: number } {
    const date = this.monthDayToDateInput(month, day, seasonBaseDate);
    if (!date) return { month, day };
    return this.dateInputToMonthDay(this.addDays(date, days));
  }

  previewBaseYear(seasonBaseDate = this.defaultSeasonBaseDate): number {
    const baseDate = this.utcDateFromInput(seasonBaseDate);
    return baseDate.getUTCFullYear() + 1;
  }

  parseTimeToHHMM(timeString: string): string {
    const trimmed = timeString.trim();
    const colon = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    const compact = /^(\d{1,2})(\d{2})$/.exec(trimmed);
    const match = colon ?? compact;
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
    return `${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
  }

  formatTimeHHMM(time: string | number): string {
    const parsed = this.parseTimeToHHMM(String(time).padStart(4, "0"));
    if (!parsed) return "Invalid time";
    return `${parsed.slice(0, 2)}:${parsed.slice(2, 4)}`;
  }

  isValidHHMM(time: string | number): boolean {
    return Boolean(this.parseTimeToHHMM(String(time).padStart(4, "0")));
  }

  isValidDateInput(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return false;
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  addDays(date: string, days: number): string {
    const parsed = this.utcDateFromInput(date);
    return this.toDateInput(new Date(parsed.getTime() + Math.trunc(days) * 86400000));
  }

  private utcDateFromInput(date: string): Date {
    if (!this.isValidDateInput(date)) {
      throw new Error(`Invalid date: ${date}`);
    }
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private toDateInput(date: Date): string {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  monthName(month: number): string {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? "???";
  }
}
