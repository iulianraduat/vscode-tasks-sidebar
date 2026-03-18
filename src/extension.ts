import * as vscode from "vscode";
import { isResultGrouped } from "./vscode-tasks-sidebar/settings";
import { VscodeTask } from "./vscode-tasks-sidebar/vscodeTask";
import { VscodeTasksProvider } from "./vscode-tasks-sidebar/vscodeTasksProvider";

// find-unused-exports:ignore-next-line-exports
export function activate(context: vscode.ExtensionContext) {
  const vscodeTasksProvider = new VscodeTasksProvider(context.globalState);
  const treeView = vscode.window.createTreeView("vscodeTasksSidebar", {
    treeDataProvider: vscodeTasksProvider,
    dragAndDropController: vscodeTasksProvider,
  });
  context.subscriptions.push(treeView);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      // Check if the change affected my extension's settings
      if (event.affectsConfiguration("vscodeTasksSidebar")) {
        vscodeTasksProvider.refresh();
      }
    }),
  );

  let disposable: vscode.Disposable;

  disposable = vscode.commands.registerCommand(
    "vscodeTasksSidebar.runTask",
    (task: vscode.Task) => {
      vscodeTasksProvider.runTask(task);
    },
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    "vscodeTasksSidebar.refresh",
    () => vscodeTasksProvider.refresh(),
  );
  context.subscriptions.push(disposable);

  const setIsGroupedContext = (isGrouped: boolean) => {
    vscode.commands.executeCommand("setContext", "isGrouped", isGrouped);
  };
  setIsGroupedContext(isResultGrouped());

  context.subscriptions.push(
    vscode.commands.registerCommand("vscodeTasksSidebar.viewAsGroups", () => {
      setIsGroupedContext(true);
      vscodeTasksProvider.viewAsGroups();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscodeTasksSidebar.viewAsList", () => {
      setIsGroupedContext(false);
      vscodeTasksProvider.viewAsList();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscodeTasksSidebar.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:iulian-radu-at.vscode-tasks-sidebar",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscodeTasksSidebar.pinTask",
      (vscodeTask: VscodeTask) => {
        vscodeTasksProvider.pinTask(vscodeTask);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscodeTasksSidebar.unpinTask",
      (vscodeTask: VscodeTask) => {
        vscodeTasksProvider.unpinTask(vscodeTask);
      },
    ),
  );

  vscode.tasks.onDidStartTask((e) => {
    const vscodeTask = vscodeTasksProvider.findVscodeTask(e.execution.task);
    if (vscodeTask) {
      vscodeTask.setIsRunning(true);
      vscodeTasksProvider.updateTree();
    }
  });

  vscode.tasks.onDidEndTask((e) => {
    const vscodeTask = vscodeTasksProvider.findVscodeTask(e.execution.task);
    if (vscodeTask) {
      vscodeTask.setIsRunning(false);
      vscodeTasksProvider.updateTree();
    }
  });

  // Retry after a delay to catch late-loading task providers
  setTimeout(() => vscodeTasksProvider.refresh(), 2000);
}

export function deactivate() {}
