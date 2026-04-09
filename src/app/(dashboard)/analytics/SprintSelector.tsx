'use client';

interface SprintSelectorProps {
  project: string;
  projects: string[];
  onProjectChange: (p: string) => void;
}

export default function SprintSelector({ project, projects, onProjectChange }: SprintSelectorProps) {
  return (
    <div className="flex items-center gap-3">
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
  );
}
