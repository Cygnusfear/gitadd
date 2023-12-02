#!/usr/bin/env bun

import { spawn } from "bun";
import checkbox, { Item } from "./gitadd-checkbox";
import kleur from "kleur";
import ansiEscapes from "ansi-escapes";

interface FileStatus {
	filename: string;
	displayStatus: string;
	rawStatus: string;
	status: string;
	gitStatus: string | null;
	checked: boolean;
}

const filesWithStatus: FileStatus[] = [];

async function runGitCommand(args: string[]): Promise<string> {
	const proc = spawn(["git", ...args]);
	const output = await new Response(proc.stdout).text();
	return output;
}

async function outputGitCommand(args: string[]): Promise<void> {
	spawn(["git", ...args], {
		stdout: "inherit",
	});
}

function parseGitStatus(output: string): FileStatus[] {
	return output
		.split("\n")
		.filter((line) => line)
		.map((line) => {
			const rawStatus = line.substr(0, 2);
			const filename = line.substr(3);
			const stagingStatus =
				rawStatus[0] === " " || rawStatus[0] === "?" ? "unstaged" : "staged";
			let gitStatus: string | null = null;

			function getStatus(index: number): void {
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
				checked: stagingStatus === "staged",
			};
		});
}

const displayColor = (status: string | boolean): kleur.Color => {
	switch (status) {
		case "staged":
		case true:
			return kleur.green;
		case "renamed":
		case "copied":
			return kleur.blue;
		case "untracked":
			return kleur.red;
		case "ignored":
			return kleur.magenta;
		case "added":
		case "deleted":
			return kleur.red;
		case "modified":
			return kleur.blue;
		case "conflict":
			return kleur.yellow;
		default:
			return kleur.red;
	}
};

type TGitChoice = FileStatus & {
	name: string;
	value: string;
	checked: boolean;
	short: string;
};

const getDisplayName = (file: FileStatus | TGitChoice): string => {
	return `${displayColor(file.checked ? file.checked : file.gitStatus || false)(
		`[${file.rawStatus}]`,
	)} ${file.filename} (${displayColor(file.gitStatus || false)(
		file.gitStatus || file.status,
	)})`;
};

async function toggleFiles(files: FileStatus[]): Promise<FileStatus[]> {
	const choices = files.map((file) => ({
		...file,
		name: getDisplayName(file),
		value: file.filename,
		checked: file.checked,
	}));

	const response = await checkbox({
		message: "Select for staging:",
		choices,
		loop: false,
		pageSize: 20,
		instructions: `${kleur.grey(" > press <a> to toggle all")}`,
		onSpaceKey: (items: Item<string>[]): Item<string>[] =>
			items.map((item) => {
				return { ...item, name: getDisplayName(item as unknown as FileStatus) };
			}),
	});
	return files.map((file) => ({
		...file,
		checked: response.includes(file.filename),
	}));
}

async function main() {
	try {
		const isGit = await runGitCommand(["rev-parse", "--is-inside-work-tree"]);
		if (isGit.trim() !== "true") {
			console.log("❌ This is not a git repository.");
			return;
		}
		const statusOutput = await runGitCommand(["status", "--porcelain"]);
		filesWithStatus.push(...parseGitStatus(statusOutput));
		filesWithStatus.sort((a, b) => a.filename.localeCompare(b.filename));

		if (filesWithStatus.length === 0) {
			console.log("✅ There are no files to stage or unstage.");
			return;
		}
		const filesToToggle = await toggleFiles(filesWithStatus);

		for (const file of filesToToggle) {
			if (file.checked) {
				await runGitCommand(["add", file.filename]);
			} else if (!file.checked && file.status !== "unstaged") {
				await runGitCommand(["restore", "--staged", file.filename]);
			}
		}
		await outputGitCommand(["status"]);
	} catch (error) {
		console.error("Error:", error);
	}
}

main();
console.log(ansiEscapes.cursorShow);
