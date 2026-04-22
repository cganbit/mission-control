export default function AdminDemoPage() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-wingx-accent">
          wingx Design Tokens
        </h1>
        <p className="mt-1 text-sm text-wingx-muted-foreground">
          Live showcase of{" "}
          <code className="font-mono text-wingx-primary">--wingx-*</code> tokens
          rendered via Tailwind utilities. Zero disruption to production routes.
        </p>
      </div>

      {/* Primary action card */}
      <div className="rounded-[var(--wingx-radius)] border border-wingx-border bg-wingx-card p-6 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-wingx-card-foreground">
          Primary &amp; Accent
        </h2>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded-[var(--wingx-radius-sm)] bg-wingx-primary text-wingx-primary-foreground font-medium hover:opacity-90 transition-opacity">
            bg-wingx-primary
          </button>
          <button className="px-4 py-2 rounded-[var(--wingx-radius-sm)] bg-wingx-accent text-wingx-accent-foreground font-medium hover:opacity-90 transition-opacity">
            bg-wingx-accent
          </button>
          <button className="px-4 py-2 rounded-[var(--wingx-radius-sm)] border border-wingx-ring text-wingx-primary font-medium hover:bg-wingx-secondary transition-colors">
            border-wingx-ring
          </button>
        </div>
      </div>

      {/* Status chips */}
      <div className="rounded-[var(--wingx-radius)] border border-wingx-border bg-wingx-card p-6 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-wingx-card-foreground">
          Status Chips
        </h2>
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wingx-success text-wingx-success-foreground text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            success
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wingx-destructive text-wingx-destructive-foreground text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            destructive
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wingx-warning text-wingx-warning-foreground text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            warning
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wingx-info text-wingx-info-foreground text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            info
          </span>
        </div>
      </div>

      {/* Muted surface */}
      <div className="rounded-[var(--wingx-radius)] border border-wingx-border bg-wingx-muted p-6 space-y-2 shadow-sm">
        <h2 className="text-lg font-semibold text-wingx-foreground">
          Muted Surface
        </h2>
        <p className="text-sm text-wingx-muted-foreground">
          <code className="font-mono">bg-wingx-muted</code> +{" "}
          <code className="font-mono">text-wingx-muted-foreground</code> — used
          for secondary panels, empty states, and de-emphasised content areas.
        </p>
      </div>

      {/* Token reference table */}
      <div className="rounded-[var(--wingx-radius)] border border-wingx-border bg-wingx-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-wingx-card-foreground mb-4">
          Token Reference
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-wingx-border">
              <th className="text-left py-2 pr-4 text-wingx-muted-foreground font-medium">
                Utility class
              </th>
              <th className="text-left py-2 text-wingx-muted-foreground font-medium">
                CSS variable
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wingx-border">
            {[
              ["bg-wingx-primary", "--wingx-primary"],
              ["bg-wingx-accent", "--wingx-accent"],
              ["bg-wingx-success", "--wingx-success"],
              ["bg-wingx-destructive", "--wingx-destructive"],
              ["bg-wingx-warning", "--wingx-warning"],
              ["bg-wingx-info", "--wingx-info"],
              ["border-wingx-border", "--wingx-border"],
              ["text-wingx-muted-foreground", "--wingx-muted-foreground"],
            ].map(([cls, cssVar]) => (
              <tr key={cls}>
                <td className="py-2 pr-4">
                  <code className="font-mono text-wingx-primary">{cls}</code>
                </td>
                <td className="py-2">
                  <code className="font-mono text-wingx-muted-foreground">
                    {cssVar}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
