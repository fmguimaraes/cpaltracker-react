import { useTheme } from '@/app/theme'

/**
 * The c-PAL brand logo in the shell's sidebar header. The variant follows the
 * resolved theme (orange mark on dark, dark mark on light). Fixed 28 px wide in the sidebar
 * header (it fits the collapsed rail, so it never resizes), 40 px high below `max-md`.
 */
export function CpalBrandMark() {
  const { resolved } = useTheme()
  const src = resolved === 'dark' ? '/logo-cpal-orange.png' : '/logo-cpal-dark.png'
  return (
    <img
      src={src}
      alt="c-PAL"
      data-testid="cpal-brand-mark"
      className="h-auto w-7 shrink-0 max-md:h-10 max-md:w-auto"
    />
  )
}
