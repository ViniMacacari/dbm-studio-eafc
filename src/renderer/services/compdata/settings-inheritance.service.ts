import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject, CompdataSetting } from "../../../shared/types";
import { CompObjTreeService } from "./compobj-tree.service";
import { SettingsService } from "./settings.service";

export interface EffectiveSetting {
  attribute: string;
  entries: CompdataSetting[];
  value?: string;
  sourceObject?: CompdataObject;
  sourceObjectId?: number;
  isCustom: boolean;
  isInherited: boolean;
  isConfigured: boolean;
}

@Injectable({ providedIn: "root" })
export class SettingsInheritanceService {
  constructor(
    private readonly tree: CompObjTreeService,
    private readonly settings: SettingsService
  ) {}

  inheritanceChain(project: CompdataProject, objectId: number): CompdataObject[] {
    const chain: CompdataObject[] = [];
    const visited = new Set<number>();
    let current = this.tree.object(project, objectId);

    while (current && !visited.has(current.id)) {
      chain.push(current);
      visited.add(current.id);
      current = this.tree.object(project, current.parentId);
    }

    return chain;
  }

  getEffectiveSetting(project: CompdataProject, objectId: number, attribute: string): EffectiveSetting {
    const chain = this.inheritanceChain(project, objectId);
    for (const object of chain) {
      const entries = this.settings.entries(project, object.id, attribute);
      if (!entries.length) continue;
      return {
        attribute,
        entries,
        value: entries[0].value,
        sourceObject: object,
        sourceObjectId: object.id,
        isCustom: object.id === objectId,
        isInherited: object.id !== objectId,
        isConfigured: true
      };
    }
    return { attribute, entries: [], isCustom: false, isInherited: false, isConfigured: false };
  }

  getEffectiveMultiSetting(project: CompdataProject, objectId: number, attribute: string): EffectiveSetting {
    const chain = this.inheritanceChain(project, objectId);
    for (const object of chain) {
      const entries = this.settings.entries(project, object.id, attribute);
      if (!entries.length) continue;
      return {
        attribute,
        entries,
        value: entries.map((entry) => entry.value).join(","),
        sourceObject: object,
        sourceObjectId: object.id,
        isCustom: object.id === objectId,
        isInherited: object.id !== objectId,
        isConfigured: true
      };
    }
    return { attribute, entries: [], isCustom: false, isInherited: false, isConfigured: false };
  }
}
