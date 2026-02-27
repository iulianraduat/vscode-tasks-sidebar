import * as vscode from 'vscode';

export function isResultGrouped(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get('vscodeTasksSidebar.defaultGrouped', false);
}

export function getExcludedSources(): string[] {
  return vscode.workspace
    .getConfiguration()
    .get<string[]>('vscodeTasksSidebar.excludeSources', []);
}
