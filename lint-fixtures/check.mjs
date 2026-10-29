// Proves each FR10 rule fails on lint-fixtures/violations.tsx (AC6). Exit 1 if any rule is silent.
import { ESLint } from 'eslint'

const EXPECTED = [
  'FR10-raw-element',
  'FR10-radix-import',
  'FR10-inline-style',
  'FR10-arbitrary-length',
  'FR10-arbitrary-color',
  'FR10-color-literal',
  'jsx-a11y/alt-text',
]

const eslint = new ESLint({ ignore: false })
const [result] = await eslint.lintFiles(['lint-fixtures/violations.tsx'])
const seen = new Set(result.messages.flatMap((m) => [m.ruleId, ...(m.message.match(/\[(FR10-[a-z-]+)\]/) ?? []).slice(1)]))

let failed = false
for (const id of EXPECTED) {
  const ok = seen.has(id)
  failed ||= !ok
  console.log(`${ok ? 'reported ' : 'MISSING  '} ${id}`)
}
process.exit(failed ? 1 : 0)
