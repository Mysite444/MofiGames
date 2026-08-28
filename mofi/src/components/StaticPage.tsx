import type { LucideIcon } from "lucide-react";

export function StaticPage({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="glass-strong flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <Icon size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-sm text-text-faint">{subtitle}</p>}
          </div>
        </div>

        <div className="glass flex flex-col gap-4 rounded-2xl p-6 text-sm leading-relaxed text-text-muted sm:p-8 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_strong]:text-white [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </div>
    </div>
  );
}
