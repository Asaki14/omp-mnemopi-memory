import { Settings, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { cfgMemoryBackend } from "@oh-my-pi/pi-coding-agent/memory-backend/settings";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { databasePath } from "./config";
import { t } from "./i18n";
import { deleteEntry, listEntries, listScopes, liveProjectEdits, saveEntry, type MemoryEntry, type MemoryScope } from "./store";
import { refreshMemoryStatus } from "./status";

const LIVE_TYPE = "memory-editor-live-project";
function currentDatabasePath(): string {
	return databasePath(Settings.instance, lookup("mnemopi.dbPath"));
}
function refreshStatus(ctx: ExtensionContext): void {
	refreshMemoryStatus(ctx, cfgMemoryBackend.get(Settings.instance) === "mnemopi" ? currentDatabasePath() : undefined);
}
async function editMemory(scope: MemoryScope, entry: MemoryEntry, ctx: ExtensionCommandContext): Promise<void> {
	let draft = entry.content;
	for (;;) {
		const result = await ctx.ui.editor(t("editTitle"), draft);
		if (result === undefined || result === entry.content) return;
		draft = result;
		try {
			if (!draft.trim()) {
				const confirmed = await ctx.ui.confirm(t("deleteTitle"), `${entry.content.slice(0, 160)}\n\n${t("deleteBody")}`);
				if (!confirmed) { draft = entry.content; continue; }
				deleteEntry(scope, entry);
				refreshStatus(ctx);
				ctx.ui.notify(t("deleted"), "info");
				return;
			}
			saveEntry(scope, entry, draft);
			refreshStatus(ctx);
			ctx.ui.notify(t("saved"), "info");
			return;
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			if (await ctx.ui.select(t("draftNotSaved"), [t("keepEditing"), t("discardDraft")]) !== t("keepEditing")) return;
		}
	}
}
async function openMemories(_args: string, ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) { ctx.ui.notify(t("needsUI"), "error"); return; }
	if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") {
		ctx.ui.notify(t("notMnemopi"), "error"); return;
	}
	await ctx.waitForIdle();
	try {
		for (;;) {
			const scopes = listScopes(currentDatabasePath(), ctx.cwd);
			const categories = scopes.map(scope => `${t(scope.global ? "global" : "project")} · ${listEntries(scope).length}`);
			const category = await ctx.ui.select(t("memories"), categories);
			if (category === undefined) return;
			const scope = scopes[categories.indexOf(category)];
			if (!scope) return;
			for (;;) {
				const entries = listEntries(scope);
				if (!entries.length) {
					ctx.ui.notify(t(scope.global ? "noGlobal" : "noProject"), "info");
					break;
				}
				const labels = entries.map(entry => entry.content.replace(/\s+/g, " "));
				const selected = await ctx.ui.select(t(scope.global ? "globalMemories" : "projectMemories"), labels);
				if (selected === undefined) break;
				const entry = entries[labels.indexOf(selected)];
				if (entry) await editMemory(scope, entry, ctx);
			}
		}
	} catch (error) {
		ctx.ui.notify(t("cannotOpen", { error: error instanceof Error ? error.message : String(error) }), "error");
	}
}
export default function memoryEditor(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => { refreshStatus(ctx); });
	pi.on("input", (_event, ctx) => { refreshStatus(ctx); return { action: "continue" as const }; });
	pi.registerCommand("memories", { description: t("commandDescription"), handler: openMemories });
	pi.on("context", async (event, ctx) => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		const messages = event.messages.filter(message => message.role !== "custom" || message.customType !== LIVE_TYPE);
		const edits = liveProjectEdits(currentDatabasePath(), ctx.cwd);
		if (!edits.length) return { messages };
		return { messages: [{
			role: "custom" as const, customType: LIVE_TYPE, display: false, attribution: "agent" as const, timestamp: 0,
			content: ["<memory_editor_updates>", "Project memories the user edited directly; these are the current versions:",
				...edits.map(row => `- [${row.id}] ${row.content.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}`),
				"</memory_editor_updates>"].join("\n"),
		}, ...messages] };
	});
}
