import * as vscode from "vscode";
import { getBlacklist, getWhitelist, isResultGrouped } from "./settings";
import { VscodeGroup } from "./vscodeGroup";
import { getStableTaskId, VscodeTask } from "./vscodeTask";

const PINNED_TASKS_KEY = "vscodeTasksSidebar.pinnedTasks";
const TASKS_ORDER_KEY = "vscodeTasksSidebar.tasksOrder";
const GROUPS_ORDER_KEY = "vscodeTasksSidebar.groupsOrder";
const MIME_TYPE = "application/vnd.code.tree.vscodetaskssidebar";

type DragPayload = {
  type: "task" | "group";
  id: string;
};

export class VscodeTasksProvider
  implements
    vscode.TreeDataProvider<VscodeGroup | VscodeTask>,
    vscode.TreeDragAndDropController<VscodeGroup | VscodeTask>
{
  public readonly dropMimeTypes = [MIME_TYPE];
  public readonly dragMimeTypes = [MIME_TYPE];

  private isGrouped: boolean = isResultGrouped();
  private cacheTasksList: VscodeTask[] | undefined;
  private cacheTasksGrouped: VscodeGroup[] | undefined;
  private globalState: vscode.Memento | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<VscodeTask | undefined> =
    new vscode.EventEmitter<VscodeTask | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<VscodeTask | undefined> =
    this._onDidChangeTreeData.event;

  constructor(globalState?: vscode.Memento) {
    this.globalState = globalState;
    this.refresh();
  }

  private getPinnedTaskIds(): string[] {
    return this.globalState?.get<string[]>(PINNED_TASKS_KEY, []) ?? [];
  }

  private savePinnedTaskIds(ids: string[]) {
    this.globalState?.update(PINNED_TASKS_KEY, ids);
  }

  private getTasksOrder(): string[] {
    return this.globalState?.get<string[]>(TASKS_ORDER_KEY, []) ?? [];
  }

  private saveTasksOrder(ids: string[]) {
    this.globalState?.update(TASKS_ORDER_KEY, ids);
  }

  private getGroupsOrder(): string[] {
    return this.globalState?.get<string[]>(GROUPS_ORDER_KEY, []) ?? [];
  }

  private saveGroupsOrder(names: string[]) {
    this.globalState?.update(GROUPS_ORDER_KEY, names);
  }

  public pinTask(vscodeTask: VscodeTask) {
    const pinnedIds = this.getPinnedTaskIds();
    if (!pinnedIds.includes(vscodeTask.stableId)) {
      pinnedIds.push(vscodeTask.stableId);
      this.savePinnedTaskIds(pinnedIds);
    }
    vscodeTask.setIsPinned(true);
    this.sortAndUpdateTree();
  }

  public unpinTask(vscodeTask: VscodeTask) {
    const pinnedIds = this.getPinnedTaskIds().filter(
      (id) => id !== vscodeTask.stableId,
    );
    this.savePinnedTaskIds(pinnedIds);
    vscodeTask.setIsPinned(false);
    this.sortAndUpdateTree();
  }

  public handleDrag(
    source: readonly (VscodeGroup | VscodeTask)[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): void {
    const item = source[0];
    let payload: DragPayload;

    if (item instanceof VscodeTask) {
      payload = { type: "task", id: item.stableId };
    } else if (item instanceof VscodeGroup) {
      payload = { type: "group", id: item.groupName };
    } else {
      return;
    }

    dataTransfer.set(
      MIME_TYPE,
      new vscode.DataTransferItem(JSON.stringify(payload)),
    );
  }

  public handleDrop(
    target: VscodeGroup | VscodeTask | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): void {
    const raw = dataTransfer.get(MIME_TYPE)?.value;
    if (!raw) {
      return;
    }

    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.type === "group" && this.isGrouped) {
      this.handleGroupDrop(payload.id, target);
    } else if (payload.type === "task") {
      if (this.isGrouped) {
        this.handleTaskDropInGroup(payload.id, target);
      } else {
        this.handleTaskDropInList(payload.id, target);
      }
    }
  }

  private handleGroupDrop(
    draggedGroupName: string,
    target: VscodeGroup | VscodeTask | undefined,
  ): void {
    if (!this.cacheTasksGrouped) {
      return;
    }

    let targetGroupName: string | undefined;
    if (target instanceof VscodeGroup) {
      targetGroupName = target.groupName;
    } else if (target instanceof VscodeTask) {
      // Find which group this task belongs to
      const group = this.cacheTasksGrouped.find((g) =>
        g.children.some((t) => t.stableId === target.stableId),
      );
      targetGroupName = group?.groupName;
    }

    if (!targetGroupName || draggedGroupName === targetGroupName) {
      return;
    }

    const groupNames = this.cacheTasksGrouped.map((g) => g.groupName);
    const draggedIndex = groupNames.indexOf(draggedGroupName);
    const originalTargetIndex = groupNames.indexOf(targetGroupName);
    if (draggedIndex === -1 || originalTargetIndex === -1) {
      return;
    }

    const movingDown = draggedIndex < originalTargetIndex;
    groupNames.splice(draggedIndex, 1);
    const targetIndex = groupNames.indexOf(targetGroupName);
    groupNames.splice(
      movingDown ? targetIndex + 1 : targetIndex,
      0,
      draggedGroupName,
    );

    this.saveGroupsOrder(groupNames);
    this.sortAndUpdateTree();
  }

  private handleTaskDropInList(
    draggedId: string,
    target: VscodeGroup | VscodeTask | undefined,
  ): void {
    if (!this.cacheTasksList || !(target instanceof VscodeTask)) {
      return;
    }

    const targetId = target.stableId;
    if (draggedId === targetId) {
      return;
    }

    // Build current order from the list
    const currentOrder = this.cacheTasksList.map((t) => t.stableId);
    const draggedIndex = currentOrder.indexOf(draggedId);
    const originalTargetIndex = currentOrder.indexOf(targetId);
    if (draggedIndex === -1 || originalTargetIndex === -1) {
      return;
    }

    const movingDown = draggedIndex < originalTargetIndex;

    // If both are pinned, reorder within pinned list
    const draggedTask = this.cacheTasksList[draggedIndex];
    const targetTask = this.cacheTasksList[originalTargetIndex];

    if (draggedTask.isPinned() && targetTask.isPinned()) {
      const pinnedIds = this.getPinnedTaskIds();
      const pDragIdx = pinnedIds.indexOf(draggedId);
      const pOrigTargetIdx = pinnedIds.indexOf(targetId);
      if (pDragIdx === -1 || pOrigTargetIdx === -1) {
        return;
      }
      const pMovingDown = pDragIdx < pOrigTargetIdx;
      pinnedIds.splice(pDragIdx, 1);
      const pTargetIdx = pinnedIds.indexOf(targetId);
      pinnedIds.splice(pMovingDown ? pTargetIdx + 1 : pTargetIdx, 0, draggedId);
      this.savePinnedTaskIds(pinnedIds);
    } else {
      // Reorder in the full task list
      currentOrder.splice(draggedIndex, 1);
      const newTargetIndex = currentOrder.indexOf(targetId);
      currentOrder.splice(
        movingDown ? newTargetIndex + 1 : newTargetIndex,
        0,
        draggedId,
      );
      this.saveTasksOrder(currentOrder);
    }

    this.sortAndUpdateTree();
  }

  private handleTaskDropInGroup(
    draggedId: string,
    target: VscodeGroup | VscodeTask | undefined,
  ): void {
    if (!this.cacheTasksGrouped) {
      return;
    }

    // Find the group containing the dragged task
    const draggedGroup = this.cacheTasksGrouped.find((g) =>
      g.children.some((t) => t.stableId === draggedId),
    );
    if (!draggedGroup) {
      return;
    }

    // Determine target within the same group
    let targetId: string | undefined;
    if (target instanceof VscodeTask) {
      // Ensure target is in the same group
      if (!draggedGroup.children.some((t) => t.stableId === target.stableId)) {
        return;
      }
      targetId = target.stableId;
    } else if (
      target instanceof VscodeGroup &&
      target.groupName === draggedGroup.groupName
    ) {
      targetId = undefined; // drop at end
    } else {
      return;
    }

    if (draggedId === targetId) {
      return;
    }

    // For the Pinned group, reorder in pinnedIds
    if (draggedGroup.groupName === "Pinned") {
      const pinnedIds = this.getPinnedTaskIds();
      const draggedIndex = pinnedIds.indexOf(draggedId);
      if (draggedIndex === -1) {
        return;
      }

      if (targetId === undefined) {
        pinnedIds.splice(draggedIndex, 1);
        pinnedIds.push(draggedId);
      } else {
        const originalTargetIndex = pinnedIds.indexOf(targetId);
        const movingDown = draggedIndex < originalTargetIndex;
        pinnedIds.splice(draggedIndex, 1);
        const targetIndex = pinnedIds.indexOf(targetId);
        pinnedIds.splice(
          movingDown ? targetIndex + 1 : targetIndex,
          0,
          draggedId,
        );
      }
      this.savePinnedTaskIds(pinnedIds);
    } else {
      // For other groups, reorder in the tasks order
      const groupTaskIds = draggedGroup.children.map((t) => t.stableId);
      const draggedIndex = groupTaskIds.indexOf(draggedId);
      if (draggedIndex === -1) {
        return;
      }

      if (targetId === undefined) {
        groupTaskIds.splice(draggedIndex, 1);
        groupTaskIds.push(draggedId);
      } else {
        const originalTargetIndex = groupTaskIds.indexOf(targetId);
        const movingDown = draggedIndex < originalTargetIndex;
        groupTaskIds.splice(draggedIndex, 1);
        const targetIndex = groupTaskIds.indexOf(targetId);
        groupTaskIds.splice(
          movingDown ? targetIndex + 1 : targetIndex,
          0,
          draggedId,
        );
      }

      // Merge into full tasks order
      const fullOrder = this.getTasksOrder();
      // Remove old entries for this group's tasks
      const filtered = fullOrder.filter((id) => !groupTaskIds.includes(id));
      // Find where to insert (before the first task of the next group, or at end)
      const allTaskIds = this.cacheTasksList?.map((t) => t.stableId) ?? [];
      const firstInGroup = groupTaskIds[0];
      const insertAt = allTaskIds.indexOf(firstInGroup);
      filtered.splice(
        insertAt >= 0 ? insertAt : filtered.length,
        0,
        ...groupTaskIds,
      );
      this.saveTasksOrder(filtered);
    }

    this.sortAndUpdateTree();
  }

  private sortAndUpdateTree() {
    if (this.cacheTasksList) {
      const pinnedIds = this.getPinnedTaskIds();
      const tasksOrder = this.getTasksOrder();
      sortTasksByTypeLabel(this.cacheTasksList, pinnedIds, tasksOrder);
      this.rebuildGroups();
      sortTasksByLabel(this.cacheTasksList, pinnedIds, tasksOrder);
    }
    this.updateTree();
  }

  public async refresh() {
    this.cacheTasksList = await new Promise(async (resolve) => {
      const tasks = await vscode.tasks.fetchTasks();
      if (tasks.length === 0) {
        resolve([]);
        return;
      }

      const whitelist = getWhitelist();
      const blacklist = getBlacklist();

      const pinnedIds = this.getPinnedTaskIds();

      const cacheTasks: VscodeTask[] = [];
      for (const task of tasks) {
        // we allow only what is in whitelist or every task
        if (whitelist.length && !whitelist.includes(task.source)) {
          continue;
        }

        // we disallow what is in blacklist or none
        if (blacklist.length && blacklist.includes(task.source)) {
          continue;
        }

        const isPinned = pinnedIds.includes(getStableTaskId(task));
        cacheTasks.push(new VscodeTask(task, isPinned));
      }
      sortTasksByTypeLabel(cacheTasks, pinnedIds, this.getTasksOrder());

      // Clean up pinned IDs for tasks that no longer exist
      const activePinnedIds = cacheTasks
        .filter((t) => t.isPinned())
        .map((t) => t.stableId);
      this.savePinnedTaskIds(activePinnedIds);

      resolve(cacheTasks);
    });

    this.rebuildGroups();

    if (this.cacheTasksList) {
      sortTasksByLabel(
        this.cacheTasksList,
        this.getPinnedTaskIds(),
        this.getTasksOrder(),
      );
    }

    this.updateTree();
  }

  private rebuildGroups() {
    this.cacheTasksGrouped = undefined;
    if (!this.cacheTasksList || this.cacheTasksList.length === 0) {
      return;
    }

    this.cacheTasksGrouped = [];

    // Separate pinned tasks into a dedicated group at the top
    const pinnedTasks = this.cacheTasksList.filter((t) => t.isPinned());
    const unpinnedTasks = this.cacheTasksList.filter((t) => !t.isPinned());

    if (pinnedTasks.length > 0) {
      const pinnedIds = this.getPinnedTaskIds();
      pinnedTasks.sort((a, b) => {
        const aIndex = pinnedIds.indexOf(a.stableId);
        const bIndex = pinnedIds.indexOf(b.stableId);
        return aIndex - bIndex;
      });

      const pinnedGroup = new VscodeGroup("Pinned", "pinned");
      pinnedTasks.forEach((t) => pinnedGroup.addTask(t));
      this.cacheTasksGrouped.push(pinnedGroup);
    }

    // Build groups from unpinned tasks (assumes sorted by type)
    const groupMap = new Map<string, VscodeGroup>();
    unpinnedTasks.forEach((cacheTask) => {
      let group = groupMap.get(cacheTask.type);
      if (!group) {
        group = new VscodeGroup(cacheTask.type);
        groupMap.set(cacheTask.type, group);
      }
      group.addTask(cacheTask);
    });

    // Apply custom group order
    const groupsOrder = this.getGroupsOrder();
    const tasksOrder = this.getTasksOrder();
    const sortedGroups = Array.from(groupMap.values());
    sortedGroups.sort((a, b) => {
      const aIdx = groupsOrder.indexOf(a.groupName);
      const bIdx = groupsOrder.indexOf(b.groupName);
      if (aIdx !== -1 && bIdx !== -1) {
        return aIdx - bIdx;
      }
      if (aIdx !== -1) {
        return -1;
      }
      if (bIdx !== -1) {
        return 1;
      }
      return a.groupName.localeCompare(b.groupName);
    });

    // Apply custom task order within each group
    if (tasksOrder.length > 0) {
      sortedGroups.forEach((group) => {
        group.children.sort((a, b) => {
          const aIdx = tasksOrder.indexOf(a.stableId);
          const bIdx = tasksOrder.indexOf(b.stableId);
          if (aIdx !== -1 && bIdx !== -1) {
            return aIdx - bIdx;
          }
          if (aIdx !== -1) {
            return -1;
          }
          if (bIdx !== -1) {
            return 1;
          }
          const aLabel = a.label?.toString() ?? "";
          const bLabel = b.label?.toString() ?? "";
          return aLabel.localeCompare(bLabel);
        });
      });
    }

    this.cacheTasksGrouped.push(...sortedGroups);
  }

  public updateTree() {
    this._onDidChangeTreeData.fire(undefined);
  }

  public runTask(task: vscode.Task) {
    const vscodeTask = this.findVscodeTask(task);
    if (vscodeTask?.isRunning()) {
      this.stopTask(task);
      return;
    }

    vscode.tasks.executeTask(task);
  }

  public stopTask(task: vscode.Task) {
    const runningTask = vscode.tasks.taskExecutions.find(
      (e) =>
        e.task.name === task.name &&
        e.task.definition.type === task.definition.type,
    );
    if (runningTask !== undefined) {
      runningTask.terminate();
    }
  }

  public findVscodeTask(task: vscode.Task): VscodeTask | undefined {
    return this.cacheTasksList?.find(
      (cachedTask) => cachedTask.task.name === task.name,
    );
  }

  viewAsGroups() {
    this.isGrouped = true;
    this._onDidChangeTreeData.fire(undefined);
  }

  viewAsList() {
    this.isGrouped = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VscodeTask): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: VscodeGroup | VscodeTask,
  ): Thenable<Array<VscodeGroup | VscodeTask>> {
    if (element) {
      return Promise.resolve("children" in element ? element.children : []);
    }

    return Promise.resolve(this.getCacheTasks() ?? []);
  }

  private getCacheTasks() {
    return this.isGrouped ? this.cacheTasksGrouped : this.cacheTasksList;
  }

  getParent?(element: VscodeGroup | VscodeTask): VscodeGroup | undefined {
    return "parent" in element ? element.parent : undefined;
  }

  resolveTreeItem?(
    item: vscode.TreeItem,
    _element: VscodeTask,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.TreeItem> {
    return item;
  }
}

