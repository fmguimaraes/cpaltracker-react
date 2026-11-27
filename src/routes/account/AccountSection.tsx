import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One account section, styled like the device page's sections (`PilotageDeviceDetail` `Section`): a top
 * rule, a small uppercase heading, then the feedback and the form.
 */
export function AccountSection({
  title,
  testId,
  description,
  className,
  bare = false,
  children,
}: {
  title: string;
  testId: string;
  /** Optional one-line explanation under the heading. */
  description?: ReactNode;
  className?: string;
  /** No rule and no heading: the form sits inside a row that already names it. */
  bare?: boolean;
  children: ReactNode;
}) {
  if (bare) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-4", className)} data-testid={testId}>
        {children}
      </div>
    );
  }
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 border-t border-border pt-5 pb-6",
        className,
      )}
      aria-label={title}
      data-testid={testId}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
