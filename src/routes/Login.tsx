import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/ui/form";
import { Input } from "@/ui/input";
import { AuthLayout } from "../auth/AuthLayout";
import { AuthLink } from "../auth/AuthLink";
import { PasswordInput } from "../auth/PasswordInput";
import { useAuth } from "../auth/AuthContext";
import { getAuthOutcomeMessage } from "../auth/authOutcome";
import { LOGIN_NOTICE_MESSAGES, parseLoginNotice } from "../auth/loginNotice";
import {
  CHANGE_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  HOME_PATH,
} from "../auth/paths";
import { sanitizeSuite } from "../auth/suite";

/**
 * KAN-145 — Login Screen & Credential Submission.
 * Covers FR1 (themed login form), FR4 (submit to /api/v1 auth endpoint via
 * the bearer-token `apiClient`), FR5 (block empty-field submission inline,
 * no request issued), NFR4 (no blocking work before first paint — the form
 * renders immediately; `AuthContext` bootstrap runs independently),
 * NFR5 (labeled, keyboard-navigable fields; errors announced via
 * `aria-live`) and NFR6 (styling from design tokens only — see
 * `src/theme/tokens.css`).
 *
 * KAN-149 adds FR2 (an already-authenticated bootstrap — or a login that
 * just succeeded — skips this form and redirects to the validated `suite`
 * target, else home) and the FR3/FR14 redirect-targeting it depends on
 * (`sanitizeSuite`, the `MustChangePassword` redirect to
 * `CHANGE_PASSWORD_PATH`). Single effect below, reacting to `status`/
 * `account`, so there is exactly one place that decides "where does an
 * authenticated visitor on this screen go" — no separate manual navigate on
 * submit success racing it.
 *
 * KAN-155 adds FR7/FR8/NFR9: on failure this screen never shows the raw
 * `{error:{code,message}}` body — it maps the thrown `ApiError` through
 * `mapAuthOutcome`/`getAuthOutcomeMessage` (`src/auth/authOutcome.ts`) to one
 * of a fixed set of non-revealing, French, anti-enumeration-safe messages.
 *
 * KAN-156 adds FR10/FR11: a one-time `?notice=` indicator — `'logged-out'`
 * right after an explicit logout, `'session-expired'` after the shared
 * session-loss interceptor dropped an authenticated session — rendered from
 * `src/auth/loginNotice.ts`'s validated `LoginNotice` union, same
 * query-param-driven style as `suite` above.
 *
 * KAN-146 adds a link to `FORGOT_PASSWORD_PATH` — otherwise that new screen
 * would be unreachable from normal navigation.
 */

interface LoginFormValues {
  email: string;
  password: string;
}

export function Login() {
  const { login, status, account } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const notice = parseLoginNotice(searchParams.get("notice"));
  const form = useForm<LoginFormValues>({
    mode: "onSubmit",
    defaultValues: { email: "", password: "" },
  });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  // FR2/FR3/FR14 — once a session is authenticated (bootstrap found one, or
  // a submit just succeeded), skip the form: send a MustChangePassword
  // account to the password-change route, otherwise to the validated
  // `suite` target, else home (replicates CB1).
  useEffect(() => {
    if (status !== "authenticated") return;
    if (account?.mustChangePassword) {
      navigate(CHANGE_PASSWORD_PATH, { replace: true });
      return;
    }
    const suite = sanitizeSuite(searchParams.get("suite"));
    navigate(suite || HOME_PATH, { replace: true });
  }, [status, account, searchParams, navigate]);

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      // FR7/FR8/NFR9 — mapped, non-revealing copy only; never the raw
      // backend message (see authOutcome.ts for why).
      setSubmitError(getAuthOutcomeMessage(err));
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      themeLabels={{
        toLight: "Switch to light theme",
        toDark: "Switch to dark theme",
      }}
    >
      <div className="flex flex-col gap-6">
        {notice && (
          <Alert
            variant="info"
            role="status"
            aria-live="polite"
            data-testid="login-notice"
          >
            <AlertDescription>{LOGIN_NOTICE_MESSAGES[notice]}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={onSubmit}
            data-testid="login-form"
          >
            <FormField
              control={form.control}
              name="email"
              rules={{
                validate: (value) =>
                  value.trim() !== "" || "Email is required.",
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      autoComplete="username"
                      data-testid="login-email"
                    />
                  </FormControl>
                  <FormMessage
                    aria-live="assertive"
                    data-testid="login-email-error"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              rules={{ required: "Password is required." }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <PasswordInput
                    {...field}
                    showLabel="Show characters"
                    hideLabel="Hide characters"
                    autoComplete="current-password"
                    data-testid="login-password"
                  />
                  <FormMessage
                    aria-live="assertive"
                    data-testid="login-password-error"
                  />
                </FormItem>
              )}
            />

            {submitError && (
              <Alert
                variant="danger"
                aria-live="assertive"
                data-testid="login-error"
              >
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              data-testid="login-submit"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>

            <AuthLink
              to={FORGOT_PASSWORD_PATH}
              data-testid="login-forgot-password-link"
            >
              Forgot password?
            </AuthLink>
          </form>
        </Form>
      </div>
    </AuthLayout>
  );
}
