import * as vscode from "vscode";

const MAKEFILE_TASK_TYPE = "makefile";

const reTarget = /^([a-zA-Z0-9][a-zA-Z0-9_\-./]*)(?:\s*):/;
const reSpecialTarget = /^\./;
const reAssignment = /^[a-zA-Z_][a-zA-Z0-9_]*\s*(?:::|[:?+!])?=/;
const reDirective =
  /^\s*(?:ifeq|ifneq|ifdef|ifndef|else|endif|include|-include|sinclude|define|endef|export|unexport|override|vpath)\b/;

interface MakefileTaskDefinition extends vscode.TaskDefinition {
  target: string;
}

export class MakefileTaskProvider implements vscode.TaskProvider {
  public static readonly type = MAKEFILE_TASK_TYPE;

  async provideTasks(): Promise<vscode.Task[]> {
    const tasks: vscode.Task[] = [];
    const makefiles = await vscode.workspace.findFiles(
      "**/Makefile",
      "**/node_modules/**",
    );

    for (const makefileUri of makefiles) {
      const targets = await this.parseMakefileTargets(makefileUri);
      const folder = vscode.workspace.getWorkspaceFolder(makefileUri);
      if (!folder) {
        continue;
      }

      for (const target of targets) {
        const task = this.createTask(target, folder, makefileUri);
        tasks.push(task);
      }
    }

    return tasks;
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as MakefileTaskDefinition;
    if (!definition.target) {
      return undefined;
    }

    const folder = task.scope as vscode.WorkspaceFolder;
    return this.createTask(definition.target, folder);
  }

  private createTask(
    target: string,
    folder: vscode.WorkspaceFolder,
    makefileUri?: vscode.Uri,
  ): vscode.Task {
    const definition: MakefileTaskDefinition = {
      type: MAKEFILE_TASK_TYPE,
      target,
    };

    const cwd = makefileUri
      ? vscode.Uri.joinPath(makefileUri, "..").fsPath
      : folder.uri.fsPath;

    const execution = new vscode.ShellExecution(`make`, [target], { cwd });

    const task = new vscode.Task(
      definition,
      folder,
      target,
      MAKEFILE_TASK_TYPE,
      execution,
    );

    task.group = vscode.TaskGroup.Build;
    task.detail = `make ${target}`;

    return task;
  }

  private async parseMakefileTargets(
    makefileUri: vscode.Uri,
  ): Promise<string[]> {
    const content = await vscode.workspace.fs.readFile(makefileUri);
    const text = Buffer.from(content).toString("utf-8");
    const lines = text.split("\n");

    const targets: string[] = [];
    for (const line of lines) {
      if (line.startsWith("\t") || line.startsWith("#")) {
        continue;
      }

      if (reAssignment.test(line)) {
        continue;
      }

      if (reDirective.test(line)) {
        continue;
      }

      const match = reTarget.exec(line);
      if (!match) {
        continue;
      }

      const target = match[1];

      if (reSpecialTarget.test(target)) {
        continue;
      }

      if (!targets.includes(target)) {
        targets.push(target);
      }
    }

    return targets;
  }
}
