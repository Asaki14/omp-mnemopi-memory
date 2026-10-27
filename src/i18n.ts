import { readFileSync } from "node:fs";
import { join } from "node:path";

/** UI text only. Model-facing prompts and log events stay English so behavior does not vary by locale. */
const en = {
	editTitle: "Edit memory (clear the text to delete)",
	deleteTitle: "Delete this memory?",
	deleteBody: "It will no longer be shown or recalled. History is kept.",
	deleted: "Deleted",
	saved: "Saved",
	draftNotSaved: "Draft not saved",
	keepEditing: "Keep editing",
	discardDraft: "Discard draft",
	needsUI: "Open this in an interactive OMP session.",
	notMnemopi: "The memory backend is not Mnemopi.",
	memories: "Memories",
	global: "Global",
	project: "Project",
	noGlobal: "No global memories.",
	noProject: "No memories for this project.",
	globalMemories: "Global memories",
	projectMemories: "Project memories",
	cannotOpen: "Cannot open memories: {error}",
	commandDescription: "View, edit, and delete memories available to this project",
	omitted: "Context is nearly full; omitted {count} lower-priority global memories for this request.",
	readFailed: "Could not read global memories; this request was sent without them: {error}",
	status: "{count} memories",
	extractionFailed: "Automatic memory extraction failed: {error}",
	noTarget: "The memory backend has no writable target scope.",
	noDatabase: "The memory database path is unavailable; no replacement database was created.",
	conflict: "This memory was changed by another session. Reopen it; nothing was overwritten.",
	emptySave: "Saving empty text requires delete confirmation.",
};
type Key = keyof typeof en;

const zhCN: Record<Key, string> = {
	editTitle: "编辑记忆（清空正文可删除）",
	deleteTitle: "删除这条记忆？",
	deleteBody: "删除后不再展示和召回，历史记录保留。",
	deleted: "已删除",
	saved: "已保存",
	draftNotSaved: "草稿未保存",
	keepEditing: "继续编辑",
	discardDraft: "放弃草稿",
	needsUI: "请在 OMP 交互窗口中打开。",
	notMnemopi: "当前未使用 Mnemopi。",
	memories: "记忆",
	global: "全局",
	project: "项目",
	noGlobal: "暂无全局记忆。",
	noProject: "当前项目暂无记忆。",
	globalMemories: "全局记忆",
	projectMemories: "项目记忆",
	cannotOpen: "无法打开记忆面板：{error}",
	commandDescription: "查看、编辑和删除当前项目可用记忆",
	omitted: "上下文容量不足，本次省略 {count} 条低优先级全局记忆。",
	readFailed: "全局记忆读取失败，本次请求未注入：{error}",
	status: "记忆{count}条",
	extractionFailed: "自动记忆提炼失败：{error}",
	noTarget: "当前记忆后端没有可写的目标范围。",
	noDatabase: "当前记忆库路径不可用，未创建替代数据库。",
	conflict: "这条记忆已被其他会话修改，请重新打开；本次没有覆盖内容。",
	emptySave: "空白正文需要通过删除确认处理。",
};

const catalogs: Record<string, Record<Key, string>> = { en, "zh-CN": zhCN };
let active: Record<Key, string> = en;

/**
 * Pick the UI language: `locale` in `<agentDir>/omp-mnemopi-memory.json`, else the POSIX locale
 * (`LC_ALL`, `LC_MESSAGES`, `LANG`). Chinese locales map to `zh-CN`; anything else is English.
 * Until this runs (e.g. in tests) text is English.
 */
export function initLocale(agentDir: string): void {
	let configured: unknown;
	try {
		const config: unknown = JSON.parse(readFileSync(join(agentDir, "omp-mnemopi-memory.json"), "utf8"));
		if (config && typeof config === "object" && "locale" in config) configured = config.locale;
	} catch {
		// No config file: fall back to the environment.
	}
	const requested = typeof configured === "string" ? configured
		: process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
	active = /^zh/i.test(requested) ? catalogs["zh-CN"]! : catalogs[requested] ?? en;
}

export function t(key: Key, params: Record<string, string | number> = {}): string {
	return active[key].replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match);
}
