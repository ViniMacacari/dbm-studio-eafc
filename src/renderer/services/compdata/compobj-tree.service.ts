import { Injectable } from "@angular/core";
import type { CompdataObject, CompdataProject } from "../../../shared/types";

export interface CompObjTreeRow {
  object: CompdataObject;
  depth: number;
}

interface CompObjIndex {
  objectsReference: CompdataObject[];
  objectCount: number;
  byId: Map<number, CompdataObject>;
  idCounts: Map<number, number>;
  byParent: Map<number, CompdataObject[]>;
  fullTree: CompObjTreeRow[];
  descendants: Map<number, CompdataObject[]>;
}

@Injectable({ providedIn: "root" })
export class CompObjTreeService {
  private readonly indexes = new WeakMap<CompdataProject, CompObjIndex>();

  invalidate(project: CompdataProject): void {
    this.indexes.delete(project);
  }

  prime(project: CompdataProject): void {
    this.index(project);
  }

  object(project: CompdataProject, id: number): CompdataObject | undefined {
    return this.index(project).byId.get(id);
  }

  idCount(project: CompdataProject, id: number): number {
    return this.index(project).idCounts.get(id) ?? 0;
  }

  children(project: CompdataProject, parentId: number, kind?: number): CompdataObject[] {
    const children = this.index(project).byParent.get(parentId) ?? [];
    return kind === undefined ? children : children.filter((object) => object.kind === kind);
  }

  phases(project: CompdataProject, tournamentId: number): CompdataObject[] {
    return this.children(project, tournamentId, 4);
  }

  groups(project: CompdataProject, phaseId: number): CompdataObject[] {
    return this.children(project, phaseId, 5);
  }

  tournamentObjects(project: CompdataProject, tournamentId: number): CompdataObject[] {
    const index = this.index(project);
    const cached = index.descendants.get(tournamentId);
    if (cached) return cached;

    const result: CompdataObject[] = [];
    const visited = new Set<number>();
    const visit = (id: number): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const object = index.byId.get(id);
      if (object) result.push(object);
      (index.byParent.get(id) ?? []).forEach((child) => visit(child.id));
    };
    visit(tournamentId);
    index.descendants.set(tournamentId, result);
    return result;
  }

  fullTree(project: CompdataProject): CompObjTreeRow[] {
    return this.index(project).fullTree;
  }

  getPositionsCount(project: CompdataProject, groupId: number): number {
    return project.standings.filter(s => s.groupId === groupId).length;
  }

  getTotalPositionsForPhase(project: CompdataProject, phaseId: number): number {
    const groups = this.groups(project, phaseId);
    const groupIds = new Set(groups.map(g => g.id));
    return project.standings.filter(s => groupIds.has(s.groupId)).length;
  }

  getTotalPositionsForTournament(project: CompdataProject, tournamentId: number): number {
    const objects = this.tournamentObjects(project, tournamentId);
    const groupIds = new Set(objects.filter(o => o.kind === 5).map(o => o.id));
    return project.standings.filter(s => groupIds.has(s.groupId)).length;
  }

  createStandingsForGroup(project: CompdataProject, groupId: number, positionsCount: number): void {
    for (let t = 0; t < positionsCount; t++) {
      project.standings.push({ groupId, position: t });
    }
  }

  updateStandingsForGroup(project: CompdataProject, groupId: number, positionsCount: number): void {
    const currentStandings = project.standings.filter(s => s.groupId === groupId);
    const currentCount = currentStandings.length;
    
    if (positionsCount > currentCount) {
      for (let t = currentCount; t < positionsCount; t++) {
        project.standings.push({ groupId, position: t });
      }
    } else if (positionsCount < currentCount) {
      project.standings = project.standings.filter(s => !(s.groupId === groupId && s.position >= positionsCount));
    }
  }

  removeStandingsForGroup(project: CompdataProject, groupId: number): void {
    project.standings = project.standings.filter(s => s.groupId !== groupId);
  }

  getInitTeams(project: CompdataProject, competitionId: number): import("../../../shared/types").CompdataInitTeam[] {
    return project.initTeams.filter(t => t.competitionId === competitionId).sort((a, b) => a.position - b.position);
  }

  addInitTeam(project: CompdataProject, competitionId: number, position: number, teamId: string): void {
    project.initTeams.push({ competitionId, position, teamId });
  }

  removeInitTeam(project: CompdataProject, competitionId: number, position: number): void {
    project.initTeams = project.initTeams.filter(t => !(t.competitionId === competitionId && t.position === position));
  }

  clearInitTeams(project: CompdataProject, competitionId: number): void {
    project.initTeams = project.initTeams.filter(t => t.competitionId !== competitionId);
  }

  normalizeInitTeamsOrder(project: CompdataProject, competitionId: number): void {
    const teams = this.getInitTeams(project, competitionId);
    teams.forEach((t, i) => {
      t.position = i;
    });
  }

  private index(project: CompdataProject): CompObjIndex {
    const cached = this.indexes.get(project);
    if (cached && cached.objectsReference === project.objects && cached.objectCount === project.objects.length) return cached;

    const byId = new Map<number, CompdataObject>();
    const idCounts = new Map<number, number>();
    const byParent = new Map<number, CompdataObject[]>();
    for (const object of project.objects) {
      if (!byId.has(object.id)) byId.set(object.id, object);
      idCounts.set(object.id, (idCounts.get(object.id) ?? 0) + 1);
      const siblings = byParent.get(object.parentId) ?? [];
      siblings.push(object);
      byParent.set(object.parentId, siblings);
    }

    const fullTree: CompObjTreeRow[] = [];
    const visited = new Set<number>();
    const append = (object: CompdataObject, depth: number): void => {
      if (visited.has(object.id)) return;
      visited.add(object.id);
      fullTree.push({ object, depth });
      (byParent.get(object.id) ?? []).forEach((child) => append(child, depth + 1));
    };
    project.objects.filter((object) => !byId.has(object.parentId)).forEach((root) => append(root, 0));
    project.objects.filter((object) => !visited.has(object.id)).forEach((root) => append(root, 0));

    const created: CompObjIndex = {
      objectsReference: project.objects,
      objectCount: project.objects.length,
      byId,
      idCounts,
      byParent,
      fullTree,
      descendants: new Map<number, CompdataObject[]>()
    };
    this.indexes.set(project, created);
    return created;
  }
}
