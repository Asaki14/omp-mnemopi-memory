import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Mnemopi } from "@oh-my-pi/pi-mnemopi/core";
import { isArchiveSource } from "../src/policy";
import { readGlobalMemories } from "../src/snapshot";
import { deleteEntry, listEntries, listProjectEntries, listScopes, liveProjectEdits, MemoryConflictError, saveEntry, type MemoryScope } from "../src/store";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function fixture(path?: string, cwd?: string) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-mnemopi-memory-test-")));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const dbPath = path ?? join(root, "mnemopi.db");
	mkdirSync(dirname(dbPath), { recursive: true });
	const bank = { bank: cwd ? "project" : "default", path: dbPath };
	const scope: MemoryScope = { global: !cwd, root: cwd ?? root, label: cwd ? "Project" : "Global", banks: [bank], projectRoots: cwd ? [cwd] : undefined };
	const memory = new Mnemopi({ dbPath, bank: bank.bank, sessionId: "fixture", channelId: bank.bank, llm: false, embeddings: false, reconcile: false });
	cleanups.push(() => memory.close());
	const id = memory.remember("Legacy preference", { scope: "bank", extract: false, extractEntities: false, metadata: cwd ? { cwd } : {} });
	return { root, path: dbPath, scope, memory, id };
}
function fact(memory: Mnemopi, id: string) {
	memory.db.query("INSERT INTO facts(fact_id,session_id,subject,predicate,object,source_msg_id) VALUES(?,?,?,?,?,?)")
		.run("old-fact", "fixture", "fact", "entity", "Legacy preference", id);
}

test("Raw archives are hidden and excluded from injection, derived facts are filtered, and curated sources remain editable and deletable", () => {
	const f = fixture();
	f.memory.db.query("UPDATE working_memory SET source=? WHERE id=?").run("coding-agent-transcript", f.id);
	const archiveId = f.memory.remember("Raw conversation archive content", { scope: "bank", extract: false, extractEntities: false });
	const retainedId = f.memory.remember("Curated preference content", { scope: "bank", extract: false, extractEntities: false });
	const correctionId = f.memory.remember("Corrected preference", { scope: "bank", extract: false, extractEntities: false });
	const editorId = f.memory.remember("Manually edited preference", { scope: "bank", extract: false, extractEntities: false });
	for (const [id, source] of [[archiveId, "coding-agent-transcript"], [retainedId, "coding-agent-retain"],
		[correctionId, "user-correction"], [editorId, "user-memory-editor"]] as const) {
		f.memory.db.query("UPDATE working_memory SET source=? WHERE id=?").run(source, id);
	}
	f.memory.db.query("INSERT INTO facts(fact_id,session_id,subject,predicate,object,source_msg_id) VALUES(?,?,?,?,?,?)")
		.run("archive-fact", "fixture", "fact", "entity", "Fact derived from raw text", archiveId);
	f.memory.db.query("INSERT INTO episodic_memory(id,content,source,timestamp,session_id,importance,scope,summary_of) VALUES(?,?,?,?,?,?,?,?)")
		.run("archive-summary", "Raw text summary", "sleep_consolidation", new Date().toISOString(), "fixture", 0.7, "bank", archiveId);
	f.memory.db.query("INSERT INTO episodic_memory(id,content,source,timestamp,session_id,importance,scope,summary_of) VALUES(?,?,?,?,?,?,?,?)")
		.run("archive-summary-2", "Second-level raw text summary", "sleep_consolidation", new Date().toISOString(), "fixture", 0.7, "bank", "archive-summary");
	f.memory.db.query("INSERT INTO facts(fact_id,session_id,subject,predicate,object,source_msg_id) VALUES(?,?,?,?,?,?)")
		.run("archive-summary-fact", "fixture", "fact", "entity", "Fact derived from summary", "archive-summary");
	f.memory.db.query("INSERT INTO facts(fact_id,session_id,subject,predicate,object,source_msg_id) VALUES(?,?,?,?,?,?)")
		.run("archive-summary-2-fact", "fixture", "fact", "entity", "Fact derived from second-level summary", "archive-summary-2");
	expect(isArchiveSource("coding-agent-transcript")).toBe(true);
	expect(isArchiveSource("coding-agent-retain")).toBe(false);
	expect(isArchiveSource("user-memory-editor")).toBe(false);
	expect(isArchiveSource("user-correction")).toBe(false);
	expect(isArchiveSource(null)).toBe(false);
	expect(listEntries(f.scope).map(entry => entry.content).sort()).toEqual(["Curated preference content", "Corrected preference", "Manually edited preference"].sort());
	const snapshot = readGlobalMemories(f.path);
	expect(listEntries(f.scope).map(entry => entry.content)).not.toContain("Raw text summary");
	expect(listEntries(f.scope).map(entry => entry.content)).not.toContain("Second-level raw text summary");
	expect(snapshot.content).not.toContain("Raw conversation archive content");
	expect(snapshot.content).not.toContain("Fact derived from raw text");
	expect(snapshot.content).not.toContain("Raw text summary");
	expect(snapshot.content).not.toContain("Second-level raw text summary");
	expect(snapshot.content).not.toContain("Fact derived from summary");
	expect(snapshot.content).not.toContain("Fact derived from second-level summary");
	expect(snapshot.content).toContain("Curated preference content");
	expect(snapshot.content).toContain("Corrected preference");
	expect(snapshot.content).toContain("Manually edited preference");
	const edited = listEntries(f.scope).find(entry => entry.content === "Curated preference content")!;
	saveEntry(f.scope, edited, "Updated curated preference");
	expect(listEntries(f.scope).map(entry => entry.content)).toContain("Updated curated preference");
	deleteEntry(f.scope, listEntries(f.scope).find(entry => entry.content === "Corrected preference")!);
	expect(listEntries(f.scope).map(entry => entry.content)).not.toContain("Corrected preference");
});

