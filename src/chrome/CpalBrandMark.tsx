import { useTheme } from '@/app/theme'

/**
 * The c-PAL wordmark in the shell's sidebar header. The variant follows the resolved
 * theme (white mark on dark, black mark on light). Sized by height, not a fixed width —
 * the sidebar header widened to fit the wordmark's own aspect ratio legibly (KAN-171/217/224,
 * superseding the old fixed-28px icon mark), centered alone in the header (no label beside it).
 * Hidden in the collapsed icon rail: there is no square icon-only variant of this wordmark to show there.
 */
export function CpalBrandMark() {
  const { resolved } = useTheme()
  const src = resolved === 'dark' ? '/c-pal-white-transparent.png' : '/c-pal-black-transparent.png'
  return (
    <img
      src={src}
      alt="c-PAL"
      data-testid="cpal-brand-mark"
      className="h-5 w-auto shrink-0 group-data-[collapsible=icon]:hidden max-md:h-7"
    />
  )
}
