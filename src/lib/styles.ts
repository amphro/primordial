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
    background: '#0d1520',
    border: '1px solid #1e3050',
    borderRadius: 8,
    padding: '48px 56px',
    textAlign: 'center',
    maxWidth: 420,
    width: '100%',
  } satisfies CSSProperties,

  primaryButton: {
    display: 'inline-block',
    background: '#4a9eff',
    color: '#080c14',
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
    color: '#4a9eff',
    fontFamily: 'inherit',
    fontSize: 14,
    letterSpacing: 1,
    padding: '12px 28px',
    borderRadius: 4,
    border: '1px solid #1e3050',
    cursor: 'pointer',
    textDecoration: 'none',
  } satisfies CSSProperties,

  input: {
    background: '#0a1018',
    border: '1px solid #1e3050',
    borderRadius: 4,
    color: '#e0e8f0',
    fontFamily: 'inherit',
    fontSize: 14,
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
  } satisfies CSSProperties,

  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#3a5a7a',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
    display: 'block',
  } satisfies CSSProperties,
}
