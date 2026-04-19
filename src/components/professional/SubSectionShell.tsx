import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SubSectionShellProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * Inner collapsible card matching the visual style of the screenshot reference:
 * icon + bold title + small description on the left, ChevronDown on the right.
 * Used as a nested sub-section inside a professional row.
 */
export default function SubSectionShell({ icon: Icon, title, description, children, defaultOpen = false }: SubSectionShellProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground block">{title}</span>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-2"
        style={{ background: "hsl(var(--surface))" }}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
