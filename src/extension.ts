import * as vscode from 'vscode';
import { VscodeTasksProvider } from './vscode-tasks-sidebar/vscodeTasksProvider';

// find-unused-exports:ignore-next-line-exports
export function activate(context: vscode.ExtensionContext) {
  const vscodeTasksProvider = new VscodeTasksProvider();
  vscode.window.registerTreeDataProvider(
    'vscodeTasksSidebar',
    vscodeTasksProvider
  );

  let disposable: vscode.Disposable;

  disposable = vscode.commands.registerCommand(
    'vscodeTasksSidebar.runTask',
    (task: vscode.Task) => {
      vscodeTasksProvider.runTask(task);
    }
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'vscodeTasksSidebar.refresh',
    () => vscodeTasksProvider.refresh()
  );
  context.subscriptions.push(disposable);

  const setIsGroupedContext = (isGrouped: boolean) => {
    vscode.commands.executeCommand('setContext', 'isGrouped', isGrouped);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeTasksSidebar.viewAsGroups', () => {
      setIsGroupedContext(true);
      vscodeTasksProvider.viewAsGroups();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeTasksSidebar.viewAsList', () => {
      setIsGroupedContext(false);
      vscodeTasksProvider.viewAsList();
    })
  );

  setIsGroupedContext(false);

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
