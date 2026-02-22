import { Worker } from "./worker.js";

/**
 * @deprecated Use CopilotProvider instead. This class is kept for backward compatibility.
 *
 * A worker agent that integrates with GitHub Copilot CLI via the SDK.
 * Now uses CopilotProvider internally.
 */
export class CopilotWorker extends Worker {
  // This class is kept for backward compatibility.
  // New code should use CopilotProvider directly with Worker.setProvider()
}
