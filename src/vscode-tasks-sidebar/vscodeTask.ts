import * as vscode from "vscode";
import { VscodeGroup } from "./vscodeGroup";
import { v4 as uuidv4 } from "uuid";

const reGroupName = /^#([^#]+)#\s*(.*)/;
export class VscodeTask extends vscode.TreeItem {
  private _isRunning: boolean;
  public type: string;

  constructor(
    public readonly task: vscode.Task,
    public readonly parent?: VscodeGroup,
  ) {
    super(task.name, vscode.TreeItemCollapsibleState.None);
    this.id = uuidv4();
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
    this.description = task.source;
    this.type = task.definition.type;
    this.tooltip = task.detail;
    this.contextValue = "vscodeTask";
    this._isRunning = false;
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

  public setIsRunning(isRunning: boolean) {
    this._isRunning = isRunning;
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
  }

  private getIconPath() {
    return this._isRunning ? "terminal" : "play";
  }
}
