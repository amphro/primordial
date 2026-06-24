import type { CSSProperties } from 'react'

export const s = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 20,
  } satisfies CSSProperties,

  card: {
    background: 'var(--clr-card)',
    border: '1px solid var(--clr-border-hi)',
    borderRadius: 8,
    padding: '48px 56px',
    textAlign: 'center',
    maxWidth: 420,
    width: '100%',
  } satisfies CSSProperties,

  primaryButton: {
    display: 'inline-block',
    background: 'var(--clr-blue)',
    color: 'var(--clr-bg)',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    padding: '12px 28px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
  } satisfies CSSProperties,

  ghostButton: {
    display: 'inline-block',
    background: 'transparent',
    color: 'var(--clr-blue)',
    fontFamily: 'inherit',
    fontSize: 14,
    letterSpacing: 1,
    padding: '12px 28px',
    borderRadius: 4,
    border: '1px solid var(--clr-border-hi)',
    cursor: 'pointer',
    textDecoration: 'none',
  } satisfies CSSProperties,

  input: {
    background: 'var(--clr-input-bg)',
    border: '1px solid var(--clr-border-hi)',
    borderRadius: 4,
    color: 'var(--clr-text)',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
  } satisfies CSSProperties,

  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'var(--clr-text-muted)',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
    display: 'block',
  } satisfies CSSProperties,
}
