export interface ArchiveOrigin {
	id: string;
	source: string | null;
	summary_of?: string | null;
	valid_until?: string | null;
	superseded_by?: string | null;
}

const ARCHIVE_SOURCES: Record<string, true> = { "coding-agent-transcript": true };

export function isArchiveSource(source: string | null): boolean {
	return source !== null && ARCHIVE_SOURCES[source] === true;
}

const SECRET = /password|passwd|secret|api[_ -]?key|access[_ -]?token|authorization|cookie|密码|口令|密钥|令牌|[?&](?:token|key|auth)=|https?:\/\/[^\s/]+@/i;

/** Credential-bearing text never leaves storage: not injected, recalled into prompts, or sent to extraction. */
export function hasSecret(text: string): boolean {
	return SECRET.test(text);
}

export function findArchiveIds(rows: Iterable<ArchiveOrigin>, now = Date.now()): Set<string> {
	const origins = [...rows];
	const archived = new Set<string>();
	for (const row of origins) {
		const expiry = row.valid_until?.replace(" ", "T");
		const expired = !!expiry && Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(expiry) ? expiry : `${expiry}Z`) <= now;
		if (isArchiveSource(row.source) || row.superseded_by || expired) archived.add(row.id);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const row of origins) {
			if (archived.has(row.id) || !row.summary_of) continue;
			if (row.summary_of.split(",").some(id => archived.has(id.trim()))) {
				archived.add(row.id);
				changed = true;
			}
		}
	}
	return archived;
}
