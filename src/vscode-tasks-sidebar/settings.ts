import * as vscode from "vscode";

export function isResultGrouped(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get("vscodeTasksSidebar.defaultGrouped", false);
}

export function getWhitelist(): string[] {
  return vscode.workspace
    .getConfiguration()
    .get("vscodeTasksSidebar.includeSources", "")
    .split(",")
    .filter(Boolean);
}

export function getBlacklist(): string[] {
  return vscode.workspace
    .getConfiguration()
    .get("vscodeTasksSidebar.excludeSources", "")
    .split(",")
    .filter(Boolean);
}

export enum TaskSourceFilter {
  All = "all",
  AutoDetected = "autoDetected",
  Workspace = "workspace",
}

export const VSCODE_WORKSPACE_SOURCE = "Workspace";

export function getTaskSourceFilter(): TaskSourceFilter {
  return vscode.workspace
    .getConfiguration()
    .get<TaskSourceFilter>("vscodeTasksSidebar.taskSource", TaskSourceFilter.All);
}
