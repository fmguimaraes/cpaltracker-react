import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { PasswordInput } from "../../auth/PasswordInput";
import { AccountSection } from "./AccountSection";
import { mapAccountActionOutcome } from "../../auth/accountActionOutcome";
import { useAuth } from "../../auth/AuthContext";

/**
 * KAN-152 (FR11, FR12). On success: (a) renders the explicit "other open
 * sessions closed" message (FR12/GAP2) and (b) keeps the acting session
 * logged in — the latter via `AuthContext.updateAccount`'s own transparent
 * re-authentication (GAP5, stack-decision.md §11), not anything this form
 * does itself.
 */
interface PasswordFormValues {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
}

const SHOW_LABEL = "Afficher les caractères";
const HIDE_LABEL = "Masquer les caractères";
const SUCCESS_MESSAGE =
  "Mot de passe enregistré. Toutes vos autres sessions ont été fermées — vous restez connecté ici.";

export function PasswordForm() {
  const { updateAccount } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<PasswordFormValues>({
    mode: "onChange",
    defaultValues: {
      currentPassword: "",
      password: "",
      passwordConfirmation: "",
    },
  });
  const {
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, isValid },
  } = form;

  const onSubmit = handleSubmit(
    async ({ currentPassword, password, passwordConfirmation }) => {
      setFormError(null);
      setSuccess(false);
      try {
        await updateAccount({
          currentPassword,
          password,
          passwordConfirmation,
        });
        setSuccess(true);
        toast.success(SUCCESS_MESSAGE);
        reset();
      } catch (err) {
        setFormError(mapAccountActionOutcome(err).message);
      }
    },
  );

  return (
    <AccountSection title="Mot de passe" testId="account-password-section">
      {success && (
        <Alert
          variant="success"
          role="status"
          aria-live="polite"
          data-testid="account-password-success"
        >
          <AlertDescription>{SUCCESS_MESSAGE}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={onSubmit}
          data-testid="account-password-form"
        >
          {formError && (
            <Alert
              variant="danger"
              aria-live="assertive"
              data-testid="account-password-form-error"
            >
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="currentPassword"
            rules={{
              required: "Mot de passe actuel requis.",
              deps: ["password"],
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mot de passe actuel</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel={SHOW_LABEL}
                  hideLabel={HIDE_LABEL}
                  autoComplete="current-password"
                  data-testid="account-password-current"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-password-current-error"
                />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            rules={{
              required: "Nouveau mot de passe requis.",
              deps: ["passwordConfirmation"],
              validate: (value) =>
                value !== watch("currentPassword") ||
                "Le nouveau mot de passe doit être différent de l'ancien.",
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nouveau mot de passe</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel={SHOW_LABEL}
                  hideLabel={HIDE_LABEL}
                  autoComplete="new-password"
                  data-testid="account-password-new"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-password-new-error"
                />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="passwordConfirmation"
            rules={{
              required: "Confirmation requise.",
              validate: (value) =>
                value === watch("password") || "Les deux saisies diffèrent.",
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmer le nouveau mot de passe</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel={SHOW_LABEL}
                  hideLabel={HIDE_LABEL}
                  autoComplete="new-password"
                  data-testid="account-password-confirmation"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-password-confirmation-error"
                />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="self-start"
            disabled={!isValid}
            loading={isSubmitting}
            data-testid="account-password-submit"
          >
            Enregistrer le mot de passe
          </Button>
        </form>
      </Form>
    </AccountSection>
  );
}
