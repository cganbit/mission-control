// PRD-040 Camada 2 — pure function classifier for GitHub webhook events.
// Zero external calls. Unit-testable. Used by webhook receiver on insert.

export type Classification = 'trivial_fix' | 'needs_human' | 'noise';

export interface GitHubEventInput {
  event_type: string;   // 'issues', 'pull_request', 'push', 'ping', etc.
  action?: string;      // 'opened', 'closed', 'reopened', etc.
  title?: string;       // issue/PR title
  body?: string;        // issue/PR body
  labels?: string[];    // issue/PR label names
}

// Noise: events that carry no actionable signal (lifecycle churn or pings).
const NOISE_ACTIONS = new Set(['closed', 'reopened', 'assigned', 'unassigned', 'labeled', 'unlabeled', 'synchronize', 'converted_to_draft']);

// Trivial-fix: text patterns indicating low-effort / mechanical changes.
const TRIVIAL_REGEX =
  /\b(typo|fix\s+typo|lint|formatting|prettier|whitespace|trailing\s+newline|flaky\s+test|retry\s+flaky|readme|docs?:?\s*(fix|typo|update))\b/i;

// Trivial-fix: labels that signal small/chore work.
const TRIVIAL_LABELS = new Set([
  'good first issue',
  'trivial',
  'docs',
  'chore',
  'documentation',
]);

export function classifyEvent(input: GitHubEventInput): Classification {
  const { event_type, action, title = '', body = '', labels = [] } = input;

  // Noise: ping events are connectivity checks, not real work items.
  if (event_type === 'ping') return 'noise';

  // Noise: closed/reopened actions without clear fix content — lifecycle signal only.
  if (action && NOISE_ACTIONS.has(action)) {
    // Still check trivial patterns in case the action carries fix context.
    // If nothing matches trivial we consider it noise.
    const hasLabel = labels.some((l) => TRIVIAL_LABELS.has(l.toLowerCase()));
    const hasTextMatch = TRIVIAL_REGEX.test(title) || TRIVIAL_REGEX.test(body);
    if (!hasLabel && !hasTextMatch) return 'noise';
  }

  // Trivial-fix: label match (highest signal — human-curated).
  if (labels.some((l) => TRIVIAL_LABELS.has(l.toLowerCase()))) return 'trivial_fix';

  // Trivial-fix: title/body regex match.
  if (TRIVIAL_REGEX.test(title) || TRIVIAL_REGEX.test(body)) return 'trivial_fix';

  // Default: needs human review.
  return 'needs_human';
}
