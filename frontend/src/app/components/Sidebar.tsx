"use client";

export default function Sidebar() {
  return (
    <nav
      className="w-52 flex-shrink-0 border-r flex flex-col"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-dark)" }}>
          Armor<span style={{ color: "var(--primary)" }}>IQ</span>
        </h1>
        <p className="text-xs mt-0.5 font-light" style={{ color: "var(--text-light)" }}>
          Guarded AI Agent
        </p>
      </div>

      {/* Nav links */}
      <div className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        <NavLink href="/" label="Chat" />
        <NavLink href="/policies" label="Policies" />
        <NavLink href="/servers" label="MCP Servers" />
        <NavLink href="/logs" label="Logs" />
      </div>

      {/* Status */}
      <div
        className="px-5 py-3 border-t text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-light)" }}
      >
        <div id="health-indicator" className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: "var(--success)" }}
          />
          Backend Connected
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
      style={{ color: "var(--text-medium)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-dark)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-medium)";
      }}
    >
      {label}
    </a>
  );
}
