import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { listProjectEntries } from "./store";

export function refreshMemoryStatus(ctx: ExtensionContext, globalPath?: string): void {
	if (!globalPath) {
		ctx.ui.setStatus("global-memory", undefined);
		return;
	}
	ctx.ui.setStatus("global-memory", `${listProjectEntries(globalPath, ctx.cwd).length} memories`);
}
