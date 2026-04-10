'use client';

interface FilterBarProps {
  project: string;
  projects: string[];
  onProjectChange: (p: string) => void;
  sprintFrom?: number;
  sprintTo?: number;
  onSprintFromChange?: (v: number | undefined) => void;
  onSprintToChange?: (v: number | undefined) => void;
}

export default function FilterBar({
  project,
  projects,
  onProjectChange,
  sprintFrom,
  sprintTo,
  onSprintFromChange,
  onSprintToChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">Projeto</label>
        <select
          value={project}
          onChange={e => onProjectChange(e.target.value)}
          className="bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-1.5 border border-[var(--border)] focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
        >
          <option value="">Todos</option>
          {projects.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">Sprint</label>
        <input
          type="number"
          placeholder="De"
          value={sprintFrom ?? ''}
          onChange={e => onSprintFromChange?.(e.target.value ? Number(e.target.value) : undefined)}
          className="w-16 bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm rounded-lg px-2 py-1.5 border border-[var(--border)] focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
        />
        <span className="text-xs text-[var(--text-muted)]">–</span>
        <input
          type="number"
          placeholder="Até"
          value={sprintTo ?? ''}
          onChange={e => onSprintToChange?.(e.target.value ? Number(e.target.value) : undefined)}
          className="w-16 bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm rounded-lg px-2 py-1.5 border border-[var(--border)] focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
        />
      </div>
    </div>
  );
}
