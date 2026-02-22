export interface Checkpoint {
    state: Record<string, any>;
    historySummary: string;
    timestamp: string;
}

export interface ContextManagerOptions {
    limit: number;
    charToTokenRatio?: number;
}

/**
 * Monitors and manages the LLM context usage.
 */
export class ContextManager {
    private currentUsage = 0;
    private history: { prompt: string; response: string }[] = [];
    private state: Record<string, any> = {};
    private limit: number;
    private charToTokenRatio: number;

    constructor(options: ContextManagerOptions) {
        this.limit = options.limit;
        this.charToTokenRatio = options.charToTokenRatio || 4;
    }

    /**
     * Records a prompt-response exchange and updates usage estimate.
     */
    recordExchange(prompt: string, response: string): void {
        this.history.push({ prompt, response });
        const tokens = Math.ceil((prompt.length + response.length) / this.charToTokenRatio);
        this.currentUsage += tokens;
    }

    /**
     * Updates the persistent state variables.
     */
    updateState(newState: Record<string, any>): void {
        this.state = { ...this.state, ...newState };
    }

    /**
     * Checks if the context has exceeded the limit.
     */
    needsRefresh(): boolean {
        return this.currentUsage >= this.limit;
    }

    /**
     * Returns current token usage estimate.
     */
    getUsage(): number {
        return this.currentUsage;
    }

    /**
     * Creates a checkpoint for state restoration after context clearing.
     */
    createCheckpoint(): Checkpoint {
        // Simple history summary: list of actions
        const historySummary = this.history
            .map(h => {
                // Heuristic: extract intention from prompt
                const shortPrompt = h.prompt.substring(0, 100).replace(/\n/g, ' ');
                return `- Action: ${shortPrompt}`;
            })
            .join('\n');

        return {
            state: this.state,
            historySummary,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Resets the usage counter (used after manual context clearing).
     */
    resetUsage(): void {
        this.currentUsage = 0;
        this.history = [];
    }
}
