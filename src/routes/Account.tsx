import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { Toaster } from "@/ui/sonner";
import { PageHeader } from "@/ui/patterns/page-header";
import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "../auth/AuthLayout";
import { AuthLink } from "../auth/AuthLink";
import { HOME_PATH } from "../auth/paths";
import { EmailForm } from "./account/EmailForm";
import { PasswordForm } from "./account/PasswordForm";
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
 * phone/e-mail panels, the "back to app" link and the logout control,
 * rendering only the password form, matching `account.php`'s own
 * `$premiere` branch.
 */
export function Account() {
  const { account, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

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

  // Normal mode renders the page body only: AccountLayout wraps it in the shell (FR12).
  return (
    <>
      <PageHeader title="Mon compte" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:px-6">
        <PasswordForm />
        <Separator />
        <PhoneForm account={account} />
        <Separator />
        <EmailForm account={account} />
        <Separator />
        <div className="flex items-center justify-between">
          <AuthLink to={HOME_PATH} data-testid="account-back-to-app">
            Retour à l'application
          </AuthLink>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogout}
            loading={loggingOut}
            data-testid="account-logout"
          >
            Se déconnecter
          </Button>
        </div>
      </div>
      <Toaster />
    </>
  );
}