test("Saving replaces the old source and facts; restoring the old text remains valid", () => {
	const f = fixture();
	fact(f.memory, f.id);
	const id = saveEntry(f.scope, listEntries(f.scope)[0], "Updated preference");
	expect(listEntries(f.scope).map(entry => entry.content)).toEqual(["Updated preference"]);
	expect(f.memory.db.query<{ superseded_by: string }, [string]>("SELECT superseded_by FROM working_memory WHERE id=?").get(f.id)?.superseded_by).toBe(id);
	expect(readGlobalMemories(f.path).content).not.toContain("Legacy preference");
	const restored = saveEntry(f.scope, listEntries(f.scope)[0], "Legacy preference");
	expect(restored).not.toBe(f.id);
	expect(listEntries(f.scope).map(entry => entry.content)).toEqual(["Legacy preference"]);
});

test("Deleting a memory removes its source and facts globally without affecting other memories", () => {
	const f = fixture();
	fact(f.memory, f.id);
	f.memory.remember("Another active memory", { scope: "bank", extract: false });
	const entry = listEntries(f.scope).find(item => item.content === "Legacy preference")!;
	deleteEntry(f.scope, entry);
	expect(listEntries(f.scope).map(item => item.content)).toEqual(["Another active memory"]);
	const snapshot = readGlobalMemories(f.path);
	expect(snapshot.count).toBe(1);
	expect(snapshot.content).not.toContain("Legacy preference");
	expect(f.memory.db.query<{ valid_until: string }, [string]>("SELECT valid_until FROM working_memory WHERE id=?").get(f.id)?.valid_until).toBeTruthy();
});

test("Concurrent edits and deletions cannot overwrite newer content", () => {
	const f = fixture();
	const opened = listEntries(f.scope)[0];
	f.memory.beam.updateWorking(f.id, "New content from another session");
	expect(() => saveEntry(f.scope, opened, "Stale draft")).toThrow(MemoryConflictError);
	expect(() => deleteEntry(f.scope, opened)).toThrow(MemoryConflictError);
	expect(listEntries(f.scope).map(entry => entry.content)).toEqual(["New content from another session"]);
});

test("Low-level empty writes cannot bypass UI delete confirmation", () => {
	const f = fixture();
	expect(() => saveEntry(f.scope, listEntries(f.scope)[0], " \n\t ")).toThrow("Saving empty text requires delete confirmation.");
	expect(listEntries(f.scope).map(entry => entry.content)).toEqual(["Legacy preference"]);
});

test("Deletes matching historical and working sources together", () => {
	const f = fixture();
	f.memory.db.query("INSERT INTO episodic_memory(id,content,source,timestamp,session_id,importance,scope) VALUES(?,?,?,?,?,?,?)")
		.run("episode", "Legacy preference", "consolidation", new Date().toISOString(), "another-owner", 0.7, "session");
	const opened = listEntries(f.scope)[0];
	expect(opened.rows.map(row => row.store).sort()).toEqual(["episodic", "working"]);
	deleteEntry(f.scope, opened);
	expect(listEntries(f.scope)).toEqual([]);
	expect(readGlobalMemories(f.path).count).toBe(0);
});

