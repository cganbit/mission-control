'use client';

interface SprintSelectorProps {
  project: string;
  projects: string[];
  onProjectChange: (p: string) => void;
}

export default function SprintSelector({ project, projects, onProjectChange }: SprintSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Projeto</label>
      <select
        value={project}
        onChange={e => onProjectChange(e.target.value)}
        className="bg-[#1e2430] text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-[#2d3748] focus:outline-none focus:border-amber-500/50 transition-colors"
      >
        <option value="">Todos</option>
        {projects.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
