import { readGlobalMemories, withoutRecalledGlobals } from "./snapshot";
import { databasePath } from "./config";
import { t } from "./i18n";
import { refreshMemoryStatus } from "./status";
import { estimateTokens, Settings, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { cfgMemoryBackend } from "@oh-my-pi/pi-coding-agent/memory-backend/settings";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

const MESSAGE_TYPE = "global-memory-full";

export default function globalMemory(pi: ExtensionAPI) {
	// Notify once per distinct problem; the context hook runs on every model request.
	let lastNotice = "";
	const notifyOnce = (ctx: ExtensionContext, text: string) => {
		if (text === lastNotice) return;
		lastNotice = text;
		ctx.ui.notify(text, "warning");
		if (!ctx.hasUI) process.stderr.write(`${text}\n`);
	};

	pi.on("before_agent_start", (event) => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		try {
			const snapshot = readGlobalMemories(databasePath(Settings.instance, lookup("mnemopi.dbPath")));
			const systemPrompt = withoutRecalledGlobals(event.systemPrompt, snapshot.entries.map(entry => entry.text));
			return systemPrompt ? { systemPrompt } : undefined;
		} catch {
			// Leave the recall block intact; the context hook reports the read failure.
			return undefined;
		}
	});

	pi.on("context", async (event, ctx: ExtensionContext) => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		const messages = event.messages.filter(message => message.role !== "custom" || message.customType !== MESSAGE_TYPE);
		try {
			const path = databasePath(Settings.instance, lookup("mnemopi.dbPath"));
			refreshMemoryStatus(ctx, path);
			const window = ctx.model?.contextWindow;
			const used = ctx.getContextUsage()?.tokens ?? 0;
			const toMessage = (content: string) => ({
				role: "custom" as const,
				customType: MESSAGE_TYPE,
				content,
				display: false,
				attribution: "agent" as const,
				timestamp: 0,
			});
			const snapshot = readGlobalMemories(path, Date.now(),
				window ? content => used + estimateTokens(toMessage(content)) <= window : undefined);
			if (snapshot.omitted) notifyOnce(ctx, t("omitted", { count: snapshot.omitted }));
			if (snapshot.count === 0) return { messages };
			// The context hook changes only this request, not the session log or compaction summary.
			return { messages: [toMessage(snapshot.content), ...messages] };
		} catch (error) {
			notifyOnce(ctx, t("readFailed", { error: error instanceof Error ? error.message : String(error) }));
			return { messages };
		}
	});
}
