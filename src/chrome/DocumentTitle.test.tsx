import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DocumentTitle } from './DocumentTitle'

function titleAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocumentTitle />
    </MemoryRouter>,
  )
  return document.title
}

describe('DocumentTitle', () => {
  afterEach(() => {
    document.title = ''
  })
  it('names a known route', () => {
    expect(titleAt('/login')).toBe('Sign in · cpaltracker-react')
  })
  it('ignores a trailing slash', () => {
    expect(titleAt('/login/')).toBe('Sign in · cpaltracker-react')
  })
  it('uses the bare app name at the root', () => {
    expect(titleAt('/')).toBe('cpaltracker-react')
  })
  it('titles an unknown path as the 404', () => {
    expect(titleAt('/nope')).toBe('404 — Page not found · cpaltracker-react')
  })
})
