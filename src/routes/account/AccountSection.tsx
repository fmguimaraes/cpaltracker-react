import type { ReactNode } from "react";

/** PAT-SETTINGS section (ref: showcase/patterns/Settings.tsx): heading, optional feedback, then the form. */
export function AccountSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5" data-testid={testId}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
