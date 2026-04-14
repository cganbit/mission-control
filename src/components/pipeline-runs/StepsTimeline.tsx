'use client';

import { StepCard } from './StepCard';
import type { PipelineStep } from '@/hooks/usePipelineStream';

interface StepsTimelineProps {
  steps: PipelineStep[];
}

export function StepsTimeline({ steps }: StepsTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--text-muted)]">
        No steps registered for this run yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <StepCard key={step.step_id} step={step} index={i} totalSteps={steps.length} />
      ))}
    </div>
  );
}
