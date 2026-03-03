#!/usr/bin/env node

import {
  createMemoryWorkflow,
  parseArg,
  parseNumberArg,
  readJsonInput,
  printJson
} from './memory-workflow-cli-utils.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const jsonInput = await readJsonInput(argv);
  const { workflow } = createMemoryWorkflow();

  const input = {
    ...jsonInput,
    query: parseArg(argv, 'query') || jsonInput.query,
    task: parseArg(argv, 'task') || jsonInput.task,
    root_path: parseArg(argv, 'root-path') || jsonInput.root_path || jsonInput.rootPath,
    project_path: parseArg(argv, 'project-path') || jsonInput.project_path || jsonInput.projectPath,
    branch_name: parseArg(argv, 'branch-name') || jsonInput.branch_name || jsonInput.branchName,
    topic: parseArg(argv, 'topic') || jsonInput.topic,
    feature: parseArg(argv, 'feature') || jsonInput.feature,
    kind: parseArg(argv, 'kind') || jsonInput.kind,
    limit: parseNumberArg(argv, 'limit', jsonInput.limit)
  };

  const result = await workflow.getTaskContext(input);
  printJson(result);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});
