import * as vscode from "vscode";
import { VscodeGroup } from "./vscodeGroup";

export function getStableTaskId(task: vscode.Task): string {
  const folder = task.scope && typeof task.scope === "object" && "name" in task.scope
    ? task.scope.name
    : "_";
  return `${folder}::${task.source}::${task.name}`;
}

const reGroupName = /^#([^#]+)#\s*(.*)/;
export class VscodeTask extends vscode.TreeItem {
  private _isRunning: boolean;
  private _isPinned: boolean;
  public type: string;
  public readonly stableId: string;

  constructor(
    public readonly task: vscode.Task,
    pinned: boolean = false,
    public readonly parent?: VscodeGroup,
  ) {
    super(task.name, vscode.TreeItemCollapsibleState.None);
    this.stableId = getStableTaskId(task);
    this._isRunning = false;
    this._isPinned = pinned;
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
    this.description = task.source;
    this.type = task.definition.type;
    this.tooltip = task.detail;
    this.contextValue = pinned ? "vscodeTaskPinned" : "vscodeTask";
    this.command = {
      command: "vscodeTasksSidebar.runTask",
      title: "Run this task",
      arguments: [task],
    };

    if (!task.detail) {
      return;
    }

    const matches = reGroupName.exec(task.detail);
    if (!matches) {
      return;
    }

    this.type = matches[1]; // group name
    this.tooltip = matches[2];
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public isPinned(): boolean {
    return this._isPinned;
  }

  public setIsPinned(pinned: boolean) {
    this._isPinned = pinned;
    this.contextValue = pinned ? "vscodeTaskPinned" : "vscodeTask";
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
  }

  public setIsRunning(isRunning: boolean) {
    this._isRunning = isRunning;
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
  }

  private getIconPath() {
    if (this._isRunning) {
      return "terminal";
    }
    return this._isPinned ? "pinned" : "play";
  }
}
