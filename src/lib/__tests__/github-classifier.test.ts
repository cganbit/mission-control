import { describe, it, expect } from 'vitest';
import { classifyEvent } from '../github-classifier';

describe('classifyEvent', () => {
  // --- noise ---
  it('classifies ping as noise', () => {
    expect(classifyEvent({ event_type: 'ping' })).toBe('noise');
  });

  it('classifies issue closed with no trivial content as noise', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'closed',
        title: 'Critical bug in payment flow',
        labels: ['bug'],
      })
    ).toBe('noise');
  });

  it('classifies PR synchronize as noise', () => {
    expect(
      classifyEvent({
        event_type: 'pull_request',
        action: 'synchronize',
        title: 'Feature: add OAuth',
      })
    ).toBe('noise');
  });

  // --- trivial_fix ---
  it('classifies "Fix typo in README" title as trivial_fix', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'opened',
        title: 'Fix typo in README',
      })
    ).toBe('trivial_fix');
  });

  it('classifies docs label as trivial_fix', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'opened',
        title: 'Update changelog',
        labels: ['docs'],
      })
    ).toBe('trivial_fix');
  });

  it('classifies "good first issue" label as trivial_fix', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'opened',
        title: 'Small UX improvement',
        labels: ['good first issue'],
      })
    ).toBe('trivial_fix');
  });

  it('classifies body containing "prettier formatting" as trivial_fix', () => {
    expect(
      classifyEvent({
        event_type: 'pull_request',
        action: 'opened',
        title: 'Cleanup',
        body: 'Apply prettier formatting across the codebase',
      })
    ).toBe('trivial_fix');
  });

  it('classifies "chore" label as trivial_fix', () => {
    expect(
      classifyEvent({
        event_type: 'pull_request',
        action: 'opened',
        title: 'Bump dependencies',
        labels: ['chore'],
      })
    ).toBe('trivial_fix');
  });

  // --- needs_human ---
  it('classifies "Critical bug in checkout" as needs_human', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'opened',
        title: 'Critical bug in checkout',
        labels: ['bug'],
      })
    ).toBe('needs_human');
  });

  it('classifies "Memory leak" with bug label as needs_human', () => {
    expect(
      classifyEvent({
        event_type: 'issues',
        action: 'opened',
        title: 'Memory leak in worker process',
        labels: ['bug'],
      })
    ).toBe('needs_human');
  });

  it('classifies push event with no trivial markers as needs_human', () => {
    expect(
      classifyEvent({
        event_type: 'push',
        title: 'Add OAuth provider integration',
      })
    ).toBe('needs_human');
  });
});
