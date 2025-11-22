/**
 * Adapter for converting kodrdriv Config to ai-service AIConfig
 */

import type { Config } from '../types';
import type { AIConfig } from '@eldrforge/ai-service';

/**
 * Convert kodrdriv Config to AIConfig
 */
export function toAIConfig(config: Config): AIConfig {
    return {
        apiKey: (config as any).openaiApiKey || process.env.OPENAI_API_KEY,
        model: config.model,
        reasoning: config.openaiReasoning,
        commands: {
            commit: config.commit ? {
                model: config.commit.model,
                reasoning: config.commit.openaiReasoning,
            } : undefined,
            release: config.release ? {
                model: config.release.model,
                reasoning: config.release.openaiReasoning,
            } : undefined,
            review: config.review ? {
                model: config.review.model,
                reasoning: config.review.openaiReasoning,
            } : undefined,
        },
    };
}

