import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/theme";
import { Button } from "@/ui/button";

interface AuthLayoutProps {
  title: string;
  /** Accessible names of the theme toggle, in the language of the page (no translation, X-COPY). */
  themeLabels: { toLight: string; toDark: string };
  children: ReactNode;
}

/**
 * PAT-AUTH shell (ref: showcase/patterns/auth/AuthLayout.tsx): flat background, logo left,
 * narrow form column right (stacked below 768 px), footer with the theme toggle.
 * The reference's English legal links are not carried over: they are copy the monolith never had.
 */
export function AuthLayout({ title, themeLabels, children }: AuthLayoutProps) {
  const { resolved, setTheme } = useTheme();
  const logo =
    resolved === "dark" ? "/logo-cpal-orange.png" : "/logo-cpal-dark.png";
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <div className="flex min-h-svh flex-col bg-background text-body">
      <main className="flex flex-1 flex-col items-center gap-8 px-6 pt-10 md:flex-row md:items-start md:justify-center md:gap-20 md:pt-24">
        <img
          src={logo}
          alt="c-PAL"
          className="h-12 w-auto md:h-28 md:self-start"
        />
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-medium">{title}</h1>
          {children}
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 py-4 text-xs text-muted-foreground">
        <span>© 2026 c-PAL</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            next === "light" ? themeLabels.toLight : themeLabels.toDark
          }
          data-testid="auth-theme-toggle"
          onClick={() => setTheme(next)}
        >
          {resolved === "dark" ? <Sun /> : <Moon />}
        </Button>
      </footer>
    </div>
  );
}
