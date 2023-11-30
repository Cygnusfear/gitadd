#!/usr/bin/env bun

import { spawn } from "bun";
import prompts from "prompts";
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
	return output
		.split("\n")
		.filter((line) => line)
		.map((line) => {
			const rawStatus = line.substr(0, 2);
			const filename = line.substr(3);
			let stagingStatus =
				rawStatus[0] === " " || rawStatus[0] === "?" ? "unstaged" : "staged";
			let gitStatus = null;

			function getStatus(index) {
				switch (rawStatus[index]) {
					case "M":
						gitStatus = "modified";
						break;
					case "D":
						gitStatus = "deleted";
						break;
					case "A":
						gitStatus = "added";
						break;
					case "R":
						gitStatus = "renamed";
						break;
					case "C":
						gitStatus = "copied";
						break;
					case "?":
						gitStatus = "untracked";
						break;
					case "!":
						gitStatus = "ignored";
						break;
					case "U":
						gitStatus = "conflict";
						break;
				}
			}

			if (rawStatus[0] === " " || rawStatus[0] === "?") {
				getStatus(1);
			} else {
				getStatus(0);
			}

			// Apply color-coding
			let displayStatus = `[${rawStatus}]`;
			displayStatus =
				stagingStatus === "staged"
					? kleur.green(displayStatus)
					: kleur.red(displayStatus);

			return {
				filename,
				displayStatus,
				rawStatus,
				status: stagingStatus,
				gitStatus,
				selected: stagingStatus == "staged",
			};
		});
}

const displayColor = (status) => {
	if (status === "staged" || status === true) return kleur.green;
	if (status === "renamed") return kleur.blue;
	if (status === "copied") return kleur.blue;
	if (status === "untracked") return kleur.red;
	if (status === "ignored") return kleur.magenta;
	if (status === "added") return kleur.red;
	if (status === "deleted") return kleur.red;
	if (status === "modified") return kleur.blue;
	if (status === "conflict") return kleur.yellow;
	else return kleur.red;
};

async function toggleFiles(files) {
	let selected = 0;
	let choices = files.map((file) => {
		const color = displayColor(file.selected);
		if (file.selected) selected++;
		let gitStatus = file.gitStatus || file.status;
		return {
			title: `${color(file.displayStatus)} ${file.filename} (${displayColor(
				gitStatus,
			)(gitStatus)})`,
			value: file.filename,
			selected: file.selected,
		};
	});

	const response = await prompts({
		type: "multiselect",
		name: "filesToToggle",
		message: "Select for staging:",
		choices,
		onRender: function () {
			if (selected !== this.selected().length) {
				for (let i = 0; i < this.value.length; i++) {
					const file = this.value[i];
					const choice = files.find((f) => f.filename === file.value);
					let displayStatus = `[${choice.rawStatus}]`;
					let gitStatus = choice.gitStatus || choice.status;
					this.value[i].title = `${displayColor(file.selected)(
						displayStatus,
					)} ${choice.filename} (${displayColor(gitStatus)(gitStatus)})`;
				}
				selected = this.selected().length;
			}
		},
		hint: "(A) to select or deselect all",
		instructions: false,
	});

	if (!response.filesToToggle) {
		throw "Aborted";
	}
	const output = files.map((file) => ({
		...file,
		selected: response.filesToToggle.includes(file.filename),
	}));
	return output;
}

async function main() {
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
