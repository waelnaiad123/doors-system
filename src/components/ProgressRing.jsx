import React from 'react'

// حلقة تقدم دائرية بسيطة (SVG) لعرض نسبة الإنجاز - تُستخدم في كل مكان
// نعرض فيه نسبة مئوية: تقارير المشاريع، تقدم كل نوع بند، إلخ.
export default function ProgressRing({ percent = 0, size = 44, label }) {
  const p = Math.max(0, Math.min(100, percent || 0))
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (p / 100) * c

  const color = p >= 100 ? 'var(--ok)' : p >= 50 ? 'var(--primary)' : p > 0 ? 'var(--pending)' : 'var(--empty)'

  return (
    <span className="progress-ring">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span>
        <span className="pct" style={{ color }}>{p.toFixed(0)}%</span>
        {label && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>}
      </span>
    </span>
  )
}
