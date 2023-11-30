#!/usr/bin/env bun

import { spawn } from 'bun';
import inquirer from 'inquirer';
import kleur from 'kleur';
import process from 'process';

async function runGitCommand(args) {
  const proc = spawn(['git', ...args]);
  const output = await new Response(proc.stdout).text();
  return output;
}

async function outputGitCommand(args) {
  const proc = spawn(['git', ...args]);
  const output = await new Response(proc.stdout);
  return output;
}

function parseGitStatus(output) {
  return output.split('\n')
    .filter(line => line)
    .map(line => {
      const rawStatus = line.substr(0, 2);
      const filename = line.substr(3);
      let stagingStatus = 'unstaged';
      let gitStatus = '';
      // Parse the raw status
      switch (rawStatus) {
        case 'M ':
        case 'A ':
        case 'D ':
        case 'R ':
        case 'C ':
          stagingStatus = 'staged'; // Staged changes
          break;
        case ' M':
        case 'MM':
          case 'AM':
            case 'RM':
          gitStatus = 'modified';
          stagingStatus = 'unstaged'; // Unstaged changes or untracked files
          break;
        case '??':
        case '!!':
          gitStatus = 'untracked';
          stagingStatus = 'unstaged'; // Unstaged changes or untracked files
          break;
        case 'UU':
          stagingStatus = 'unmerged'; // Unmerged changes due to conflicts
          break;
        default:
          stagingStatus = 'other'; // Other statuses not specifically accounted for
          break;
      }
      // console.log(`[${rawStatus}] ${filename} => ${status}`)

      // Apply color-coding
      let displayStatus = `[${rawStatus}]`;
      if (stagingStatus === 'staged') {
        displayStatus = kleur.green(displayStatus);
      } else if (stagingStatus === 'unstaged') {
        displayStatus = kleur.red(displayStatus);
      }

      return {
        filename,
        displayStatus,
        rawStatus,
        status: stagingStatus,
        gitStatus: gitStatus,
        selected: stagingStatus == 'staged'
      };
    });
}

async function toggleFiles(files) {
  let choices = files.map(file => ({
    name: ` ${file.displayStatus} ${file.filename} (${file.status})`,
    value: file.filename,
    checked: file.selected
  }));

  const prompt = inquirer.createPromptModule();
  const answers = await prompt([{
    type: 'checkbox',
    name: 'filesToToggle',
    message: 'Select for staging:',
    choices,
    loop: false
  }]);

  const output = files.map(file => ({
    ...file,
    selected: answers.filesToToggle.includes(file.filename)
  }));
  // console.log(output);
  return output;
}

async function main() {
  // if process has argv we forward everything to git

  try {
    const isGit = await runGitCommand(['rev-parse', '--is-inside-work-tree']);
    if (isGit.trim() !== 'true') {
      console.log('❌ This is not a git repository.');
      return;
    }
    const statusOutput = await runGitCommand(['status', '--porcelain']);
    const filesWithStatus = parseGitStatus(statusOutput);

    if (filesWithStatus.length === 0) {
      console.log('✅ There are no files to stage or unstage.');
      return;
    }
    const filesToToggle = await toggleFiles(filesWithStatus);

  for (const file of filesToToggle) {
    if (file.selected && file.status !== 'staged') {
      await runGitCommand(['add', file.filename]);
    } else if (!file.selected) {
      await runGitCommand(['restore', '--staged', file.filename]);
    }
  }
  // process.await outputGitCommand(["status"]);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();