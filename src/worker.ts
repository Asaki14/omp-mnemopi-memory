import { completeSimple } from "@oh-my-pi/pi-ai";
import { clampThinkingLevelForModel } from "@oh-my-pi/pi-catalog/model-thinking";
import { concreteThinkingLevel, shouldDisableReasoning, toReasoningEffort } from "@oh-my-pi/pi-tui/thinking";
import { readFileSync, writeSync } from "node:fs";
import { Settings, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { roleCandidatePool } from "@oh-my-pi/pi-coding-agent/config/model-roles";
import { resolveRoleChain } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { listEntries, listScopes } from "./store";
import { storeGuidance } from "./automatic";
import { guidanceInput, GUIDANCE_PROMPT, parseGuidance, COVERAGE_PROMPT, coverageInput, parseCoverage } from "./guidance";
import { enqueue, MAX_ATTEMPTS, release, type WorkerPayload } from "./queue";

export async function completeMemory(ctx: ExtensionContext, systemPrompt: string, input: string): Promise<string> {
	const settings = Settings.instance;
	const sessionId = ctx.sessionManager.getSessionId();
	const candidates = resolveRoleChain("memory", settings, roleCandidatePool("memory", settings, ctx.modelRegistry));
	for (const { model, thinkingLevel } of candidates) {
		if (model.api === "local-inference" || model.provider === "ollama" || model.provider === "lmstudio") continue;
		if (!await ctx.modelRegistry.getApiKey(model, sessionId)) continue;
		const level = concreteThinkingLevel(thinkingLevel);
		const response = await completeSimple(model, {
			systemPrompt: [systemPrompt], messages: [{ role: "user", content: input, timestamp: Date.now() }],
		}, {
			apiKey: ctx.modelRegistry.resolver(model, sessionId), sessionId,
			reasoning: clampThinkingLevelForModel(model, toReasoningEffort(level)),
			disableReasoning: shouldDisableReasoning(level) ? true : undefined,
		});
		if (response.stopReason !== "stop") {
			throw new Error(`${model.provider}/${model.id}: ${response.stopReason}${response.errorMessage ? `: ${response.errorMessage}` : ""}`);
		}
		const text = response.content.filter(block => block.type === "text").map(block => block.text).join("\n");
		if (!text.trim()) throw new Error(`${model.provider}/${model.id}: memory model returned an empty response.`);
		return text;
	}
	throw new Error("No remote model is available for the memory role; local models are not used and nothing was saved.");
}


export default function memoryWorker(pi: ExtensionAPI): void {
 pi.on("session_start", async (_event, ctx) => {
  let payload: WorkerPayload | undefined;
  try {
   payload = JSON.parse(readFileSync(3, "utf8")) as WorkerPayload;
   const { job } = payload;
   const known = [...new Set(listScopes(job.globalDatabase, job.cwd).flatMap(scope => listEntries(scope).map(entry => entry.content)))];
   const input = guidanceInput(job.conversation, known);
   let stored = 0;
   const rejected: string[] = [];
   if (input !== undefined) {
    const candidates = parseGuidance(await completeMemory(ctx, GUIDANCE_PROMPT, input), job.conversation, reason => rejected.push(reason))
     .filter(fact => !known.includes(fact.content));
    const facts = !candidates.length ? [] : (!known.length && candidates.length === 1 ? candidates :
     parseCoverage(await completeMemory(ctx, COVERAGE_PROMPT, coverageInput(candidates, known)), candidates));
    stored = storeGuidance(job.database, job.bank, job.sessionId, job.sourceEntry, job.cwd, facts);
   }
   release(payload.claimed);
   writeSync(2, JSON.stringify({ event: "memory_session_retained", sessionId: job.sessionId, stored,
    ...(rejected.length ? { rejected } : {}), ...(payload.attempts ? { attempt: payload.attempts + 1 } : {}) }) + "\n");
   process.exit(0);
  } catch (error) {
   const message = error instanceof Error ? error.message : String(error);
   let event = "memory_session_failed";
   if (payload) {
    const attempts = payload.attempts + 1;
    // Requeue before releasing the claim so a crash between the two never loses the job.
    if (attempts < MAX_ATTEMPTS) { enqueue(payload.queueDir, payload.job, attempts); event = "memory_session_requeued"; }
    else event = "memory_session_abandoned";
    release(payload.claimed);
   }
   writeSync(2, JSON.stringify({ event, sessionId: payload?.job.sessionId, error: message }) + "\n");
   process.exit(1);
  }
 });
}
