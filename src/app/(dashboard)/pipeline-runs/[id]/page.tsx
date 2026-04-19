'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PipelineProgress } from '@/components/pipeline-runs/PipelineProgress';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PipelineRunDetailPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div className="flex items-center justify-between">
        <Link
          href="/pipeline-runs"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Pipeline Runs
        </Link>
      </div>

      <PipelineProgress runId={id} />
    </div>
  );
}
