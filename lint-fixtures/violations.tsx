/* Deliberate FR10 violations, one per rule. Excluded from `npm run lint`;
   `npm run lint:fixtures` (lint-fixtures/check.mjs) asserts each one is reported. */
import { Dialog } from '@radix-ui/react-dialog' // FR10-radix-import
import { Root } from 'radix-ui' // FR10-radix-import (umbrella package)

export function Violations() {
  return (
    <div>
      <button>raw button</button> {/* FR10-raw-element */}
      <input /> {/* FR10-raw-element + jsx-a11y label rules */}
      <table /> {/* FR10-raw-element */}
      <p style={{ margin: 3 }}>inline style</p> {/* FR10-inline-style */}
      <p className="p-[13px]">arbitrary length</p> {/* FR10-arbitrary-length */}
      <p className="bg-[#ff0000]">arbitrary color</p> {/* FR10-arbitrary-color */}
      <p data-color="#ff0000">hex literal</p> {/* FR10-color-literal */}
      <p data-color="rgb(255 0 0)">rgb literal</p> {/* FR10-color-literal */}
      <img src="/x.png" /> {/* jsx-a11y/alt-text */}
      <Dialog />
      <Root />
    </div>
  )
}
