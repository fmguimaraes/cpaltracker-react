import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { PasswordInput } from "../../auth/PasswordInput";
import { AccountSection } from "./AccountSection";
import { mapAccountActionOutcome } from "../../auth/accountActionOutcome";
import type { Account } from "../../auth/AuthContext";
import { useAuth } from "../../auth/AuthContext";

/**
 * KAN-152 (FR14). Lowercases/trims client-side, validates format and
 * rejects a value identical to the current address before ever submitting
 * — the API's own duplicate-with-another-account rejection (400
 * invalid_field) can only be known server-side and is rendered verbatim by
 * `accountActionOutcome.ts`. `GET`/`PATCH /account.php` never return
 * `MailVerifieAt` (it isn't part of the `Account` schema at all), so the
 * "becomes unverified" fact FR14 asks for is shown as a fixed line in the
 * success confirmation, not a live, persisted indicator.
 */
interface EmailFormValues {
  currentPassword: string;
  email: string;
}

const SUCCESS_MESSAGE = "Adresse enregistrée. Elle n'est pas encore vérifiée.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailForm({ account }: { account: Account }) {
  const { updateAccount } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<EmailFormValues>({
    mode: "onSubmit",
    defaultValues: { currentPassword: "", email: account.mail },
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async ({ currentPassword, email }) => {
    setFormError(null);
    setSuccess(false);
    const normalized = email.trim().toLowerCase();
    try {
      await updateAccount({ currentPassword, email: normalized });
      setSuccess(true);
      toast.success(SUCCESS_MESSAGE);
      reset({ currentPassword: "", email: normalized });
    } catch (err) {
      setFormError(mapAccountActionOutcome(err).message);
    }
  });

  return (
    <AccountSection title="Adresse de connexion" testId="account-email-section">
      {success && (
        <Alert
          variant="success"
          role="status"
          aria-live="polite"
          data-testid="account-email-success"
        >
          <AlertDescription>{SUCCESS_MESSAGE}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={onSubmit}
          data-testid="account-email-form"
        >
          {formError && (
            <Alert
              variant="danger"
              aria-live="assertive"
              data-testid="account-email-form-error"
            >
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="email"
            rules={{
              validate: (raw) => {
                const value = raw.trim().toLowerCase();
                if (value === "") return "Adresse e-mail requise.";
                if (!EMAIL_PATTERN.test(value))
                  return "Adresse e-mail invalide.";
                if (value === account.mail.trim().toLowerCase()) {
                  return "C'est déjà votre adresse actuelle.";
                }
                return true;
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nouvelle adresse e-mail</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    data-testid="account-email-address"
                  />
                </FormControl>
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-email-address-error"
                />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currentPassword"
            rules={{ required: "Mot de passe actuel requis." }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mot de passe actuel</FormLabel>
                <PasswordInput
                  {...field}
                  showLabel="Afficher les caractères"
                  hideLabel="Masquer les caractères"
                  autoComplete="current-password"
                  data-testid="account-email-current-password"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-email-current-password-error"
                />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="self-start"
            loading={isSubmitting}
            data-testid="account-email-submit"
          >
            Enregistrer l'adresse
          </Button>
        </form>
      </Form>
    </AccountSection>
  );
}
