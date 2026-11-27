import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Toaster } from "@/ui/sonner";
import { ShellBreadcrumb } from "@/ui/patterns/shell-breadcrumb";
import { ShellPageTitle } from "@/ui/patterns/shell-title";
import { ThemeChoiceControl } from "@/ui/patterns/theme-toggle";
import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "../auth/AuthLayout";
import { EmailForm } from "./account/EmailForm";
import { PasswordForm } from "./account/PasswordForm";
import { AccountSection } from "./account/AccountSection";
import { PhoneForm } from "./account/PhoneForm";
import { isFirstConnection } from "./account/firstConnection";

/**
 * KAN-152 — Account Self-Service (FR9, FR10).
 *
 * FR9: mounted only behind `RequireAuth allowMustChangePassword` (App.tsx)
 * — the gate itself, including the anonymous-visit redirect with the
 * preserved return path, is `RequireAuth`'s existing job (KAN-149), not
 * reimplemented here.
 * FR10: first-connection mode is `mustChangePassword` (from the
 * authenticated account) OR a `?premiere` query flag — either hides the
 * phone/e-mail panels and the logout control, rendering only the password
 * form, matching `account.php`'s own `$premiere` branch.
 *
 * Normal mode is a read-first overview (identity, contact details, security,
 * appearance, session): each editable value has a "Modifier" button that
 * opens its form inline, one at a time (FR11: every change still asks for the
 * current password, inside the open form only).
 */
type Editor = "email" | "phone" | "password";

const ROLE_LABEL: Record<"admin" | "client", string> = {
  admin: "Administrateur",
  client: "Client",
};

/** One line of the overview: label + value (+ hint), an optional "Modifier", and its form when open. */
function AccountRow({
  label,
  value,
  hint,
  testId,
  editLabel,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  testId: string;
  /** Accessible name of the edit button ("Modifier l'adresse e-mail"). */
  editLabel?: string;
  open?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col" data-testid={testId}>
      <div className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className="truncate text-sm font-medium"
            data-testid={`${testId}-value`}
          >
            {value}
          </span>
          {hint && (
            <span className="text-xs text-muted-foreground">{hint}</span>
          )}
        </div>
        {onToggle && !open && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={editLabel}
            aria-expanded={false}
            onClick={onToggle}
            data-testid={`${testId}-edit`}
          >
            Modifier
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-border bg-muted/30 px-4 py-4">
          <div className="max-w-md">{children}</div>
        </div>
      )}
    </li>
  );
}

const ROWS_CLASS =
  "flex min-w-0 flex-col divide-y divide-border rounded-md border border-border";
export function Account() {
  const { account, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  // At most one editor open at a time, so "Mot de passe actuel" is only ever asked once on screen.
  const [editing, setEditing] = useState<Editor | null>(null);

  if (!account) {
    return null;
  }

  // Mirrors HelloWorld.tsx's own logout handling (KAN-156 review gate):
  // disabling the button while in flight is what actually prevents a
  // duplicate POST with an already-consumed token, not anything in
  // AuthContext alone; a thrown ApiError is swallowed — by the time it
  // could throw the user is already signed out locally and RequireAuth is
  // about to redirect them away.
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // intentionally ignored — see comment above
    } finally {
      setLoggingOut(false);
    }
  }

  const firstConnection = isFirstConnection(account, searchParams);

  // First connection stays shell-less (PAT-AUTH column, password form only); AccountLayout
  // renders no shell around it in that mode.
  if (firstConnection) {
    return (
      <AuthLayout
        title="Mon compte"
        themeLabels={{
          toLight: "Passer au thème clair",
          toDark: "Passer au thème sombre",
        }}
      >
        <div className="flex flex-col gap-6">
          <Alert
            variant="info"
            role="note"
            data-testid="account-first-connection-notice"
          >
            <AlertDescription>
              Choisissez votre mot de passe. Celui qui vous a été communiqué est
              provisoire. Tant qu'il n'est pas remplacé, l'application reste
              inaccessible.
            </AlertDescription>
          </Alert>
          <PasswordForm />
        </div>
        <Toaster />
      </AuthLayout>
    );
  }

  // Normal mode renders the page body only: AccountLayout wraps it in the shell (FR12). Same frame as the
  // device page: breadcrumb in the shell's top bar, then a 12-column grid of bordered sections.
  const name = `${account.prenom ?? ""} ${account.nom ?? ""}`.trim();
  const toggle = (editor: Editor) => () =>
    setEditing((current) => (current === editor ? null : editor));
  const close = () => setEditing(null);

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Mon compte</h1>
      <ShellPageTitle>
        <ShellBreadcrumb
          levels={[{ label: "Mon compte", testId: "breadcrumb-account" }]}
        />
      </ShellPageTitle>

      <div className="grid grid-cols-1 p-4 md:p-6 lg:grid-cols-12 lg:gap-x-10">
        <div className="flex min-w-0 flex-col lg:col-span-7 xl:col-span-8">
          <AccountSection title="Profil" testId="account-profile-section">
            <ul className={ROWS_CLASS}>
              <AccountRow
                label="Nom"
                value={name || "Non renseigné"}
                testId="account-name"
              />
              <AccountRow
                label="Rôle"
                value={ROLE_LABEL[account.role]}
                testId="account-role"
              />
            </ul>
          </AccountSection>

          <AccountSection title="Coordonnées" testId="account-contact-section">
            <ul className={ROWS_CLASS}>
              <AccountRow
                label="Adresse e-mail"
                value={account.mail}
                hint="C'est aussi votre identifiant de connexion."
                testId="account-email"
                editLabel="Modifier l'adresse e-mail"
                open={editing === "email"}
                onToggle={toggle("email")}
              >
                <EmailForm account={account} embedded onCancel={close} />
              </AccountRow>
              <AccountRow
                label="Téléphone"
                value={account.telephone || "Non renseigné"}
                testId="account-phone"
                editLabel="Modifier le numéro de téléphone"
                open={editing === "phone"}
                onToggle={toggle("phone")}
              >
                <PhoneForm account={account} embedded onCancel={close} />
              </AccountRow>
            </ul>
          </AccountSection>

          <AccountSection title="Sécurité" testId="account-security-section">
            <ul className={ROWS_CLASS}>
              <AccountRow
                label="Mot de passe"
                value={<span aria-label="Masqué">••••••••</span>}
                hint="Le changer ferme vos sessions ouvertes sur les autres appareils."
                testId="account-password"
                editLabel="Modifier le mot de passe"
                open={editing === "password"}
                onToggle={toggle("password")}
              >
                <PasswordForm embedded onCancel={close} />
              </AccountRow>
            </ul>
          </AccountSection>
        </div>

        {/* Below lg these sections join the single column, after the account details. */}
        <div className="flex min-w-0 flex-col lg:col-span-5 xl:col-span-4">
          <AccountSection
            title="Apparence"
            testId="account-theme-section"
            description="« Système » suit le réglage clair ou sombre de votre appareil."
          >
            <ThemeChoiceControl
              labels={{
                group: "Thème",
                light: "Clair",
                dark: "Sombre",
                system: "Système",
              }}
            />
          </AccountSection>
          <AccountSection
            title="Session"
            testId="account-session-section"
            description="Vous déconnecte de c-PAL sur cet appareil uniquement."
          >
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={handleLogout}
              loading={loggingOut}
              data-testid="account-logout"
            >
              Se déconnecter
            </Button>
          </AccountSection>
        </div>
      </div>
    </div>
  );
}
