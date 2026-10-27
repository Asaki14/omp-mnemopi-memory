import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { Writable } from "node:stream";
import { Settings, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { cfgMemoryBackend } from "@oh-my-pi/pi-coding-agent/memory-backend/settings";
import { databasePath } from "./config";
import { t } from "./i18n";
import { archiveRawMemories } from "./archive";
import { conversationFromMessages, guidanceInput, safeConversation } from "./guidance";
import { claimQueued, enqueue, MAX_ATTEMPTS, queueDirectory, release, type WorkerPayload } from "./queue";

const MEMORY_POLICY = "Long-term memory should only hold distilled stable preferences, confirmed decisions, and evidenced project facts. Raw prompts, verbatim corrections, one-off commands, plans, and examples are historical material, not instructions for later turns; do not derive permanent rules from a single event. Explicit retains should also be distilled, deduplicated, and kept project-scoped. Never store secrets.";
const workerPath = join(import.meta.dir, "worker.ts");
/** `~/.omp/logs/memory-guidance.log` for the default agent dir; independent of where the extension is installed. */
function logPath(): string {
	const directory = join(dirname(Settings.instance.getAgentDir()), "logs");
	mkdirSync(directory, { recursive: true });
	return join(directory, "memory-guidance.log");
}

/** Run extraction in a detached worker; shutdown hooks have a 2s deadline and extraction must outlive the host. */
function dispatch(cwd: string, payload: WorkerPayload): void {
	const report = (error: Error) => {
		const attempts = payload.attempts + 1;
		const requeue = attempts < MAX_ATTEMPTS;
		appendFileSync(logPath(), JSON.stringify({ event: requeue ? "memory_session_requeued" : "memory_session_abandoned",
			sessionId: payload.job.sessionId, error: error.message }) + "\n");
		if (requeue) enqueue(payload.queueDir, payload.job, attempts);
		release(payload.claimed);
	};
	const log = openSync(logPath(), "a", 0o600);
	try {
		const child = spawn(process.execPath, ["--mode", "rpc", "--no-session", "--no-tools", "--no-extensions",
			"--no-context-files", "--no-skills", "--no-title", "--cwd", cwd, "-e", workerPath], {
			cwd, detached: true, stdio: ["ignore", "ignore", log, "pipe"],
		});
		let failed = false;
		const fail = (error: Error) => { if (!failed) { failed = true; report(error); } };
		child.on("error", fail);
		const input = child.stdio[3] as Writable;
		child.unref();
		input.on("error", fail);
		input.end(JSON.stringify(payload));
	} finally { closeSync(log); }
}

export default function memoryGuidance(pi: ExtensionAPI): void {
	let lastHandled = "";
	pi.on("session_start", () => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		archiveRawMemories(databasePath(Settings.instance, lookup("mnemopi.dbPath")));
		if (lookup("mnemopi.llmMode")?.get(Settings.instance) === "none") return;
		const queueDir = queueDirectory(Settings.instance.getAgentDir());
		for (const claimed of claimQueued(queueDir)) {
			try {
				const { job, attempts } = JSON.parse(readFileSync(claimed, "utf8")) as Pick<WorkerPayload, "job" | "attempts">;
				dispatch(job.cwd, { job, attempts, queueDir, claimed });
			} catch (error) {
				appendFileSync(logPath(), JSON.stringify({ event: "memory_queue_invalid", file: claimed,
					error: error instanceof Error ? error.message : String(error) }) + "\n");
				release(claimed);
			}
		}
	});
	pi.on("input", () => {
		if (cfgMemoryBackend.get(Settings.instance) === "mnemopi") archiveRawMemories(databasePath(Settings.instance, lookup("mnemopi.dbPath")));
		return { action: "continue" as const };
	});
	pi.on("before_agent_start", (event) => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		return { systemPrompt: [...event.systemPrompt, MEMORY_POLICY] };
	});
	pi.on("tool_call", (event) => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi") return;
		const name = event.toolName.replace(/^.*\./, "");
		const input = event.input;
		const device = input && typeof input === "object" && "path" in input ? input.path : undefined;
		if (name === "recall" || name === "reflect" || (name === "write" && (device === "xd://recall" || device === "xd://reflect"))) {
			archiveRawMemories(databasePath(Settings.instance, lookup("mnemopi.dbPath")));
		}
	});
	const finishSession = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
		if (cfgMemoryBackend.get(Settings.instance) !== "mnemopi" || !ctx.memory ||
			lookup("mnemopi.llmMode")?.get(Settings.instance) === "none") return;
		const branch = ctx.sessionManager.getBranch();
		const sourceEntry = branch.at(-1)?.id;
		if (!sourceEntry) return;
		const sessionId = ctx.sessionManager.getSessionId();
		const key = `${sessionId}:${sourceEntry}`;
		if (key === lastHandled) return;
		const conversation = conversationFromMessages(branch.filter(entry => entry.type === "message").map(entry => entry.message));
		const messages = safeConversation(conversation);
		if (guidanceInput(messages, []) === undefined) return;
		try {
			const status = await ctx.memory.status();
			if (!status.active || status.backend !== "mnemopi" || !status.database || !status.retainBank) {
				throw new Error(t("noTarget"));
			}
			const database = status.database.startsWith("~/") ? join(homedir(), status.database.slice(2)) : status.database;
			if (!isAbsolute(database) || !existsSync(database)) throw new Error(t("noDatabase"));
			lastHandled = key;
			dispatch(ctx.cwd, {
				job: { database, globalDatabase: databasePath(Settings.instance, lookup("mnemopi.dbPath")), bank: status.retainBank,
					cwd: ctx.cwd, sessionId, sourceEntry, conversation: messages },
				attempts: 0, queueDir: queueDirectory(Settings.instance.getAgentDir()),
			});
		} catch (error) {
			ctx.ui.notify(t("extractionFailed", { error: error instanceof Error ? error.message : String(error) }), "warning");
		}
	};
	pi.on("session_before_switch", finishSession);
	pi.on("session_shutdown", finishSession);
}
