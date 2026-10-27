import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initLocale, t } from "../src/i18n";

const saved = { LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES, LANG: process.env.LANG };
const roots: string[] = [];
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	// Other suites assert English messages; restore the module default regardless of the machine locale.
	const reset = mkdtempSync(join(tmpdir(), "omp-mnemopi-memory-i18n-"));
	writeFileSync(join(reset, "omp-mnemopi-memory.json"), JSON.stringify({ locale: "en" }));
	initLocale(reset);
	rmSync(reset, { recursive: true, force: true });
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function agentDir(config?: object): string {
	const root = mkdtempSync(join(tmpdir(), "omp-mnemopi-memory-i18n-"));
	roots.push(root);
	if (config) writeFileSync(join(root, "omp-mnemopi-memory.json"), JSON.stringify(config));
	return root;
}

test("config file locale overrides the environment", () => {
	process.env.LC_ALL = "en_US.UTF-8";
	initLocale(agentDir({ locale: "zh-CN" }));
	expect(t("status", { count: 3 })).toBe("记忆3条");
	process.env.LC_ALL = "zh_CN.UTF-8";
	initLocale(agentDir({ locale: "en" }));
	expect(t("status", { count: 3 })).toBe("3 memories");
});

test("without a config file, a Chinese POSIX locale selects Chinese and anything else English", () => {
	delete process.env.LC_ALL;
	delete process.env.LC_MESSAGES;
	process.env.LANG = "zh_TW.UTF-8";
	initLocale(agentDir());
	expect(t("saved")).toBe("已保存");
	process.env.LANG = "fr_FR.UTF-8";
	initLocale(agentDir());
	expect(t("saved")).toBe("Saved");
});
