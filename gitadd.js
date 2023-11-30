#!/usr/bin/env bun

import { spawn } from 'bun';

// Function to parse the output of `git status --porcelain`
function parseGitStatus(output) {
  return output.split('\n')
    .filter(line => line && (line.startsWith('??') || line.startsWith(' M')))
    .map(line => line.slice(3));
}

// Function to run a git command and return its output
async function runGitCommand(args) {
  const { stdout, stderr, exitCode } = await spawn(['git', ...args]);

  if (exitCode !== 0) {
    throw new Error(stderr);
  }

  return stdout.trim();
}

// Function to toggle files to stage
async function toggleFiles(files) {
  const toggledFiles = new Set();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Toggle files to stage using the spacebar, then press Enter:\n');

  for (let i = 0; i < files.length; i++) {
    console.log(`[ ] ${files[i]}`);
  }

  rl.on('line', (line) => {
    const index = parseInt(line, 10);
    if (!isNaN(index) && index >= 0 && index < files.length) {
      if (toggledFiles.has(index)) {
        toggledFiles.delete(index);
      } else {
        toggledFiles.add(index);
      }
    }

    console.clear();
    for (let i = 0; i < files.length; i++) {
      console.log(`${toggledFiles.has(i) ? '[x]' : '[ ]'} ${files[i]}`);
    }
  });

  return new Promise((resolve) => {
    rl.on('close', () => {
      resolve(Array.from(toggledFiles).map(index => files[index]));
    });
  });
}

// Main function to check for unstaged files and handle toggling
async function main() {
  try {
    // Check if we are in a git repository
    await runGitCommand(['rev-parse', '--is-inside-work-tree']);

    // Get the list of unstaged files
    const statusOutput = await runGitCommand(['status', '--porcelain']);
    console.log(statusOutput)
    const unstagedFiles = parseGitStatus(statusOutput);

    if (unstagedFiles.length === 0) {
      console.log('There are no unstaged files.');
      return;
    }

    // Ask the user to toggle files to stage
    const filesToStage = await toggleFiles(unstagedFiles);

    // Stage the selected files
    for (const file of filesToStage) {
      await runGitCommand(['add', file]);
    }

    console.log('Selected files have been staged.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
main();
