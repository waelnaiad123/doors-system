import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../AuthContext'

function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function DeliveryScreen() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [deliveryType, setDeliveryType] = useState('client')
  const [clientDate, setClientDate] = useState(todayStr())
  const [wirCode, setWirCode] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [recent, setRecent] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { loadProjects(); loadRecent() }, []) // eslint-disable-line
  useEffect(() => { if (projectId) loadItems() }, [projectId, deliveryType, search]) // eslint-disable-line

  async function loadProjects() {
    setLoadingProjects(true)
    const { data, error } = await supabase.from('projects').select('id, project_name, project_number').order('project_name')
    if (error) setError(error.message)
    setProjects(data || [])
    setLoadingProjects(false)
  }

  async function loadItems() {
    setLoadingItems(true)
    setError('')
    let q = supabase.from('v_deliverable_items').select('*').eq('project_id', projectId).order('door_code')
    if (search.trim()) q = q.ilike('door_code', `%${search.trim()}%`)
    const { data, error } = await q
    if (error) setError(error.message)
    const filtered = (data || []).filter((it) => (deliveryType === 'client' ? !it.delivered_to_client : !it.delivered_to_consultant))
    setItems(filtered)
    setSelected(new Set())
    setLoadingItems(false)
  }

  async function loadRecent() {
    const { data, error } = await supabase
      .from('v_deliveries_detail')
      .select('*')
      .eq('delivered_by', profile.id)
      .order('delivered_at', { ascending: false })
      .limit(50)
    if (!error) setRecent(data || [])
  }

  const groupedByDoor = useMemo(() => {
    const m = new Map()
    items.forEach((it) => {
      if (!m.has(it.door_code)) m.set(it.door_code, { door_code: it.door_code, location: it.location, items: [] })
      m.get(it.door_code).items.push(it)
    })
    return Array.from(m.values())
  }, [items])

  const MAX_DOORS_SHOWN = 100
  const visibleDoors = groupedByDoor.slice(0, MAX_DOORS_SHOWN)

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleDoor(doorItems, checked) {
    setSelected((s) => {
      const n = new Set(s)
      doorItems.forEach((it) => (checked ? n.add(it.door_item_id) : n.delete(it.door_item_id)))
      return n
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    if (deliveryType === 'client' && !clientDate) { setError('حدد تاريخ التسليم'); return }
    if (deliveryType === 'consultant' && !wirCode.trim()) { setError('اكتب كود الـ WIR'); return }
    setSubmitting(true)
    setError('')
    try {
      const rows = Array.from(selected).map((id) => ({
        door_item_id: id,
        delivery_type: deliveryType,
        client_delivery_date: deliveryType === 'client' ? clientDate : null,
        consultant_wir_code: deliveryType === 'consultant' ? wirCode.trim() : null,
        delivered_by: profile.id,
      }))
      const { error } = await supabase.from('deliveries').insert(rows)
      if (error) throw error
      setNotice(`تم تسجيل تسليم ${rows.length} بند بنجاح، بانتظار اعتماد المهندس.`)
      await Promise.all([loadItems(), loadRecent()])
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUndo(deliveryId) {
    setError('')
    const { error } = await supabase.from('deliveries').delete().eq('id', deliveryId)
    if (error) { setError(error.message); return }
    await Promise.all([loadItems(), loadRecent()])
  }

  return (
    <div>
      <h1>التسليمات</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card">
        <div className="field">
          <label>اختر المشروع</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
            <option value="">{loadingProjects ? 'جارِ التحميل...' : '-- اختر مشروعًا --'}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
            ))}
          </select>
        </div>

        {projectId && (
          <>
            <div className="field">
              <label>نوع التسليم</label>
              <div className="toolbar">
                <button type="button" className={deliveryType === 'client' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDeliveryType('client')}>تسليم للعميل</button>
                <button type="button" className={deliveryType === 'consultant' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDeliveryType('consultant')}>تسليم للاستشاري</button>
              </div>
            </div>

            {deliveryType === 'client' ? (
              <div className="field">
                <label>تاريخ التسليم</label>
                <input type="date" value={clientDate} onChange={(e) => setClientDate(e.target.value)} />
              </div>
            ) : (
              <div className="field">
                <label>كود الـ WIR</label>
                <input value={wirCode} onChange={(e) => setWirCode(e.target.value)} placeholder="مثال: WIR-104" style={{ width: '100%' }} />
              </div>
            )}

            <div className="field">
              <label>ابحث عن كود باب</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثال: D-101" style={{ width: '100%' }} />
            </div>
          </>
        )}
      </div>

      {projectId && (
        <div className="card">
          {loadingItems ? (
            <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
          ) : visibleDoors.length === 0 ? (
            <div className="empty-state">
              <div className="icon">✅</div>
              كل البنود المُعتمدة في هذا المشروع تم تسليمها بالفعل لهذا النوع (أو لا يوجد أبواب مطابقة للبحث).
            </div>
          ) : (
            <>
              {visibleDoors.map((d) => {
                const allSelected = d.items.every((it) => selected.has(it.door_item_id))
                return (
                  <div key={d.door_code} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                      <input type="checkbox" className="door-select-all" checked={allSelected}
                        onChange={(e) => toggleDoor(d.items, e.target.checked)} />
                      <strong className="code-cell" style={{ fontSize: 15 }}>{d.door_code}</strong>
                      {d.location && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>({d.location})</span>}
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {d.items.map((it) => (
                        <label key={it.door_item_id} className={`chip-select ${selected.has(it.door_item_id) ? 'selected' : 'unselected'}`}>
                          <input type="checkbox" checked={selected.has(it.door_item_id)} onChange={() => toggle(it.door_item_id)} />
                          {it.item_type} × {it.quantity}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {groupedByDoor.length > MAX_DOORS_SHOWN && (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  بيظهر أول {MAX_DOORS_SHOWN} باب فقط من إجمالي {groupedByDoor.length} — استخدم البحث فوق لتضييق النتائج.
                </p>
              )}

              <div className="sticky-action-bar">
                <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                  {selected.size > 0 ? `تم اختيار ${selected.size} بند` : 'اختر البنود اللي تم تسليمها'}
                </span>
                <button className="btn-primary" disabled={selected.size === 0 || submitting} onClick={handleSubmit}>
                  {submitting ? 'جارِ الحفظ...' : `تسجيل التسليم (${selected.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>آخر تسليماتي</h2>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>لسه معملتش أي تسليم.</p>
        ) : (
          <table>
            <thead>
              <tr><th>المشروع</th><th>الباب</th><th>البند</th><th>النوع</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.delivery_id}>
                  <td>{r.project_name}</td>
                  <td className="code-cell">{r.door_code}</td>
                  <td>{r.item_type}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.delivery_type === 'client' ? `عميل (${r.client_delivery_date})` : `استشاري (${r.consultant_wir_code})`}
                  </td>
                  <td>
                    <span className={r.status === 'approved' ? 'badge badge-ok' : r.status === 'rejected' ? 'badge badge-danger' : 'badge badge-pending'}>
                      {r.status === 'approved' ? 'معتمد' : r.status === 'rejected' ? 'مرفوض' : 'بانتظار الاعتماد'}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending_review' && (
                      <button className="btn-danger sm" onClick={() => handleUndo(r.delivery_id)}>تراجع</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
