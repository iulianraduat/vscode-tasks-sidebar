import * as vscode from 'vscode';
import { isResultGrouped } from './settings';
import { VscodeGroup } from './vscodeGroup';
import { VscodeTask } from './vscodeTask';

export class VscodeTasksProvider
  implements vscode.TreeDataProvider<VscodeGroup | VscodeTask>
{
  private isGrouped: boolean = isResultGrouped();
  private cacheTasksList: VscodeTask[] | undefined;
  private cacheTasksGrouped: VscodeGroup[] | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<VscodeTask | undefined> =
    new vscode.EventEmitter<VscodeTask | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<VscodeTask | undefined> =
    this._onDidChangeTreeData.event;

  constructor() {
    this.refresh();
  }

  public async refresh() {
    this.cacheTasksList = await new Promise(async (resolve) => {
      const tasks = await vscode.tasks.fetchTasks();
      if (tasks.length === 0) {
        resolve([]);
        return;
      }

      const cacheTasks: VscodeTask[] = [];
      for (const task of tasks) {
        cacheTasks.push(new VscodeTask(task));
      }
      sortTasksByTypeLabel(cacheTasks);
      resolve(cacheTasks);
    });

    // The following code assume that the tasks are sorted by type (= group name)
    let latestCacheGroup: VscodeGroup | undefined;
    this.cacheTasksGrouped = undefined;
    this.cacheTasksList?.forEach((cacheTask) => {
      if (this.cacheTasksGrouped === undefined) {
        this.cacheTasksGrouped = [];
      }

      if (latestCacheGroup === undefined) {
        const group = new VscodeGroup(cacheTask.type);
        group.addTask(cacheTask);
        this.cacheTasksGrouped = [group];
        latestCacheGroup = group;
        return;
      }

      if (cacheTask.type !== latestCacheGroup.groupName) {
        latestCacheGroup = new VscodeGroup(cacheTask.type);
        this.cacheTasksGrouped.push(latestCacheGroup);
      }

      latestCacheGroup.addTask(cacheTask);
    });

    if (this.cacheTasksList) {
      sortTasksByLabel(this.cacheTasksList);
    }

    this.updateTree();
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
        e.task.definition.type === task.definition.type
    );
    if (runningTask !== undefined) {
      runningTask.terminate();
    }
  }

  public findVscodeTask(task: vscode.Task): VscodeTask | undefined {
    return this.cacheTasksList?.find(
      (cachedTask) => cachedTask.task.name === task.name
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
    element?: VscodeGroup | VscodeTask
  ): Thenable<Array<VscodeGroup | VscodeTask>> {
    if (element) {
      return Promise.resolve('children' in element ? element.children : []);
    }

    return Promise.resolve(this.getCacheTasks() ?? []);
  }

  private getCacheTasks() {
    return this.isGrouped ? this.cacheTasksGrouped : this.cacheTasksList;
  }

  getParent?(element: VscodeGroup | VscodeTask): VscodeGroup | undefined {
    return 'parent' in element ? element.parent : undefined;
  }

  resolveTreeItem?(
    item: vscode.TreeItem,
    element: VscodeTask,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem> {
    return item;
  }
}

function sortTasksByTypeLabel(tasks: VscodeTask[]) {
  tasks.sort((a, b) => {
    const cmpType = a.type.localeCompare(b.type);
    if (cmpType !== 0) {
      return cmpType;
    }

    const aLabel: string = a.label?.toString() ?? '';
    const bLabel: string = b.label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  });
}

function sortTasksByLabel(tasks: VscodeTask[]) {
  tasks.sort((a, b) => {
    const aLabel: string = a.label?.toString() ?? '';
    const bLabel: string = b.label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  });
}
