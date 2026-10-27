import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import globalMemory from "./global";
import memoryEditor from "./extension";
import memoryGuidance from "./session";

export default function memoryExtension(pi: ExtensionAPI): void {
	globalMemory(pi);
	memoryEditor(pi);
	memoryGuidance(pi);
}