function sortTasksByTypeLabel(
  tasks: VscodeTask[],
  pinnedIds: string[],
  tasksOrder: string[],
) {
  tasks.sort((a, b) => {
    const aPinned = a.isPinned();
    const bPinned = b.isPinned();
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }
    if (aPinned && bPinned) {
      return pinnedIds.indexOf(a.stableId) - pinnedIds.indexOf(b.stableId);
    }

    // Use custom order if both have one
    const aOrder = tasksOrder.indexOf(a.stableId);
    const bOrder = tasksOrder.indexOf(b.stableId);
    if (aOrder !== -1 && bOrder !== -1) {
      return aOrder - bOrder;
    }

    const cmpType = a.type.localeCompare(b.type);
    if (cmpType !== 0) {
      return cmpType;
    }

    const aLabel: string = a.label?.toString() ?? "";
    const bLabel: string = b.label?.toString() ?? "";
    return aLabel.localeCompare(bLabel);
  });
}

function sortTasksByLabel(
  tasks: VscodeTask[],
  pinnedIds: string[],
  tasksOrder: string[],
) {
  tasks.sort((a, b) => {
    const aPinned = a.isPinned();
    const bPinned = b.isPinned();
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }
    if (aPinned && bPinned) {
      return pinnedIds.indexOf(a.stableId) - pinnedIds.indexOf(b.stableId);
    }

    // Use custom order if both have one
    const aOrder = tasksOrder.indexOf(a.stableId);
    const bOrder = tasksOrder.indexOf(b.stableId);
    if (aOrder !== -1 && bOrder !== -1) {
      return aOrder - bOrder;
    }

    const aLabel: string = a.label?.toString() ?? "";
    const bLabel: string = b.label?.toString() ?? "";
    return aLabel.localeCompare(bLabel);
  });
}
