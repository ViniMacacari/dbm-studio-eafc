import { Injectable } from "@angular/core";
import type { CompdataAdvancement, CompdataObject, CompdataProject } from "../../../shared/types";

export interface AdvancementValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

@Injectable({
  providedIn: "root"
})
export class AdvancementService {

  /**
   * Generates knockout rules for consecutive phases.
   * e.g., 4 Quarter Finals -> 2 Semi Finals -> 1 Final.
   */
  autoGenerateKnockoutRules(phases: CompdataObject[], project: CompdataProject): CompdataAdvancement[] {
    const rules: CompdataAdvancement[] = [];

    for (let i = 0; i < phases.length - 1; i++) {
      const currentPhase = phases[i];
      const nextPhase = phases[i + 1];

      // Get slots for each phase
      const currentSlots = project.objects.filter(o => o.parentId === currentPhase.id && o.kind === 5).sort((a, b) => a.id - b.id);
      const nextSlots = project.objects.filter(o => o.parentId === nextPhase.id && o.kind === 5).sort((a, b) => a.id - b.id);

      // Check if it matches a clean knockout pattern (2 slots -> 1 slot)
      if (currentSlots.length > 0 && nextSlots.length > 0 && currentSlots.length === nextSlots.length * 2) {
        for (let slotIndex = 0; slotIndex < currentSlots.length; slotIndex++) {
          const fromSlot = currentSlots[slotIndex];
          const targetSlotIndex = Math.floor(slotIndex / 2);
          const targetSlot = nextSlots[targetSlotIndex];
          const targetRank = (slotIndex % 2) + 1;

          rules.push({
            fromGroupId: fromSlot.id,
            fromPosition: 1, // Winner
            toGroupId: targetSlot.id,
            toPosition: targetRank
          });
        }
      }
    }

    return rules;
  }

  /**
   * Checks for obvious errors or warnings in a rule.
   */
  validateRule(rule: CompdataAdvancement, project: CompdataProject): AdvancementValidationResult {
    const result: AdvancementValidationResult = { isValid: true, warnings: [], errors: [] };

    const fromGroup = project.objects.find(o => o.id === rule.fromGroupId);
    if (!fromGroup || fromGroup.kind !== 5) {
      result.isValid = false;
      result.errors.push(`The source slot (ID ${rule.fromGroupId}) does not exist or is not a match slot.`);
    }

    const toGroup = project.objects.find(o => o.id === rule.toGroupId);
    if (!toGroup || toGroup.kind !== 5) {
      result.isValid = false;
      result.errors.push(`The destination slot (ID ${rule.toGroupId}) does not exist or is not a match slot.`);
    }

    if (rule.fromPosition <= 0) {
      result.isValid = false;
      result.errors.push(`The source position must be greater than 0.`);
    }

    if (rule.toPosition <= 0) {
      result.isValid = false;
      result.errors.push(`The target position must be greater than 0.`);
    }

    // Check standings if available
    if (fromGroup) {
      const fromStandings = project.standings.filter(s => s.groupId === rule.fromGroupId);
      if (fromStandings.length > 0 && rule.fromPosition > fromStandings.length) {
        result.warnings.push(`The rule takes the ${rule.fromPosition}th place, but the slot only expects ${fromStandings.length} positions.`);
      }
    }

    if (toGroup) {
      const toStandings = project.standings.filter(s => s.groupId === rule.toGroupId);
      if (toStandings.length > 0 && rule.toPosition > toStandings.length) {
        result.warnings.push(`The rule places the team in the ${rule.toPosition}th place, but the destination slot only expects ${toStandings.length} positions.`);
      }
    }

    return result;
  }

  getRulesForCompetition(competitionId: number, project: CompdataProject): CompdataAdvancement[] {
    const competitionGroups = new Set<number>();
    
    // Find all phases
    const phases = project.objects.filter(o => o.parentId === competitionId);
    for (const phase of phases) {
      // Find all groups
      const groups = project.objects.filter(o => o.parentId === phase.id);
      for (const group of groups) {
        competitionGroups.add(group.id);
      }
    }

    return project.advancements.filter(a => competitionGroups.has(a.fromGroupId) || competitionGroups.has(a.toGroupId));
  }
}
