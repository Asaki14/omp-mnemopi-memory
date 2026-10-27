import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GuidanceConversation } from "./guidance";

export interface GuidanceJob {
	database: string; globalDatabase: string; bank: string; cwd: string; sessionId: string; sourceEntry: string;
	conversation: GuidanceConversation;
}
/** What the session hands the detached worker over fd 3. */
export interface WorkerPayload { job: GuidanceJob; attempts: number; queueDir: string; claimed?: string }

/** Total tries per conversation, including the first one at session end. */
export const MAX_ATTEMPTS = 3;
/** A claim older than this belongs to a worker that died; the job becomes claimable again. */
const STALE_CLAIM_MS = 30 * 60_000;

export function queueDirectory(agentDir: string): string {
	return join(agentDir, "memories", "guidance-queue");
}

/** Persist a failed job for retry. Only the credential-filtered conversation is stored, owner-readable only. */
export function enqueue(queueDir: string, job: GuidanceJob, attempts: number): void {
	mkdirSync(queueDir, { recursive: true, mode: 0o700 });
	const name = `${job.sessionId}-${job.sourceEntry}`.replace(/[^\w.-]/g, "_");
	writeFileSync(join(queueDir, `${name}.json`), JSON.stringify({ job, attempts }), { mode: 0o600 });
}

/** Atomically claim pending and stale jobs so concurrent sessions never run the same job twice. */
export function claimQueued(queueDir: string, now = Date.now()): string[] {
	let names: string[];
	try { names = readdirSync(queueDir); } catch { return []; }
	const claimed: string[] = [];
	for (const name of names) {
		const path = join(queueDir, name);
		const pending = name.endsWith(".json");
		if (!pending && !name.endsWith(".claimed")) continue;
		try {
			if (!pending && now - statSync(path).mtimeMs < STALE_CLAIM_MS) continue;
			const target = join(queueDir, `${name.replace(/\.json(?:\.[\w-]+\.claimed)?$/, "")}.json.${process.pid}-${randomBytes(4).toString("hex")}.claimed`);
			renameSync(path, target);
			// rename keeps the old mtime; stamp the claim time so others treat it as live.
			utimesSync(target, now / 1000, now / 1000);
			claimed.push(target);
		} catch {
			// Another session claimed it first.
		}
	}
	return claimed;
}

export function release(path: string | undefined): void {
	if (!path) return;
	try { unlinkSync(path); } catch { /* already released */ }
}
