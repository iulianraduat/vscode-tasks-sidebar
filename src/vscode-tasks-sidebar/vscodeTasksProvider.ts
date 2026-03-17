import * as vscode from "vscode";
import { getBlacklist, getWhitelist, isResultGrouped } from "./settings";
import { VscodeGroup } from "./vscodeGroup";
import { getStableTaskId, VscodeTask } from "./vscodeTask";

const PINNED_TASKS_KEY = "vscodeTasksSidebar.pinnedTasks";

export class VscodeTasksProvider implements vscode.TreeDataProvider<
  VscodeGroup | VscodeTask
> {
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

  private sortAndUpdateTree() {
    if (this.cacheTasksList) {
      sortTasksByTypeLabel(this.cacheTasksList);
      this.rebuildGroups();
      sortTasksByLabel(this.cacheTasksList);
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
      sortTasksByTypeLabel(cacheTasks);

      // Clean up pinned IDs for tasks that no longer exist
      const activePinnedIds = cacheTasks
        .filter((t) => t.isPinned())
        .map((t) => t.stableId);
      this.savePinnedTaskIds(activePinnedIds);

      resolve(cacheTasks);
    });

    this.rebuildGroups();

    if (this.cacheTasksList) {
      sortTasksByLabel(this.cacheTasksList);
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
      const pinnedGroup = new VscodeGroup("Pinned", "pinned");
      pinnedTasks.forEach((t) => pinnedGroup.addTask(t));
      this.cacheTasksGrouped.push(pinnedGroup);
    }

    // Build groups from unpinned tasks (assumes sorted by type)
    let latestCacheGroup: VscodeGroup | undefined;
    unpinnedTasks.forEach((cacheTask) => {
      if (latestCacheGroup === undefined || cacheTask.type !== latestCacheGroup.groupName) {
        latestCacheGroup = new VscodeGroup(cacheTask.type);
        this.cacheTasksGrouped!.push(latestCacheGroup);
      }
      latestCacheGroup.addTask(cacheTask);
    });
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

function sortTasksByTypeLabel(tasks: VscodeTask[]) {
  tasks.sort((a, b) => {
    const pinnedDiff = (b.isPinned() ? 1 : 0) - (a.isPinned() ? 1 : 0);
    if (pinnedDiff !== 0) {
      return pinnedDiff;
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

function sortTasksByLabel(tasks: VscodeTask[]) {
  tasks.sort((a, b) => {
    const pinnedDiff = (b.isPinned() ? 1 : 0) - (a.isPinned() ? 1 : 0);
    if (pinnedDiff !== 0) {
      return pinnedDiff;
    }

    const aLabel: string = a.label?.toString() ?? "";
    const bLabel: string = b.label?.toString() ?? "";
    return aLabel.localeCompare(bLabel);
  });
}
