import * as vscode from 'vscode';
import { VscodeTask } from './vscodeTask';

export class VscodeGroup extends vscode.TreeItem {
  public children: VscodeTask[] = [];

  constructor(public readonly groupName: string, icon: string = 'output') {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    this.id = `group::${groupName}`;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'vscodeGroup';
  }

  public addTask(vscodeTask: VscodeTask) {
    this.children.push(vscodeTask);
  }
}
