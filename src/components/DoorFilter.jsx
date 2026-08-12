import React, { useEffect, useMemo, useState } from 'react'

const DOOR_TYPE_LABELS = { door: 'باب عادي', vent_window: 'هواية/شباك' }

function buildOptions(doors, field, labelFn = null) {
  const counts = new Map()
  doors.forEach((d) => {
    const v = d[field]
    if (v === null || v === undefined || v === '') return
    counts.set(v, (counts.get(v) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, label: labelFn ? labelFn(value) : value }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
}

// قائمة قيم فريدة قابلة للاختيار المتعدد - تُستخدم لرقم الأوردر/المبنى/الدور/نوع
// الفتحة. بتعرض بس القيم الموجودة فعليًا في الأبواب اللي اتبعتلها (لكل مشروع).
function MultiSelectField({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filteredOptions = search.trim()
    ? options.filter((o) => String(o.label).toLowerCase().includes(search.trim().toLowerCase()))
    : options

  function toggle(value) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>{label}{selected.size > 0 ? ` (${selected.size})` : ''}</label>
      <button
        type="button"
        className="btn-secondary"
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.size > 0 ? [...selected].join('، ') : '-- الكل --'}
        </span>
        <span>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 20,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            marginTop: 4, maxHeight: 260, overflow: 'auto', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', padding: 8,
          }}>
            {options.length > 6 && (
              <input
                placeholder="دوّر..." value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }} autoFocus
              />
            )}
            {selected.size > 0 && (
              <button type="button" className="btn-secondary sm" style={{ marginBottom: 6 }} onClick={() => onChange(new Set())}>
                مسح الاختيار
              </button>
            )}
            {filteredOptions.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>لا توجد قيم مطابقة.</p>}
            {filteredOptions.map((o) => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5 }}>
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} style={{ width: 17, height: 17 }} />
                <span>{o.label} ({o.count})</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// المكوّن الرئيسي: بياخد قائمة أبواب المشروع الحالي، وبيرجّع للشاشة اللي
// بتستخدمه بس الأبواب المطابقة للفلتر الحالي، عبر onFilteredChange
export default function DoorFilter({ doors, onFilteredChange }) {
  const [doorNumberFilter, setDoorNumberFilter] = useState('')
  const [serialFilter, setSerialFilter] = useState('')
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [selectedBuildings, setSelectedBuildings] = useState(new Set())
  const [selectedFloors, setSelectedFloors] = useState(new Set())
  const [selectedTypes, setSelectedTypes] = useState(new Set())

  const orderOptions = useMemo(() => buildOptions(doors, 'order_number'), [doors])
  const buildingOptions = useMemo(() => buildOptions(doors, 'building'), [doors])
  const floorOptions = useMemo(() => buildOptions(doors, 'floor'), [doors])
  const typeOptions = useMemo(() => buildOptions(doors, 'door_type', (v) => DOOR_TYPE_LABELS[v] || v), [doors])

  const filtered = useMemo(() => {
    return doors.filter((d) => {
      if (doorNumberFilter.trim() && String(d.door_number) !== doorNumberFilter.trim()) return false
      if (serialFilter.trim() && String(d.serial) !== serialFilter.trim()) return false
      if (selectedOrders.size > 0 && !selectedOrders.has(d.order_number)) return false
      if (selectedBuildings.size > 0 && !selectedBuildings.has(d.building)) return false
      if (selectedFloors.size > 0 && !selectedFloors.has(d.floor)) return false
      if (selectedTypes.size > 0 && !selectedTypes.has(d.door_type)) return false
      return true
    })
  }, [doors, doorNumberFilter, serialFilter, selectedOrders, selectedBuildings, selectedFloors, selectedTypes])

  useEffect(() => { onFilteredChange(filtered) }, [filtered]) // eslint-disable-line

  const hasActiveFilter = !!(
    doorNumberFilter.trim() || serialFilter.trim()
    || selectedOrders.size || selectedBuildings.size || selectedFloors.size || selectedTypes.size
  )

  function clearAll() {
    setDoorNumberFilter(''); setSerialFilter('')
    setSelectedOrders(new Set()); setSelectedBuildings(new Set()); setSelectedFloors(new Set()); setSelectedTypes(new Set())
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div className="field">
          <label>رقم الباب</label>
          <input type="number" value={doorNumberFilter} onChange={(e) => setDoorNumberFilter(e.target.value)} placeholder="مطابقة تامة" />
        </div>
        <div className="field">
          <label>السيريال</label>
          <input type="number" value={serialFilter} onChange={(e) => setSerialFilter(e.target.value)} placeholder="مطابقة تامة" />
        </div>
        <MultiSelectField label="رقم الأوردر" options={orderOptions} selected={selectedOrders} onChange={setSelectedOrders} />
        <MultiSelectField label="المبنى" options={buildingOptions} selected={selectedBuildings} onChange={setSelectedBuildings} />
        <MultiSelectField label="الدور" options={floorOptions} selected={selectedFloors} onChange={setSelectedFloors} />
        <MultiSelectField label="نوع الفتحة" options={typeOptions} selected={selectedTypes} onChange={setSelectedTypes} />
      </div>
      {hasActiveFilter && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{filtered.length} من {doors.length} باب مطابق</span>
          <button className="btn-secondary sm" onClick={clearAll}>مسح كل الفلاتر</button>
        </div>
      )}
    </div>
  )
}
