import React from 'react'

export default function ComingSoon({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <div className="card empty-state">
        <div className="icon">🛠️</div>
        هذه الشاشة قيد البناء في المرحلة التالية من المشروع.
      </div>
    </div>
  )
}
