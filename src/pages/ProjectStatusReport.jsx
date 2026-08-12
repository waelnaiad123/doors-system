import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder, itemOrderIndex, variantNoteFrom } from '../lib/itemOrder'
import { useAuth } from '../AuthContext'
import ProjectSearchBox from '../components/ProjectSearchBox'
import DoorFilter from '../components/DoorFilter'

export default function ProjectStatusReport() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [rows, setRows] = useState([])
  const [filteredDoorCodes, setFilteredDoorCodes] = useState(null) // null = لسه DoorFilter مبلّغش، نعرض الكل مؤقتًا
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadProjects() }, []) // eslint-disable-line
  useEffect(() => { if (projectId) loadStatus() }, [projectId]) // eslint-disable-line

  async function loadProjects() {
    setLoadingProjects(true)
    setError('')

    // الأدمن ومدير التركيبات يشوفوا كل المشاريع. أي دور تاني يشوف بس المشاريع
    // المخصص عليها فعليًا (فلترة صريحة في الكود، بالإضافة لصلاحيات قاعدة البيانات).
    if (profile.role === 'admin' || profile.is_installations_manager) {
      const { data, error } = await fetchAllRows((from, to) =>
        supabase.from('projects').select('id, project_name, project_number, client_name').order('project_name').range(from, to)
      )
      if (error) setError(error.message)
      setProjects(data || [])
      setLoadingProjects(false)
      return
    }

    const { data: myAssigns, error: assignErr } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id, projects(id, project_name, project_number, client_name)')
        .eq('user_id', profile.id).eq('is_active', true).range(from, to)
    )
    if (assignErr) { setError(assignErr.message); setLoadingProjects(false); return }
    const seen = new Map()
    ;(myAssigns || []).forEach((a) => { if (a.projects) seen.set(a.project_id, a.projects) })
    const list = Array.from(seen.values()).sort((a, b) => a.project_name.localeCompare(b.project_name))
    setProjects(list)
    setLoadingProjects(false)
  }

  async function loadStatus() {
    setLoadingRows(true)
    setError('')
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('v_door_item_status').select('*').eq('project_id', projectId).order('door_code').range(from, to)
    )
    if (error) setError(error.message)
    setRows(data || [])
    const p = projects.find((x) => x.id === projectId)
    setProjectName(p ? `${p.project_number} — ${p.project_name}` : '')
    setLoadingRows(false)
  }

  function colorOf(r) {
    if (r.consultant_delivered) return 'green'
    if (r.client_delivered) return 'blue'
    if (r.installed) return 'yellow'
    return null
  }

  const itemTypes = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.item_type))).sort((a, b) => itemOrderIndex(a) - itemOrderIndex(b))
  }, [rows])

  const summary = useMemo(() => {
    const m = new Map()
    itemTypes.forEach((t) => m.set(t, { total: 0, installed: 0, client: 0, consultant: 0, variants: {} }))
    rows.forEach((r) => {
      const s = m.get(r.item_type)
      const q = Number(r.quantity) || 0
      s.total += q
      if (r.installed) s.installed += q
      if (r.client_delivered) s.client += q
      if (r.consultant_delivered) s.consultant += q
      if (r.variant) {
        if (!s.variants[r.variant]) s.variants[r.variant] = { total: 0, installed: 0, client: 0, consultant: 0 }
        const v = s.variants[r.variant]
        v.total += q
        if (r.installed) v.installed += q
        if (r.client_delivered) v.client += q
        if (r.consultant_delivered) v.consultant += q
      }
    })
    return m
  }, [rows, itemTypes])

  function noteFor(t, metric) {
    const variants = summary.get(t).variants
    const map = {}
    Object.entries(variants).forEach(([v, counts]) => { map[v] = counts[metric] })
    return variantNoteFrom(map)
  }

  const doorsGrouped = useMemo(() => {
    const m = new Map()
    rows.forEach((r) => {
      if (!m.has(r.door_code)) {
        m.set(r.door_code, {
          door_code: r.door_code, door_type: r.door_type, location: r.location,
          order_number: r.order_number, serial: r.serial, building: r.building,
          floor: r.floor, door_number: r.door_number,
          items: [],
        })
      }
      m.get(r.door_code).items.push(r)
    })
    return Array.from(m.values()).map((d) => ({ ...d, items: sortByItemOrder(d.items, (it) => it.item_type) }))
  }, [rows])

  // فلتر الأبواب الذكي بيشتغل على أبواب هذا المشروع بس (بعد ما اتحدد أصلًا) -
  // ملخص "الإجمالي لكل بند" فوق بيفضل يعكس المشروع كامل، مش الفلتر، عمدًا
  const doorsForFilter = useMemo(() => doorsGrouped.map((d) => ({
    door_code: d.door_code, order_number: d.order_number, serial: d.serial,
    building: d.building, floor: d.floor, door_number: d.door_number, door_type: d.door_type,
  })), [doorsGrouped])

  const filteredDoorsGrouped = useMemo(() => {
    if (filteredDoorCodes === null) return doorsGrouped
    return doorsGrouped.filter((d) => filteredDoorCodes.has(d.door_code))
  }, [doorsGrouped, filteredDoorCodes])

  function handleDoorFilterChange(filtered) {
    setFilteredDoorCodes(new Set(filtered.map((d) => d.door_code)))
  }

  return (
    <div>
      <div className="no-print">
        <h1>موقف تركيبات وتسليمات المشروع</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <ProjectSearchBox projects={projects} value={projectId} onChange={setProjectId} />
          {!loadingProjects && projects.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>مفيش أي مشروع مخصص لك حاليًا.</p>
          )}
        </div>
      </div>

      {projectId && !loadingRows && rows.length > 0 && (
        <>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn-primary" onClick={() => window.print()}>🖨 طباعة التقرير</button>
          </div>
          <h2 style={{ marginBottom: 4 }}>{projectName}</h2>
          <div className="status-legend">
            <span><span className="dot" style={{ background: 'var(--status-yellow)' }}></span>تركيب معتمد</span>
            <span><span className="dot" style={{ background: 'var(--status-blue)' }}></span>تسليم للعميل</span>
            <span><span className="dot" style={{ background: 'var(--status-green)' }}></span>تسليم للاستشاري (نهائي)</span>
          </div>
          <div className="card print-compact">
            <h3 style={{ marginBottom: 2 }}>ملخص إجمالي لكل بند</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              (بيعرض المشروع كامل دايمًا، من غير ما يتأثر بفلتر الأبواب تحت)
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    {itemTypes.map((t) => <th key={t}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>الإجمالي</strong></td>
                    {itemTypes.map((t) => <td key={t}>{summary.get(t).total}{noteFor(t, 'total')}</td>)}
                  </tr>
                  <tr>
                    <td><strong>تركيب معتمد</strong></td>
                    {itemTypes.map((t) => <td key={t}>{summary.get(t).installed}{noteFor(t, 'installed')}</td>)}
                  </tr>
                  <tr>
                    <td><strong>تسليم للعميل</strong></td>
                    {itemTypes.map((t) => <td key={t}>{summary.get(t).client}{noteFor(t, 'client')}</td>)}
                  </tr>
                  <tr>
                    <td><strong>تسليم للاستشاري</strong></td>
                    {itemTypes.map((t) => <td key={t}>{summary.get(t).consultant}{noteFor(t, 'consultant')}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="no-print">
            <DoorFilter doors={doorsForFilter} onFilteredChange={handleDoorFilterChange} />
          </div>
          <div className="card print-compact">
            <table>
              <thead>
                <tr>
                  <th>كود الباب</th>
                  <th>النوع</th>
                  <th>المبنى / الدور</th>
                  <th>البنود</th>
                </tr>
              </thead>
              <tbody>
                {filteredDoorsGrouped.map((d) => (
                  <tr key={d.door_code}>
                    <td className="code-cell">{d.door_code}</td>
                    <td>{d.door_type === 'vent_window' ? 'هواية/شباك' : 'باب'}</td>
                    <td>{d.building} / {d.floor}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {d.items.map((it) => {
                          const c = colorOf(it)
                          const cls = c === 'green' ? 'badge-status-green' : c === 'blue' ? 'badge-status-blue' : c === 'yellow' ? 'badge-status-yellow' : 'badge-empty'
                          return (
                            <span key={it.door_item_id} className={`badge ${cls}`}>
                              {it.item_type} × {it.quantity}{it.variant === 'large' ? ' (كبيرة)' : it.variant === 'sliding' ? ' (جرار)' : ''}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredDoorsGrouped.length === 0 && (
              <p className="no-print" style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 0' }}>
                مفيش أبواب مطابقة للفلتر الحالي.
              </p>
            )}
          </div>
        </>
      )}
      {projectId && loadingRows && <p className="no-print" style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>}
      {projectId && !loadingRows && rows.length === 0 && (
        <div className="card empty-state no-print"><div className="icon">📋</div>لا توجد أبواب في هذا المشروع بعد.</div>
      )}
    </div>
  )
}
