import { getLogger } from '../logging';
import { getOpenIssues, createIssue } from '../util/github';

export interface Issue {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    category: 'ui' | 'content' | 'functionality' | 'accessibility' | 'performance' | 'other';
    suggestions?: string[];
}

export interface ReviewResult {
    summary: string;
    totalIssues: number;
    issues: Issue[];
}

// Get GitHub issues content
export const get = async (options: { limit?: number } = {}): Promise<string> => {
    const logger = getLogger();
    const { limit = 20 } = options;

    try {
        logger.debug('Fetching open GitHub issues...');
        const issuesLimit = Math.min(limit, 20); // Cap at 20
        const githubIssues = await getOpenIssues(issuesLimit);

        if (githubIssues.trim()) {
            logger.debug('Added GitHub issues to context (%d characters)', githubIssues.length);
            return githubIssues;
        } else {
            logger.debug('No open GitHub issues found');
            return '';
        }
    } catch (error: any) {
        logger.warn('Failed to fetch GitHub issues: %s', error.message);
        return '';
    }
};

// Helper function to get user choice interactively
async function getUserChoice(prompt: string, choices: Array<{ key: string, label: string }>): Promise<string> {
    const logger = getLogger();

    logger.info(prompt);
    choices.forEach(choice => {
        logger.info(`   [${choice.key}] ${choice.label}`);
    });
    logger.info('');

    return new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', (key) => {
            const keyStr = key.toString().toLowerCase();
            const choice = choices.find(c => c.key === keyStr);
            if (choice) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                logger.info(`Selected: ${choice.label}\n`);
                resolve(choice.key);
            }
        });
    });
}

// Helper function to edit issue interactively
async function editIssueInteractively(issue: Issue): Promise<Issue> {
    const logger = getLogger();
    const readline = await import('readline');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt: string): Promise<string> => {
        return new Promise(resolve => {
            rl.question(prompt, resolve);
        });
    };

    try {
        logger.info('📝 Edit issue details (press Enter to keep current value):');

        const newTitle = await question(`Title [${issue.title}]: `);
        const newDescription = await question(`Description [${issue.description}]: `);
        const newPriority = await question(`Priority (low/medium/high) [${issue.priority}]: `);
        const newCategory = await question(`Category (ui/content/functionality/accessibility/performance/other) [${issue.category}]: `);

        const updatedIssue: Issue = {
            title: newTitle.trim() || issue.title,
            description: newDescription.trim() || issue.description,
            priority: (newPriority.trim() as any) || issue.priority,
            category: (newCategory.trim() as any) || issue.category,
            suggestions: issue.suggestions
        };

        logger.info('✅ Issue updated successfully');
        return updatedIssue;
    } finally {
        rl.close();
    }
}

// Helper function to format issue body for GitHub
function formatIssueBody(issue: Issue): string {
    let body = `## Description\n\n${issue.description}\n\n`;

    body += `## Details\n\n`;
    body += `- **Priority:** ${issue.priority}\n`;
    body += `- **Category:** ${issue.category}\n`;
    body += `- **Source:** Review\n\n`;

    if (issue.suggestions && issue.suggestions.length > 0) {
        body += `## Suggestions\n\n`;
        issue.suggestions.forEach(suggestion => {
            body += `- ${suggestion}\n`;
        });
        body += '\n';
    }

    body += `---\n\n`;
    body += `*This issue was automatically created from a review session.*`;

    return body;
}

// Helper function to format results with created GitHub issues
function formatReviewResultsWithIssues(
    result: ReviewResult,
    createdIssues: Array<{ issue: Issue, githubUrl: string, number: number }>
): string {
    let output = `📝 Review Results\n\n`;
    output += `📋 Summary: ${result.summary}\n`;
    output += `📊 Total Issues Found: ${result.totalIssues}\n`;
    output += `🚀 GitHub Issues Created: ${createdIssues.length}\n\n`;

    if (result.issues && result.issues.length > 0) {
        output += `📝 Issues Identified:\n\n`;

        result.issues.forEach((issue, index) => {
            const priorityEmoji = issue.priority === 'high' ? '🔴' :
                issue.priority === 'medium' ? '🟡' : '🟢';
            const categoryEmoji = issue.category === 'ui' ? '🎨' :
                issue.category === 'content' ? '📝' :
                    issue.category === 'functionality' ? '⚙️' :
                        issue.category === 'accessibility' ? '♿' :
                            issue.category === 'performance' ? '⚡' : '🔧';

            output += `${index + 1}. ${priorityEmoji} ${issue.title}\n`;
            output += `   ${categoryEmoji} Category: ${issue.category} | Priority: ${issue.priority}\n`;
            output += `   📖 Description: ${issue.description}\n`;

            // Check if this issue was created as a GitHub issue
            const createdIssue = createdIssues.find(ci => ci.issue === issue);
            if (createdIssue) {
                output += `   🔗 GitHub Issue: #${createdIssue.number} - ${createdIssue.githubUrl}\n`;
            }

            if (issue.suggestions && issue.suggestions.length > 0) {
                output += `   💡 Suggestions:\n`;
                issue.suggestions.forEach(suggestion => {
                    output += `      • ${suggestion}\n`;
                });
            }
            output += `\n`;
        });
    } else {
        output += `✅ No specific issues identified from the review.\n\n`;
    }

    if (createdIssues.length > 0) {
        output += `\n🎯 Created GitHub Issues:\n`;
        createdIssues.forEach(createdIssue => {
            output += `• #${createdIssue.number}: ${createdIssue.issue.title} - ${createdIssue.githubUrl}\n`;
        });
        output += `\n`;
    }

    output += `🚀 Next Steps: Review the created GitHub issues and prioritize them in your development workflow.`;

    return output;
}

