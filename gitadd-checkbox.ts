import {
	createPrompt,
	useState,
	useKeypress,
	usePrefix,
	usePagination,
	useMemo,
	isUpKey,
	isDownKey,
	isSpaceKey,
	isNumberKey,
	isEnterKey,
	type PromptConfig,
} from "@inquirer/core";
import type {} from "@inquirer/type";
import kleur from "kleur";
import figures from "figures";
import ansiEscapes from "ansi-escapes";

export type Choice<Value> = {
	name?: string;
	value: Value;
	disabled?: boolean | string;
	checked?: boolean;
	type?: never;
};

export type Config<Value> = PromptConfig<{
	prefix?: string;
	pageSize?: number;
	instructions?: string | boolean;
	choices: ReadonlyArray<Choice<Value>>;
	loop?: boolean;
	required?: boolean;
	validate?: (
		items: ReadonlyArray<Item<Value>>,
	) => boolean | string | Promise<string | boolean>;
	onSpaceKey?: (items: Item<Value>[]) => Item<Value>[];
}>;

export type Item<Value> = Choice<Value>;

function isSelectable<Value>(item: Item<Value>): item is Choice<Value> {
	return !item.disabled;
}

function isChecked<Value>(item: Item<Value>): item is Choice<Value> {
	return isSelectable(item) && Boolean(item.checked);
}

function toggle<Value>(item: Item<Value>): Item<Value> {
	return isSelectable(item) ? { ...item, checked: !item.checked } : item;
}

function check(checked: boolean) {
	return <Value>(item: Item<Value>): Item<Value> =>
		isSelectable(item) ? { ...item, checked } : item;
}

function renderItem<Value>({
	item,
	isActive,
}: { item: Item<Value>; isActive: boolean }) {
	const line = item.name || item.value;
	if (item.disabled) {
		const disabledLabel =
			typeof item.disabled === "string" ? item.disabled : "(disabled)";
		return kleur.dim(`- ${line} ${disabledLabel}`);
	}

	const checkbox = item.checked
		? ` ${kleur.green("✅")} `
		: ` ${kleur.grey(figures.checkboxOff)} `;
	const color = isActive ? kleur.cyan : (x: string) => x;
	const prefix = isActive ? figures.pointer : " ";
	return color(`${prefix}${checkbox} ${line}`);
}

export default createPrompt(
	<Value>(config: Config<Value>, done: (value: Array<Value>) => void) => {
		const {
			prefix = usePrefix(),
			instructions,
			pageSize,
			loop = true,
			choices,
			required,
			validate = () => true,
			onSpaceKey,
		} = config;
		const [status, setStatus] = useState("pending");
		const [items, setItems] = useState<ReadonlyArray<Item<Value>>>(
			choices.map((choice) => ({ ...choice })),
		);

		const bounds = useMemo(() => {
			const first = items.findIndex(isSelectable);
			// TODO: Replace with `findLastIndex` when it's available.
			const last =
				items.length - 1 - [...items].reverse().findIndex(isSelectable);

			if (first < 0) {
				throw new Error(
					"[checkbox prompt] No selectable choices. All choices are disabled.",
				);
			}

			return { first, last };
		}, [items]);

		const [active, setActive] = useState(bounds.first);
		const [showHelpTip, setShowHelpTip] = useState(true);
		const [errorMsg, setError] = useState<string | undefined>(undefined);

		useKeypress(async (key) => {
			if (isEnterKey(key)) {
				const selection = items.filter(isChecked);
				const isValid = await validate([...selection]);
				if (required && !items.some(isChecked)) {
					setError("At least one choice must be selected");
				} else if (isValid === true) {
					setStatus("done");
					done(selection.map((choice) => choice.value));
				} else {
					setError(isValid || "You must select a valid value");
				}
			} else if (isUpKey(key) || isDownKey(key)) {
				if (
					loop ||
					(isUpKey(key) && active !== bounds.first) ||
					(isDownKey(key) && active !== bounds.last)
				) {
					const offset = isUpKey(key) ? -1 : 1;
					let next = active;
					do {
						next = (next + offset + items.length) % items.length;
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
					} while (!isSelectable(items[next]!));
					setActive(next);
				}
			} else if (isSpaceKey(key)) {
				setError(undefined);
				setItems(
					items.map((choice, i) => {
						return i === active ? toggle(choice) : choice;
					}),
				);
				if (onSpaceKey) {
					setItems(
						onSpaceKey(
							items.map((choice, i) => {
								if (i !== active) return choice;
								return { ...choice, checked: i === active && !choice.checked };
							}),
						),
					);
				}
			} else if (key.name === "a") {
				const selectAll = Boolean(
					items.find((choice) => isSelectable(choice) && !choice.checked),
				);
				setItems(items.map(check(selectAll)));
			} else if (key.name === "i") {
				setItems(items.map(toggle));
			} else if (isNumberKey(key)) {
				// Adjust index to start at 1
				const position = Number(key.name) - 1;
				const item = items[position];
				if (item != null && isSelectable(item)) {
					setActive(position);
					setItems(
						items.map((choice, i) =>
							i === position ? toggle(choice) : choice,
						),
					);
				}
			}
		});

		const message = kleur.bold(config.message.toString());

		const page = usePagination<Item<Value>>({
			items,
			active,
			renderItem,
			pageSize,
			loop,
		});

		if (status === "done") {
			const selection = items
				.filter(isChecked)
				.map((choice) => choice.name || choice.value);
			return `${prefix} ${message} ${kleur.cyan(selection.join(", "))}`;
		}

		let helpTip = "";
		if (showHelpTip && (instructions === undefined || instructions)) {
			if (typeof instructions === "string") {
				helpTip = instructions;
			} else {
				const keys = [
					`${kleur.bold().cyan("<space>")} to select`,
					`${kleur.bold().cyan("<a>")} to toggle all`,
					`${kleur.bold().cyan("<i>")} to invert selection`,
					`and ${kleur.bold().cyan("<enter>")} to proceed`,
				];
				helpTip = ` (Press ${keys.join(", ")})`;
			}
		}

		let error = "";
		if (errorMsg) {
			error = kleur.red(`> ${errorMsg}`);
		}

		return `${prefix} ${message}${helpTip}\n${page}\n${error}${ansiEscapes.cursorHide}`;
	},
);
