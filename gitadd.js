#!/usr/bin/env bun

import { spawn } from "bun";
import inquirer from "inquirer";
import kleur from "kleur";

async function runGitCommand(args) {
	const proc = spawn(["git", ...args]);
	const output = await new Response(proc.stdout).text();
	return output;
}

async function outputGitCommand(args) {
	const proc = spawn(["git", ...args], {
		stdout: "inherit",
	});
}

function parseGitStatus(output) {
  return output.split('\n')
    .filter(line => line)
    .map(line => {
      const rawStatus = line.substr(0, 2);
      const filename = line.substr(3);
      let stagingStatus = rawStatus[0] === ' ' || rawStatus[0] === '?' ? 'unstaged' : 'staged';
      let gitStatus = null;

      function getStatus(index) {
        switch (rawStatus[index]) {
          case 'M': gitStatus = 'modified'; break;
          case 'D': gitStatus = 'deleted'; break;
          case 'A': gitStatus = 'added'; break;
          case 'R': gitStatus = 'renamed'; break;
          case 'C': gitStatus = 'copied'; break;
          case '?': gitStatus = 'untracked'; break;
          case '!': gitStatus = 'ignored'; break;
          case 'U': gitStatus = 'conflict'; break; // Unmerged state
          // Add more cases here if needed
        }
      }

      if (rawStatus[0] === ' ' || rawStatus[0] === '?') {
        getStatus(1);
      } else {
        getStatus(0);
      }

      // Apply color-coding
      let displayStatus = `[${rawStatus}]`;
      displayStatus = stagingStatus === 'staged' ? kleur.green(displayStatus) : kleur.red(displayStatus);

      return {
        filename,
        displayStatus,
        rawStatus,
        status: stagingStatus,
        gitStatus,
        selected: stagingStatus == 'staged',
      };
    });
}

async function toggleFiles(files) {
	let choices = files.map((file) => ({
		name: ` ${file.displayStatus} ${file.filename} (${file.gitStatus || file.status})`,
		value: file.filename,
		checked: file.selected,
	}));

	const prompt = inquirer.createPromptModule();
	const answers = await prompt([
		{
			type: "checkbox",
			name: "filesToToggle",
			message: "Select for staging:",
			choices,
			prefix: "🏗️ ",
			loop: false,
		},
	]);

	const output = files.map((file) => ({
		...file,
		selected: answers.filesToToggle.includes(file.filename),
	}));
	// console.log(output);
	return output;
}

async function main() {
	// if process has argv we forward everything to git

	try {
		const isGit = await runGitCommand(["rev-parse", "--is-inside-work-tree"]);
		if (isGit.trim() !== "true") {
			console.log("❌ This is not a git repository.");
			return;
		}
		const statusOutput = await runGitCommand(["status", "--porcelain"]);
		const filesWithStatus = parseGitStatus(statusOutput);

		if (filesWithStatus.length === 0) {
			console.log("✅ There are no files to stage or unstage.");
			return;
		}
		const filesToToggle = await toggleFiles(filesWithStatus);

		for (const file of filesToToggle) {
			if (file.selected) {
				await runGitCommand(["add", file.filename]);
			} else if (!file.selected) {
				await runGitCommand(["restore", "--staged", file.filename]);
			}
		}
		await outputGitCommand(["status"]);
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
