import { Mnemopi } from "@oh-my-pi/pi-mnemopi/core";
import type { GuidanceFact } from "./guidance";

/** Persist extracted facts only; the conversation never enters this storage API. */
export function storeGuidance(database: string, bank: string, sessionId: string, sourceEntry: string, cwd: string, facts: GuidanceFact[]): number {
	const memory = new Mnemopi({ dbPath: database, bank, channelId: bank,
		sessionId: `omp-guidance-${sourceEntry}`, llm: false, embeddings: false, reconcile: false });
	try {
		return memory.db.transaction(() => {
			let stored = 0;
			const existing = memory.db.query<{ id: string }, [string]>("SELECT id FROM working_memory WHERE content=? AND superseded_by IS NULL AND (valid_until IS NULL OR julianday(valid_until)>julianday('now')) LIMIT 1");
			for (const fact of facts) {
				if (existing.get(fact.content)) continue;
				memory.remember(fact.content, {
					source: "omp-auto-guidance", scope: "bank", importance: 0.7,
					extract: false, extractEntities: false, veracity: "inferred",
					metadata: { cwd, memory_kind: "guidance", guidance_kind: fact.kind,
						source_session: sessionId, source_entry: sourceEntry },
				});
				stored++;
			}
			return stored;
		}).immediate();
	} finally { memory.close(); }
}
