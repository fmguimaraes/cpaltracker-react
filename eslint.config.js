import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Ported from cpaltracker.ui-reference (feature UI-Remediation FR4, KAN-223).
 *
 * BLOCKING since FR13/FR16 (KAN-229): the guideline rules are errors everywhere, so the app
 * config is the reference config (src/ui is held to the COLOR rules only).
 *
 * FR10 enforcement (visual guideline). Two scopes:
 *  - COLOR rules: everywhere in src/** (tokens.css is CSS, so never linted).
 *  - STRUCTURE rules (raw elements, radix imports, inline style, arbitrary lengths):
 *    src/** except src/ui/** and src/styles/**.
 * `no-restricted-syntax` is replaced, not merged, per config block, so the structure
 * block repeats the color selectors.
 * lint-fixtures/ is ignored by `npm run lint`; `npm run lint:fixtures` lints it with
 * --no-ignore and lint-fixtures/check.mjs asserts every rule reports.
 */
const COLOR_FN = '(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)'
const colorSelectors = ['Literal', 'TemplateElement'].flatMap((node) => {
  const v = node === 'Literal' ? 'value' : 'value.raw'
  return [
    {
      selector: `${node}[${v}=/#[0-9a-fA-F]{3,8}\\b/]`,
      message: '[FR10-color-literal] No hard-coded color: use a token (bg-card, text-muted-foreground, ...).',
    },
    {
      selector: `${node}[${v}=/\\b${COLOR_FN}\\(/]`,
      message: '[FR10-color-literal] No rgb()/hsl()/oklch() color literal: use a token.',
    },
    {
      selector: `${node}[${v}=/\\b(bg|text|border|ring|fill|stroke|shadow|outline|from|via|to|decoration|accent|caret|divide)-\\[(#|rgb|hsl|oklch|color:|var)/]`,
      message: '[FR10-arbitrary-color] No arbitrary Tailwind color: add a token or use a token utility.',
    },
  ]
})

const structureSelectors = [
  {
    selector: 'JSXOpeningElement[name.name=/^(button|input|select|textarea|table|dialog)$/]',
    message: '[FR10-raw-element] Raw interactive element: use the kit component from @/ui.',
  },
  {
    selector: "JSXAttribute[name.name='style']",
    message: '[FR10-inline-style] No inline style: use token classes.',
  },
  ...['Literal', 'TemplateElement'].map((node) => ({
    selector: `${node}[${node === 'Literal' ? 'value' : 'value.raw'}=/(^|[\\s:])-?[a-z][a-z-]*-\\[[-+]?(\\d|\\.\\d|(calc|min|max|clamp|var)\\()/]`,
    message: '[FR10-arbitrary-length] No arbitrary Tailwind length: use the spacing scale or add a token.',
  })),
]

const radixImports = {
  patterns: [
    {
      group: ['radix-ui', 'radix-ui/*', '@radix-ui/*'],
      message: '[FR10-radix-import] Import from @/ui, not from radix-ui directly.',
    },
  ],
}

const fixtureFiles = ['lint-fixtures/**/*.tsx']

/** Severity of the guideline rules outside src/ui and src/styles (blocking since FR13). */
const REPORT = 'error'

/** jsx-a11y recommended, at REPORT severity outside the kit. */
const a11yReport = Object.fromEntries(
  Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, REPORT]),
)

export default tseslint.config(
  { ignores: ['dist', 'dist-e2e-*', 'node_modules', 'lint-fixtures/**', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}', ...fixtureFiles],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-syntax': ['error', ...colorSelectors],
    },
  },
  {
    files: ['src/**/*.tsx', ...fixtureFiles],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['src/**/*.{ts,tsx}', ...fixtureFiles],
    ignores: ['src/ui/**', 'src/styles/**'],
    rules: {
      'no-restricted-imports': [REPORT, radixImports],
      'no-restricted-syntax': [REPORT, ...colorSelectors, ...structureSelectors],
    },
  },
  {
    files: ['src/**/*.tsx', ...fixtureFiles],
    ignores: ['src/ui/**', 'src/styles/**'],
    rules: a11yReport,
  },
  {
    files: ['e2e/**/*.ts', '*.config.{js,ts}', 'lint-fixtures/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
