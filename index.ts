import { Settings, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { initLocale } from "./src/i18n";
import globalMemory from "./src/global";
import memoryEditor from "./src/extension";
import memoryGuidance from "./src/session";

export default function memoryExtension(pi: ExtensionAPI): void {
	initLocale(Settings.instance.getAgentDir());
	globalMemory(pi);
	memoryEditor(pi);
	memoryGuidance(pi);
}
