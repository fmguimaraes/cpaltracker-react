import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FormControl } from "@/ui/form";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/ui/input-group";

type PasswordInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  "type"
> & {
  /** Accessible names of the show/hide control, in the language of the page (X-COPY). */
  showLabel: string;
  hideLabel: string;
};

/** Password field with a show/hide toggle. Must sit inside a `FormItem` (FormControl wires id/aria). */
export function PasswordInput({
  showLabel,
  hideLabel,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <FormControl>
        <InputGroupInput type={visible ? "text" : "password"} {...props} />
      </FormControl>
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
