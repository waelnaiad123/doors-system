import React, { useMemo, useState } from 'react'

// خانة بحث بسيطة (بالاسم/الرقم/العميل) فوق قائمة منسدلة لاختيار مشروع - نفس
// أسلوب البحث المستخدم في شاشة "المشاريع" بالظبط، كمكوّن مشترك لإعادة الاستخدام.
// القائمة المنسدلة نفسها متسيبة زي ما هي دايمًا، بس بتتصفّى وهي بتتفتح.
export default function ProjectSearchBox({ projects, value, onChange, label }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.trim().toLowerCase()
    return projects.filter((p) =>
      (p.project_name || '').toLowerCase().includes(q)
      || (p.project_number || '').toLowerCase().includes(q)
      || (p.client_name || '').toLowerCase().includes(q)
    )
  }, [projects, search])

  return (
    <div className="field">
      <label>{label || 'اختر المشروع'}</label>
      <input
        placeholder="ابحث بالاسم، الرقم، أو العميل..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', marginBottom: 6 }}
      />
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }}>
        <option value="">-- اختر مشروعًا --</option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
        ))}
      </select>
      {search.trim() && filtered.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>مفيش مشروع مطابق للبحث.</p>
      )}
    </div>
  )
}
