import { Injectable } from "@angular/core";
import type { CompdataAdvancement, CompdataObject, CompdataProject, DbProject } from "../../../shared/types";
import { CompObjDisplayService } from "./compobj-display.service";

export interface ResolvedAdvancementLocation {
  phaseName: string;
  slotName: string;
}

@Injectable({
  providedIn: "root"
})
export class AdvancementDisplayService {
  constructor(private display: CompObjDisplayService) {}

  /**
   * Translates a 1-based rank into a human-readable string.
   */
  describePosition(rank: number): string {
    if (rank === 1) return "Winner / 1st place";
    if (rank === 2) return "Runner-up / 2nd place";
    if (rank === 3) return "3rd place";
    if (rank === 4) return "4th place";
    return `${rank}th place`;
  }

  /**
   * Resolves a Group/Slot ID to its Phase and Slot names.
   */
  resolveLocation(groupId: number, project: CompdataProject, reference?: DbProject): ResolvedAdvancementLocation {
    const groupObj = this.display.object(project, groupId);
    if (!groupObj) {
      return { phaseName: "Unknown phase", slotName: `Slot ID ${groupId}` };
    }

    const slotName = this.display.objectName(groupObj, reference, project);
    
    let phaseName = "Unknown phase";
    const phaseObj = this.display.object(project, groupObj.parentId);
    if (phaseObj) {
      phaseName = this.display.objectName(phaseObj, reference, project);
    }

    return { phaseName, slotName };
  }

  /**
   * Translates an advancement rule into a full, human-readable sentence.
   */
  describeRule(rule: CompdataAdvancement, project: CompdataProject, reference?: DbProject): string {
    const fromLoc = this.resolveLocation(rule.fromGroupId, project, reference);
    const toLoc = this.resolveLocation(rule.toGroupId, project, reference);

    const fromPos = rule.fromPosition === 1 ? "Winner" : (rule.fromPosition === 2 ? "Runner-up" : `Team ${rule.fromPosition}`);
    
    return `${fromPos} of ${fromLoc.phaseName} (${fromLoc.slotName}) goes to ${toLoc.phaseName} (${toLoc.slotName}) as team ${rule.toPosition}.`;
  }
}
