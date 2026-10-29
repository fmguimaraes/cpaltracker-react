import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
 * KAN-152 (FR13). Client-side validation only GATES submission (rejects an
 * obviously wrong format inline) — it never computes the stored E.164
 * value itself; the raw, trimmed input is sent as-is and
 * `account_logic.php`'s `cpal_compte_changer_telephone` remains the one
 * place that normalizes a French national number to E.164. An empty
 * submission is a valid "clear the number" action, not an error.
 */
interface PhoneFormValues {
  currentPassword: string;
  phone: string;
}

function isAcceptablePhoneFormat(value: string): boolean {
  const stripped = value.replace(/[\s.()-]/g, "");
  if (stripped === "") return true;
  if (/^0[1-9][0-9]{8}$/.test(stripped)) return true;
  return /^\+[1-9][0-9]{7,14}$/.test(stripped);
}

export function PhoneForm({ account }: { account: Account }) {
  const { updateAccount } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useForm<PhoneFormValues>({
    mode: "onSubmit",
    defaultValues: { currentPassword: "", phone: account.telephone ?? "" },
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async ({ currentPassword, phone }) => {
    setFormError(null);
    setSuccess(null);
    try {
      await updateAccount({ currentPassword, phone: phone.trim() });
      const message =
        phone.trim() === "" ? "Numéro supprimé." : "Numéro enregistré.";
      setSuccess(message);
      toast.success(message);
      reset({ currentPassword: "", phone: phone.trim() });
    } catch (err) {
      setFormError(mapAccountActionOutcome(err).message);
    }
  });

  return (
    <AccountSection title="Téléphone" testId="account-phone-section">
      {success && (
        <Alert
          variant="success"
          role="status"
          aria-live="polite"
          data-testid="account-phone-success"
        >
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={onSubmit}
          data-testid="account-phone-form"
        >
          {formError && (
            <Alert
              variant="danger"
              aria-live="assertive"
              data-testid="account-phone-form-error"
            >
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="phone"
            rules={{
              validate: (value) =>
                isAcceptablePhoneFormat(value) ||
                "Format attendu : +33612345678 (indicatif pays compris).",
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numéro</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    placeholder="+33612345678"
                    data-testid="account-phone-number"
                  />
                </FormControl>
                <FormDescription>
                  Format international. Laissez vide pour supprimer le numéro.
                </FormDescription>
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-phone-number-error"
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
                  data-testid="account-phone-current-password"
                />
                <FormMessage
                  aria-live="assertive"
                  data-testid="account-phone-current-password-error"
                />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="self-start"
            loading={isSubmitting}
            data-testid="account-phone-submit"
          >
            Enregistrer le numéro
          </Button>
        </form>
      </Form>
    </AccountSection>
  );
}
