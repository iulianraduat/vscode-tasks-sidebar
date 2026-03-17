import * as vscode from "vscode";
import { MakefileTaskProvider } from "./vscode-tasks-sidebar/makefileTaskProvider";
import { isResultGrouped } from "./vscode-tasks-sidebar/settings";
import { VscodeTasksProvider } from "./vscode-tasks-sidebar/vscodeTasksProvider";

// find-unused-exports:ignore-next-line-exports
export function activate(context: vscode.ExtensionContext) {
  const vscodeTasksProvider = new VscodeTasksProvider();
  vscode.window.registerTreeDataProvider(
    "vscodeTasksSidebar",
    vscodeTasksProvider,
  );

  // Register Makefile task provider
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(
      MakefileTaskProvider.type,
      new MakefileTaskProvider(),
    ),
  );

  // Watch for Makefile changes to auto-refresh
  const makefileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/Makefile",
  );
  makefileWatcher.onDidChange(() => vscodeTasksProvider.refresh());
  makefileWatcher.onDidCreate(() => vscodeTasksProvider.refresh());
  makefileWatcher.onDidDelete(() => vscodeTasksProvider.refresh());
  context.subscriptions.push(makefileWatcher);

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
}

export function deactivate() {}
