import { useTheme } from '@/app/theme'

/**
 * The c-PAL brand logo in the shell's sidebar header. The variant follows the
 * resolved theme (orange mark on dark, dark mark on light). Height 48 px,
 * 40 px below the `max-md` breakpoint.
 */
export function CpalBrandMark() {
  const { resolved } = useTheme()
  const src = resolved === 'dark' ? '/logo-cpal-orange.png' : '/logo-cpal-dark.png'
  return (
    <img
      src={src}
      alt="c-PAL"
      data-testid="cpal-brand-mark"
      className="h-12 w-auto max-md:h-10"
    />
  )
}
