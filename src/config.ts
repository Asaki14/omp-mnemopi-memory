import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Settings } from "@oh-my-pi/pi-coding-agent";

export function databasePath(settings: Settings, setting: { get(settings: Settings): unknown } | undefined): string {
	if (!setting) throw new Error("This OMP version does not register the mnemopi.dbPath setting.");
	const configured = setting.get(settings);
	if (configured !== undefined && typeof configured !== "string") throw new Error("mnemopi.dbPath must be a path string.");
	if (!configured) return join(settings.getAgentDir(), "memories", "mnemopi", "mnemopi.db");
	const expanded = configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured;
	return isAbsolute(expanded) ? expanded : join(settings.getCwd(), expanded);
}

/**
 * Handle used only for reads. A read-only open of a WAL database fails when the `-wal`/`-shm` sidecars are
 * missing (SQLite removes them after the last writer closes cleanly); fall back to a non-creating writable
 * open, which recreates them. Closing that handle may remove them again, so it is the handle returned.
 */
export function openForRead(path: string): Database {
	const readonly = new Database(path, { readonly: true, strict: true });
	try {
		// The open itself succeeds; the missing sidecar only surfaces on the first read.
		readonly.query("SELECT 1 FROM sqlite_master LIMIT 1").get();
		return readonly;
	} catch {
		readonly.close();
		return new Database(path, { create: false, strict: true });
	}
}
