import React from 'react'

const MAP = {
  not_installed: { cls: 'badge-empty', text: 'لم يُركّب' },
  pending_review: { cls: 'badge-pending', text: 'بانتظار الاعتماد' },
  approved: { cls: 'badge-ok', text: 'معتمد' },
  rejected: { cls: 'badge-danger', text: 'مرفوض' },
  delivered_client: { cls: 'badge-ok', text: 'تم التسليم للعميل' },
  delivered_consultant: { cls: 'badge-ok', text: 'تم التسليم للاستشاري' },
}

export default function StatusBadge({ status }) {
  const m = MAP[status] || { cls: 'badge-empty', text: status }
  return <span className={`badge ${m.cls}`}>{m.text}</span>
}