function formatReviewResults(result: ReviewResult): string {
    let output = `📝 Review Results\n\n`;
    output += `📋 Summary: ${result.summary}\n`;
    output += `📊 Total Issues Found: ${result.totalIssues}\n\n`;

    if (result.issues && result.issues.length > 0) {
        output += `📝 Issues Identified:\n\n`;

        result.issues.forEach((issue, index) => {
            const priorityEmoji = issue.priority === 'high' ? '🔴' :
                issue.priority === 'medium' ? '🟡' : '🟢';
            const categoryEmoji = issue.category === 'ui' ? '🎨' :
                issue.category === 'content' ? '📝' :
                    issue.category === 'functionality' ? '⚙️' :
                        issue.category === 'accessibility' ? '♿' :
                            issue.category === 'performance' ? '⚡' : '🔧';

            output += `${index + 1}. ${priorityEmoji} ${issue.title}\n`;
            output += `   ${categoryEmoji} Category: ${issue.category} | Priority: ${issue.priority}\n`;
            output += `   📖 Description: ${issue.description}\n`;

            if (issue.suggestions && issue.suggestions.length > 0) {
                output += `   💡 Suggestions:\n`;
                issue.suggestions.forEach(suggestion => {
                    output += `      • ${suggestion}\n`;
                });
            }
            output += `\n`;
        });
    } else {
        output += `✅ No specific issues identified from the review.\n\n`;
    }

    output += `🚀 Next Steps: Review the identified issues and prioritize them for your development workflow.`;

    return output;
}

// Handle GitHub issue creation workflow
export const handleIssueCreation = async (
    result: ReviewResult,
    senditMode: boolean = false
): Promise<string> => {
    const logger = getLogger();
    const createdIssues: Array<{ issue: Issue, githubUrl: string, number: number }> = [];

    if (!result.issues || result.issues.length === 0) {
        return formatReviewResults(result);
    }

    logger.info(`🔍 Found ${result.issues.length} issues to potentially create as GitHub issues`);

    for (let i = 0; i < result.issues.length; i++) {
        const issue = result.issues[i];
        let shouldCreateIssue = senditMode;

        if (!senditMode) {
            // Interactive confirmation for each issue
            logger.info(`\n📋 Issue ${i + 1} of ${result.issues.length}:`);
            logger.info(`   Title: ${issue.title}`);
            logger.info(`   Priority: ${issue.priority} | Category: ${issue.category}`);
            logger.info(`   Description: ${issue.description}`);
            if (issue.suggestions && issue.suggestions.length > 0) {
                logger.info(`   Suggestions: ${issue.suggestions.join(', ')}`);
            }

            // Get user choice
            const choice = await getUserChoice('\nWhat would you like to do with this issue?', [
                { key: 'c', label: 'Create GitHub issue' },
                { key: 's', label: 'Skip this issue' },
                { key: 'e', label: 'Edit issue details' }
            ]);

            if (choice === 'c') {
                shouldCreateIssue = true;
            } else if (choice === 'e') {
                // Allow user to edit the issue
                const editedIssue = await editIssueInteractively(issue);
                result.issues[i] = editedIssue;
                shouldCreateIssue = true;
            }
            // If choice is 's', shouldCreateIssue remains false
        }

        if (shouldCreateIssue) {
            try {
                logger.info(`🚀 Creating GitHub issue: "${issue.title}"`);

                // Format issue body with additional details
                const issueBody = formatIssueBody(issue);

                // Create labels based on priority and category
                const labels = [
                    `priority-${issue.priority}`,
                    `category-${issue.category}`,
                    'review'
                ];

                const createdIssue = await createIssue(issue.title, issueBody, labels);
                createdIssues.push({
                    issue,
                    githubUrl: createdIssue.html_url,
                    number: createdIssue.number
                });

                logger.info(`✅ Created GitHub issue #${createdIssue.number}: ${createdIssue.html_url}`);
            } catch (error: any) {
                logger.error(`❌ Failed to create GitHub issue for "${issue.title}": ${error.message}`);
            }
        }
    }

    // Return formatted results
    if (createdIssues.length > 0) {
        return formatReviewResultsWithIssues(result, createdIssues);
    } else {
        return formatReviewResults(result);
    }
}; 