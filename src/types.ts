import * as Cardigantime from '@theunwalked/cardigantime';
import { z } from "zod";

export const ConfigSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    instructions: z.string().optional(),
    model: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    commit: z.object({
        cached: z.boolean().optional(),
        sendit: z.boolean().optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
    }).optional(),
    release: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
    }).optional(),
    excludedPatterns: z.array(z.string()).optional(),
});

export const SecureConfigSchema = z.object({
    openaiApiKey: z.string().optional(),
});

export const CommandConfigSchema = z.object({
    commandName: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & Cardigantime.Config;
export type SecureConfig = z.infer<typeof SecureConfigSchema>;
export type CommandConfig = z.infer<typeof CommandConfigSchema>;

export interface PullRequest {
    html_url: string;
    number: number;
    labels: {
        name: string;
    }[];
}
