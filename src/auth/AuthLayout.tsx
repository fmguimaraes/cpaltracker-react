import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/theme";
import { Button } from "@/ui/button";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  /** Accessible names of the theme toggle, in the language of the page (no translation, X-COPY). */
  themeLabels: { toLight: string; toDark: string };
  children: ReactNode;
}

/**
 * PAT-AUTH shell (ref: showcase/patterns/auth/AuthLayout.tsx), split-screen variant: a
 * brand panel (logo + tagline) on `bg-secondary`, a narrow form column on `bg-background`,
 * stacked below 768 px, footer with the theme toggle. Colors still come from the existing
 * tokens (`styles/tokens.css`) — only the structure changed, not the theme.
 * The reference's English legal links are not carried over: they are copy the monolith never had.
 */
export function AuthLayout({
  title,
  subtitle,
  themeLabels,
  children,
}: AuthLayoutProps) {
  const { resolved, setTheme } = useTheme();
  const logo =
    resolved === "dark"
      ? "/c-pal-white-transparent.png"
      : "/c-pal-black-transparent.png";
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <div className="flex min-h-svh flex-col bg-background text-body">
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="flex flex-col justify-between gap-12 bg-secondary px-6 py-10 md:w-2/5 md:px-12 md:py-14 lg:w-1/2">
          <img src={logo} alt="c-PAL" className="h-6 w-auto self-start" />
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold text-foreground">
              c-PAL connection
            </h2>
            <p className="mt-3 text-body">
              Palettes connectées, données de transport et d&apos;écoulement
              de vos lots, en continu.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <h1 className={subtitle ? "text-xl font-medium" : "mb-6 text-xl font-medium"}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 mb-6 text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
