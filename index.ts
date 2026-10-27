import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import globalMemory from "./src/global";
import memoryEditor from "./src/extension";
import memoryGuidance from "./src/session";

export default function memoryExtension(pi: ExtensionAPI): void {
	globalMemory(pi);
	memoryEditor(pi);
	memoryGuidance(pi);
}
