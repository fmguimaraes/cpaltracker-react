import * as React from "react"
import { Slot } from "radix-ui"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/ui/field"

/**
 * react-hook-form + zod wiring for the Field components.
 *   const form = useForm({ resolver: zodResolver(schema) })
 *   <Form {...form}><form onSubmit={form.handleSubmit(...)}>
 *     <FormField control={form.control} name="x" render={({ field }) => (
 *       <FormItem><FormLabel>X</FormLabel><FormControl><Input {...field} /></FormControl>
 *       <FormDescription>help</FormDescription><FormMessage /></FormItem>)} />
 * FormControl sets id, aria-invalid and aria-describedby (help + error); FormMessage is role="alert".
 */
const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName }

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)
const FormItemContext = React.createContext<{ id: string; hasDescription: boolean; setHasDescription: (v: boolean) => void } | null>(null)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, control } = useFormContext()
  if (!fieldContext || !itemContext) throw new Error("useFormField must be used inside <FormField> and <FormItem>")
  const formState = useFormState({ control, name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)
  const { id, hasDescription } = itemContext
  return {
    id,
    hasDescription,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<typeof Field>) {
  const id = React.useId()
  const [hasDescription, setHasDescription] = React.useState(false)
  const fieldContext = React.useContext(FormFieldContext)
  const { getFieldState, control } = useFormContext()
  const formState = useFormState({ control, name: fieldContext?.name })
  const invalid = fieldContext ? !!getFieldState(fieldContext.name, formState).error : false
  return (
    <FormItemContext.Provider value={{ id, hasDescription, setHasDescription }}>
      <Field data-slot="form-item" data-invalid={invalid || undefined} className={cn("gap-2", className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof FieldLabel>) {
  const { formItemId } = useFormField()
  return <FieldLabel data-slot="form-label" htmlFor={formItemId} className={cn("text-foreground", className)} {...props} />
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId, hasDescription } = useFormField()
  const describedBy = [hasDescription && formDescriptionId, error && formMessageId].filter(Boolean).join(" ") || undefined
  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={describedBy}
      aria-invalid={!!error}
      {...props}
    />
  )
}

function FormDescription({ ...props }: React.ComponentProps<typeof FieldDescription>) {
  const { formDescriptionId } = useFormField()
  const setHas = React.useContext(FormItemContext)?.setHasDescription
  React.useEffect(() => {
    setHas?.(true)
    return () => setHas?.(false)
  }, [setHas])
  return <FieldDescription data-slot="form-description" id={formDescriptionId} {...props} />
}

function FormMessage({ children, ...props }: React.ComponentProps<typeof FieldError>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? "") : children
  if (!body) return null
  return (
    <FieldError data-slot="form-message" id={formMessageId} {...props}>
      {body}
    </FieldError>
  )
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField, zodResolver }
