import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { AuthLayout } from "../auth/AuthLayout";
import { AuthLink } from "../auth/AuthLink";
import { PasswordInput } from "../auth/PasswordInput";
import { FORGOT_PASSWORD_PATH, LOGIN_PATH } from "../auth/paths";
import {
  isTokenTerminalOutcome,
  mapResetPasswordOutcome,
} from "../auth/resetPasswordOutcome";

/**
 * KAN-148 — Reset Password Flow (FR4-FR8, NFR4, NFR7).
 *
 * FR4/NFR4: the `t` token is read from the URL once, into component state
 * (not re-read from `location.search` on every render) and never shown as
 * page text, logged, or written to any persisted storage; a
 * `<meta name="referrer">` of `no-referrer` is installed for the lifetime
 * of this screen only, to stop it leaking via the `Referer` header of any
 * third-party resource this page might load.
 * FR5: match-check is the only client-side password rule — FR6 forbids
 * re-implementing the NIST/HIBP policy itself, so length/strength are
 * left entirely to the server's verbatim rejection text.
 * FR7: `resetPasswordOutcome.ts`'s `invalidToken`/`ipThrottle` buckets are
 * both token-terminal (the link itself can't be redeemed) — this mirrors
 * `reset_password.php`'s own `$compte === null` branch: hide the form,
 * show the (already distinct, server-authored) message, and offer a link
 * to request a new one. Every other outcome (`weakPassword`,
 * `invalidRequest`, `serviceUnavailable`) is recoverable — the form stays
 * up with an inline error banner, matching that same legacy page's
 * `$compte !== null` branch.
 * FR8: success replaces the form with a confirmation stating the password
 * changed and that every other session/API token was revoked (NFR8), with
 * a route to log in.
 */

interface ResetPasswordFormValues {
  password: string;
  confirmation: string;
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("t")?.trim() ?? "");
  const [tokenProblem, setTokenProblem] = useState<string | null>(
    token === ""
      ? "Lien incomplet. Reprenez le message reçu par e-mail."
      : null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    mode: "onChange",
    defaultValues: { password: "", confirmation: "" },
  });
  const {
    handleSubmit,
    watch,
    formState: { isSubmitting, isValid },
  } = form;

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await apiClient.post("/auth/reset-password.php", { token, password });
      setSuccess(true);
    } catch (err) {
      const mapped = mapResetPasswordOutcome(err);
      if (isTokenTerminalOutcome(mapped.outcome)) {
        setTokenProblem(mapped.message);
      } else {
        setFormError(mapped.message);
      }
    }
  });

  const layoutProps = {
    title: "Nouveau mot de passe",
    themeLabels: {
      toLight: "Passer au thème clair",
      toDark: "Passer au thème sombre",
    },
  };

  if (success) {
    return (
      <AuthLayout {...layoutProps}>
        <div className="flex flex-col gap-6">
          <Alert
            variant="success"
            role="status"
            aria-live="polite"
            data-testid="reset-password-success"
          >
            <AlertDescription>
              Votre mot de passe a été modifié. Toutes vos autres sessions ont
              été fermées — reconnectez-vous avec votre nouveau mot de passe.
            </AlertDescription>
          </Alert>
          <AuthLink to={LOGIN_PATH} data-testid="reset-password-login-link">
            Se connecter
          </AuthLink>
        </div>
      </AuthLayout>
    );
  }

  if (tokenProblem) {
    return (
      <AuthLayout {...layoutProps}>
        <div className="flex flex-col gap-6">
          <Alert
            variant="danger"
            aria-live="assertive"
            data-testid="reset-password-token-problem"
          >
            <AlertDescription>{tokenProblem}</AlertDescription>
          </Alert>
          <AuthLink
            to={FORGOT_PASSWORD_PATH}
            data-testid="reset-password-request-new-link"
          >
            Demander un nouveau lien
          </AuthLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...layoutProps}>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={onSubmit}
          data-testid="reset-password-form"
        >
          {formError && (
            <Alert
              variant="danger"
              aria-live="assertive"
              data-testid="reset-password-form-error"
            >
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="password"
            rules={{ required: "Mot de passe requis.", deps: ["confirmation"] }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nouveau mot de passe</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel="Afficher les caractères"
                  hideLabel="Masquer les caractères"
                  autoComplete="new-password"
                  data-testid="reset-password-password"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="reset-password-password-error"
                />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmation"
            rules={{
              required: "Confirmation requise.",
              validate: (value) =>
                value === watch("password") || "Les deux saisies diffèrent.",
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmer le mot de passe</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel="Afficher les caractères"
                  hideLabel="Masquer les caractères"
                  autoComplete="new-password"
                  data-testid="reset-password-confirmation"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="reset-password-confirmation-error"
                />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={!isValid}
            loading={isSubmitting}
            data-testid="reset-password-submit"
          >
            Enregistrer
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
