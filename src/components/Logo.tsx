interface Props {
  size?: number
}

export default function Logo({ size = 20 }: Props) {
  const s = size
  const c = s / 4  // cell size
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect width="32" height="32" rx="3" fill="#080c14"/>
      <rect x="2"  y="2"  width="11" height="11" rx="1.5" fill="#4a9eff"/>
      <rect x="2"  y="14.5" width="11" height="8" rx="1.5" fill="#4a9eff" opacity="0.55"/>
      <rect x="14.5" y="2"  width="8" height="11" rx="1.5" fill="#ff6b4a" opacity="0.75"/>
      <rect x="14.5" y="14.5" width="15.5" height="15.5" rx="1.5" fill="#ff6b4a"/>
      <circle cx="13.5" cy="13.5" r="2.5" fill="#c8a840" opacity="0.9"/>
    </svg>
  )
}