test("Returns only global and current-project scopes, excludes unrelated projects, and preserves manual cross-session edits", () => {
	const global = fixture();
	const a = fixture(join(global.root, "banks", "alpha-opaque-id", "mnemopi.db"), "/test/alpha");
	const b = fixture(join(global.root, "banks", "beta-opaque-id", "mnemopi.db"), "/test/beta");
	const scopes = listScopes(global.path, "/test/alpha/subdir");
	expect(scopes.map(scope => scope.label)).toEqual(["Global", "Project"]);
	expect(scopes[1].banks.map(bank => bank.path)).toEqual([a.path]);
	expect(scopes[1].root).toBe("/test/alpha");
	const id = saveEntry(scopes[1], listEntries(scopes[1])[0], "Alpha current rule");
	saveEntry(b.scope, listEntries(b.scope)[0], "Beta rule");
	expect(liveProjectEdits(global.path, "/test/alpha")).toEqual([{ id, content: "Alpha current rule" }]);
	expect(liveProjectEdits(global.path, "/test/unrelated")).toEqual([]);
	expect(readGlobalMemories(global.path).content).not.toContain("Alpha current rule");
});

test("Git worktrees share a project identity and unify duplicate memories for listing, editing, and deletion", () => {
	const global = fixture();
	const main = join(global.root, "app");
	const tree = join(global.root, "tree", "app");
	mkdirSync(main, { recursive: true });
	const git = (args: string[], cwd = main) => {
		const result = spawnSync("git", args, { cwd, encoding: "utf8" });
		if (result.status !== 0) throw new Error(result.stderr);
	};
	git(["init", "-q", "--initial-branch=main"]);
	git(["-c", "user.name=Memory Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "fixture"]);
	git(["worktree", "add", "-q", "-b", "fixture-tree", tree]);
	mkdirSync(join(tree, "src"));
	const a = fixture(join(global.root, "banks", "main-bank", "mnemopi.db"), main);
	const b = fixture(join(global.root, "banks", "tree-bank", "mnemopi.db"), tree);
	const scope = listScopes(global.path, join(tree, "src"))[1];
	expect(scope.root).toBe(main);
	expect(new Set(scope.banks.map(bank => bank.path))).toEqual(new Set([a.path, b.path]));
	const entries = listEntries(scope);
	expect(entries.map(entry => entry.content)).toEqual(["Legacy preference"]);
	expect(entries[0].rows).toHaveLength(2);
	const id = saveEntry(scope, entries[0], "Unified project rule");
	expect(listEntries(scope).map(entry => entry.content)).toEqual(["Unified project rule"]);
	expect(liveProjectEdits(global.path, tree)).toEqual([{ id, content: "Unified project rule" }]);
	deleteEntry(scope, listEntries(scope)[0]);
	expect(listEntries(scope)).toEqual([]);
	expect(liveProjectEdits(global.path, main)).toEqual([]);
	expect(readGlobalMemories(global.path).content).toContain("Legacy preference");
});

test("Project listings merge shared memories, exclude other projects, and preserve global scope on shared edits", () => {
	const global = fixture();
	const project = fixture(join(global.root, "banks", "alpha", "mnemopi.db"), "/test/alpha");
	const other = fixture(join(global.root, "banks", "beta", "mnemopi.db"), "/test/beta");
	project.memory.remember("Alpha release decision", { scope: "bank", extract: false, extractEntities: false, metadata: { cwd: "/test/alpha" } });
	other.memory.remember("Beta private decision", { scope: "bank", extract: false, extractEntities: false, metadata: { cwd: "/test/beta" } });
	const entries = listProjectEntries(global.path, "/test/alpha");
	expect(entries.map(item => item.entry.content)).toEqual(["Legacy preference", "Alpha release decision"]);
	const shared = entries[0];
	expect(shared.scope.global).toBe(true);
	expect(shared.entry.rows.map(row => row.location.path).sort()).toEqual([global.path, project.path].sort());
	saveEntry(shared.scope, shared.entry, "Updated shared preference");
	expect(listProjectEntries(global.path, "/test/alpha").map(item => item.entry.content)).toEqual(["Updated shared preference", "Alpha release decision"]);
	expect(listProjectEntries(global.path, "/test/beta").map(item => item.entry.content)).toContain("Updated shared preference");
	expect(listEntries(project.scope).map(entry => entry.content)).not.toContain("Legacy preference");
	deleteEntry(global.scope, listEntries(global.scope)[0]);
	expect(listProjectEntries(global.path, "/test/alpha").map(item => item.entry.content)).toEqual(["Alpha release decision"]);
});
