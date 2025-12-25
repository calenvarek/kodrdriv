import { StopContextConfig } from '../types';
import { getLogger } from '../logging';

export interface FilterResult {
    filtered: string;
    originalLength: number;
    filteredLength: number;
    matchCount: number;
    matches: FilterMatch[];
}

export interface FilterMatch {
    type: 'string' | 'pattern';
    matched: string;
    position: number;
    replacement: string;
}

interface CompiledFilter {
    type: 'string' | 'pattern';
    value: string | RegExp;
    replacement: string;
    caseSensitive: boolean;
}

/**
 * Compile stop-context configuration into efficient filter rules
 */
function compileFilters(config: StopContextConfig): CompiledFilter[] {
    const filters: CompiledFilter[] = [];
    const replacement = config.replacement || '[REDACTED]';
    const caseSensitive = config.caseSensitive ?? false;

    // Compile literal string filters
    if (config.strings && config.strings.length > 0) {
        for (const str of config.strings) {
            filters.push({
                type: 'string',
                value: str,
                replacement,
                caseSensitive,
            });
        }
    }

    // Compile regex pattern filters
    if (config.patterns && config.patterns.length > 0) {
        for (const pattern of config.patterns) {
            try {
                const flags = pattern.flags || (caseSensitive ? 'g' : 'gi');
                const regex = new RegExp(pattern.regex, flags);
                filters.push({
                    type: 'pattern',
                    value: regex,
                    replacement,
                    caseSensitive,
                });
            } catch (error) {
                const logger = getLogger();
                logger.warn(`STOP_CONTEXT_INVALID_PATTERN: Failed to compile regex pattern | Pattern: ${pattern.regex} | Error: ${error instanceof Error ? error.message : String(error)} | Action: Skipping pattern`);
            }
        }
    }

    return filters;
}

/**
 * Apply a single filter to text and track matches
 */
function applyFilter(
    text: string,
    filter: CompiledFilter,
    matches: FilterMatch[]
): string {
    if (filter.type === 'string') {
        const searchStr = filter.value as string;
        const flags = filter.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(escapeRegExp(searchStr), flags);

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                type: 'string',
                matched: match[0],
                position: match.index,
                replacement: filter.replacement,
            });
        }

        return text.replace(regex, filter.replacement);
    } else {
        // Pattern filter
        const regex = filter.value as RegExp;
        let match: RegExpExecArray | null;

        // Reset regex lastIndex to ensure we start from beginning
        regex.lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
            matches.push({
                type: 'pattern',
                matched: match[0],
                position: match.index,
                replacement: filter.replacement,
            });
        }

        // Reset regex lastIndex again before replace
        regex.lastIndex = 0;
        return text.replace(regex, filter.replacement);
    }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter content based on stop-context configuration
 *
 * @param text - The text to filter
 * @param config - The stop-context configuration
 * @returns FilterResult with filtered text and metadata
 */
export function filterContent(text: string, config: StopContextConfig | undefined): FilterResult {
    const logger = getLogger();

    // If no config or disabled, return original text
    if (!config || config.enabled === false) {
        return {
            filtered: text,
            originalLength: text.length,
            filteredLength: text.length,
            matchCount: 0,
            matches: [],
        };
    }

    const filters = compileFilters(config);

    // If no filters configured, return original text
    if (filters.length === 0) {
        return {
            filtered: text,
            originalLength: text.length,
            filteredLength: text.length,
            matchCount: 0,
            matches: [],
        };
    }

    let filtered = text;
    const allMatches: FilterMatch[] = [];

    // Apply each filter in sequence
    for (const filter of filters) {
        filtered = applyFilter(filtered, filter, allMatches);
    }

    const result: FilterResult = {
        filtered,
        originalLength: text.length,
        filteredLength: filtered.length,
        matchCount: allMatches.length,
        matches: allMatches,
    };

    // Log warning if filters were applied and warnOnFilter is enabled
    if (config.warnOnFilter !== false && allMatches.length > 0) {
        logger.warn(`STOP_CONTEXT_FILTERED: Sensitive content filtered from generated text | Matches: ${allMatches.length} | Original Length: ${text.length} | Filtered Length: ${filtered.length} | Action: Review filtered content`);

        // Log verbose details if logger level is verbose or debug
        if (logger.level === 'verbose' || logger.level === 'debug') {
            logger.verbose('STOP_CONTEXT_DETAILS: Filter details:');
            const stringMatches = allMatches.filter(m => m.type === 'string').length;
            const patternMatches = allMatches.filter(m => m.type === 'pattern').length;
            logger.verbose(`  - String matches: ${stringMatches}`);
            logger.verbose(`  - Pattern matches: ${patternMatches}`);
            logger.verbose(`  - Character change: ${text.length - filtered.length} characters removed`);
        }
    }

    // Warn if too much content was filtered
    const percentFiltered = ((text.length - filtered.length) / text.length) * 100;
    if (percentFiltered > 50) {
        logger.warn(`STOP_CONTEXT_HIGH_FILTER: High percentage of content filtered | Percentage: ${percentFiltered.toFixed(1)}% | Impact: Generated content may be incomplete | Action: Review stop-context configuration`);
    }

    return result;
}

/**
 * Check if stop-context filtering is enabled in config
 */
export function isStopContextEnabled(config: StopContextConfig | undefined): boolean {
    if (!config) {
        return false;
    }

    const hasFilters = (config.strings && config.strings.length > 0) ||
                       (config.patterns && config.patterns.length > 0);

    return Boolean(config.enabled !== false && hasFilters);
}

