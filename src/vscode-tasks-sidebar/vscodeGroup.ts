import * as vscode from 'vscode';
import { VscodeTask } from './vscodeTask';

export class VscodeGroup extends vscode.TreeItem {
  public children: VscodeTask[] = [];

  constructor(public readonly groupName: string) {
    super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    this.id = groupName;
    this.iconPath = new vscode.ThemeIcon('output');
    this.contextValue = 'vscodeGroup';
  }

  public addTask(vscodeTask: VscodeTask) {
    this.children.push(vscodeTask);
  }
}
