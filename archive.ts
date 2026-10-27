import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Mnemopi } from "@oh-my-pi/pi-mnemopi/core";
import { openForRead } from "./config";
import { findArchiveIds, isArchiveSource, type ArchiveOrigin } from "./policy";

export interface MemoryBankPath { bank: string; path: string }
interface ArchiveRow extends ArchiveOrigin {
	store: "working" | "episodic";
	session_id: string | null;
	valid_until: string | null;
	superseded_by: string | null;
}
export interface ArchivedRecord { bank: string; id: string; store: "working" | "episodic"; source: string | null; kind: "raw" | "derived" }
export interface ArchiveResult { scannedBanks: number; records: ArchivedRecord[] }

export function memoryBankPaths(globalPath: string): MemoryBankPath[] {
	const result: MemoryBankPath[] = existsSync(globalPath) ? [{ bank: "default", path: globalPath }] : [];
	const directory = join(dirname(globalPath), "banks");
	if (!existsSync(directory)) return result;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const path = join(directory, entry.name, "mnemopi.db");
		if (existsSync(path)) result.push({ bank: entry.name, path });
	}
	return result;
}

/** Retain history and provenance, but remove raw conversations and their descendants from active recall. */
export function archiveRawMemories(globalPath: string): ArchiveResult {
	const result: ArchiveResult = { scannedBanks: 0, records: [] };
	for (const bank of memoryBankPaths(globalPath)) {
		const readonly = openForRead(bank.path);
		let candidates: ArchiveRow[];
		try {
			const rows = readonly.query<ArchiveRow, []>(`
				SELECT id,source,NULL AS summary_of,'working' AS store,session_id,valid_until,superseded_by FROM working_memory
				UNION ALL SELECT id,source,summary_of,'episodic' AS store,session_id,valid_until,superseded_by FROM episodic_memory
			`).all();
			const ids = findArchiveIds(rows);
			candidates = rows.filter(row => ids.has(row.id) && !row.superseded_by &&
				(!row.valid_until || Date.parse(row.valid_until.includes("T") ? row.valid_until : `${row.valid_until.replace(" ", "T")}Z`) > Date.now()));
		} finally { readonly.close(); }
		result.scannedBanks++;
		if (!candidates.length) continue;
		const db = new Database(bank.path, { strict: true });
		const owners = new Map<string, Mnemopi>();
		try {
			db.transaction(() => {
				for (const row of candidates) {
					const sessionId = row.session_id ?? bank.bank;
					let memory = owners.get(sessionId);
					if (!memory) {
						memory = new Mnemopi({ db, dbPath: bank.path, bank: bank.bank, sessionId, channelId: bank.bank,
							llm: false, embeddings: false, reconcile: false });
						owners.set(sessionId, memory);
					}
					if (!memory.beam.invalidate(row.id, null)) throw new Error(`Could not archive memory ${row.id}`);
				}
			}).immediate();
			result.records.push(...candidates.map(row => ({ bank: bank.bank, id: row.id, store: row.store,
				source: row.source, kind: isArchiveSource(row.source) ? "raw" as const : "derived" as const })));
		} finally {
			for (const memory of owners.values()) memory.close();
			db.close();
		}
	}
	return result;
}
