import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { listProjectEntries } from "./store";
import { t } from "./i18n";

export function refreshMemoryStatus(ctx: ExtensionContext, globalPath?: string): void {
	if (!globalPath) {
		ctx.ui.setStatus("global-memory", undefined);
		return;
	}
	ctx.ui.setStatus("global-memory", t("status", { count: listProjectEntries(globalPath, ctx.cwd).length }));
}
