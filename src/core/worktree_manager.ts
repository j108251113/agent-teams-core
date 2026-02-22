import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Manages git worktrees for agent task isolation.
 */
export class WorktreeManager {
    constructor(
        private repoRoot: string,
        private worktreesDir: string
    ) { }

    /**
     * Creates a new worktree at the specified path with a given branch.
     */
    async create(path: string, branch: string): Promise<void> {
        // Check if branch already exists
        const branchExists = execSync('git branch --list ' + branch, { cwd: this.repoRoot }).toString().trim() !== '';

        const command = branchExists
            ? `git worktree add "${path}" "${branch}"`
            : `git worktree add -b "${branch}" "${path}"`;

        try {
            execSync(command, { cwd: this.repoRoot, stdio: 'pipe' });
        } catch (error: any) {
            const stderr = error.stderr?.toString() || Buffer.from(error.message).toString();
            throw new Error(`Failed to create worktree: ${stderr}`);
        }
    }

    /**
     * Removes a worktree and its associated branch.
     */
    async remove(path: string): Promise<void> {
        if (!existsSync(path)) return;

        try {
            // Find the branch associated with this worktree path using 'git worktree list'
            const listOutput = execSync('git worktree list --porcelain', { cwd: this.repoRoot }).toString();
            const lines = listOutput.split('\n');
            let branchName = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line?.startsWith('worktree ') && line.includes(path.replace(/\\/g, '/'))) {
                    // The next line(s) might contain the branch
                    const branchLine = lines[i + 2];
                    if (branchLine?.startsWith('branch ')) {
                        branchName = branchLine.substring('branch '.length).trim();
                        break;
                    }
                }
            }

            try {
                execSync(`git worktree remove "${path}" --force`, { cwd: this.repoRoot, stdio: 'pipe' });
            } catch (error: any) {
                const stderr = error.stderr?.toString() || '';
                // On Windows, it often fails to delete the directory even if the worktree is removed from Git
                if (!stderr.includes('Directory not empty') && !stderr.includes('already exists')) {
                    throw error;
                }
            }

            // Fallback cleanup if directory still exists (common on Windows)
            if (existsSync(path)) {
                try {
                    execSync('git worktree prune', { cwd: this.repoRoot });
                    // Try manual rmSync only if really needed, but it might also fail if locked
                    // rmSync(path, { recursive: true, force: true });
                } catch (e) {
                    // Ignore cleanup errors
                }
            }

            // Delete the branch if it's not the main branch and we found it
            if (branchName && !branchName.endsWith('/main') && !branchName.endsWith('main')) {
                // Extract short branch name if it's full ref
                const shortBranch = branchName.replace('refs/heads/', '');
                if (shortBranch !== 'main') {
                    try {
                        execSync(`git branch -D "${shortBranch}"`, { cwd: this.repoRoot, stdio: 'pipe' });
                    } catch (e) {
                        // Ignore branch deletion errors if it's already gone
                    }
                }
            }
        } catch (error: any) {
            const stderr = error.stderr?.toString() || Buffer.from(error.message).toString();
            throw new Error(`Failed to remove worktree: ${stderr}`);
        }
    }
}
