'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { usePipelineStream } from '@/hooks/usePipelineStream';
import { RunHeader } from '@/components/pipeline-runs/RunHeader';
import { StepsTimeline } from '@/components/pipeline-runs/StepsTimeline';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PipelineRunDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { run, steps, connected, ended, error } = usePipelineStream(id);

  return (
    <div className="space-y-5">
      {/* Back link + connection status */}
      <div className="flex items-center justify-between">
        <Link
          href="/pipeline-runs"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Pipeline Runs
        </Link>
        {run && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {ended ? (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Stream ended</span>
              </>
            ) : connected ? (
              <>
                <Wifi className="h-3 w-3 text-[var(--info)]" />
                <span>Live</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--info)] animate-pulse" />
              </>
            ) : error ? (
              <>
                <WifiOff className="h-3 w-3 text-[var(--destructive)]" />
                <span className="text-[var(--destructive)]">{error}</span>
              </>
            ) : (
              <span>Connecting…</span>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {!run && !error && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin" />
        </div>
      )}

      {/* Not found */}
      {error && !run && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--destructive)]/30 p-10 text-center">
          <p className="text-sm text-[var(--destructive)] font-semibold">{error}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Run {id} could not be loaded.
          </p>
        </div>
      )}

      {/* Main content */}
      {run && (
        <>
          <RunHeader run={run} steps={steps} />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3 px-1">
              Steps Timeline
            </h2>
            <StepsTimeline steps={steps} />
          </div>
        </>
      )}
    </div>
  );
}
