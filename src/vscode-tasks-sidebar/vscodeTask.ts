import * as vscode from 'vscode';
import { VscodeGroup } from './vscodeGroup';
import { v4 as uuidv4 } from 'uuid';

export class VscodeTask extends vscode.TreeItem {
  private _isRunning: boolean;
  public type: string;

  constructor(
    public readonly task: vscode.Task,
    public readonly parent?: VscodeGroup
  ) {
    super(task.name, vscode.TreeItemCollapsibleState.None);
    this.id = uuidv4();
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
    this.description = task.definition.type;
    this.type = task.definition.type;
    this.tooltip = task.detail;
    this.contextValue = 'vscodeTask';
    this._isRunning = false;
    this.command = {
      command: 'vscodeTasksSidebar.runTask',
      title: 'Run this task',
      arguments: [task],
    };
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public setIsRunning(isRunning: boolean) {
    this._isRunning = isRunning;
    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
  }

  private getIconPath() {
    return this._isRunning ? 'terminal' : 'play';
  }
}
