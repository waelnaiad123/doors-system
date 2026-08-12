import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder, variantNoteFrom } from '../lib/itemOrder'

function aggregateBy(records, keyFn, variantFn = null) {
  const m = new Map()
  records.forEach((r) => {
    const k = keyFn(r) || '—'
    if (!m.has(k)) m.set(k, { key: k, quantity: 0, points: 0, count: 0, variants: {} })
    const row = m.get(k)
    row.quantity += Number(r.quantity) || 0
    row.points += Number(r.points_earned) || 0
    row.count += 1
    if (variantFn) {
      const v = variantFn(r)
      if (v) row.variants[v] = (row.variants[v] || 0) + (Number(r.quantity) || 0)
    }
  })
  return Array.from(m.values()).sort((a, b) => b.quantity - a.quantity)
}

export default function ReportsScreen() {
  const [projects, setProjects] = useState([])
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set())
  const [projectSearch, setProjectSearch] = useState('')

  const [people, setPeople] = useState([])
  const [selectedPersonIds, setSelectedPersonIds] = useState(new Set())

  const [scope, setScope] = useState('installations')
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState('both')
  const [dateMode, setDateMode] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [groupBy, setGroupBy] = useState('item')
  const [showDetail, setShowDetail] = useState(false)

  const [installRecords, setInstallRecords] = useState([])
  const [deliveryRecords, setDeliveryRecords] = useState([])
  const [selectedInstallIds, setSelectedInstallIds] = useState(new Set())
  const [showSelectedInstallOnly, setShowSelectedInstallOnly] = useState(false)
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState(new Set())
  const [showSelectedDeliveryOnly, setShowSelectedDeliveryOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadFilters() }, [])

  async function loadFilters() {
    const [projRes, peopleRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('projects').select('id, project_name, project_number, location_code').order('project_name').range(from, to)
      ),
      supabase.from('profiles').select('id, full_name, role, is_active').in('role', ['technician', 'supervisor', 'engineer']).order('full_name'),
    ])
    if (projRes.error) setError(projRes.error.message)
    setProjects(projRes.data || [])
    setPeople(peopleRes.data || [])
  }

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects
    const q = projectSearch.trim().toLowerCase()
    return projects.filter((p) =>
      p.project_name.toLowerCase().includes(q) ||
      p.project_number.toLowerCase().includes(q) ||
      (p.location_code || '').toLowerCase().includes(q)
    )
  }, [projects, projectSearch])

  function toggleProject(id) {
    setSelectedProjectIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function togglePerson(id) {
    setSelectedPersonIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleInstallSelect(id) {
    setSelectedInstallIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAllInstall(rows, checked) {
    setSelectedInstallIds((s) => {
      const n = new Set(s)
      rows.forEach((r) => { checked ? n.add(r.installation_id) : n.delete(r.installation_id) })
      return n
    })
  }
  function toggleDeliverySelect(id) {
    setSelectedDeliveryIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAllDelivery(rows, checked) {
    setSelectedDeliveryIds((s) => {
      const n = new Set(s)
      rows.forEach((r) => { checked ? n.add(r.delivery_id) : n.delete(r.delivery_id) })
      return n
    })
  }

  async function runReport() {
    setLoading(true); setError(''); setHasRun(true)
    setSelectedInstallIds(new Set()); setShowSelectedInstallOnly(false)
    setSelectedDeliveryIds(new Set()); setShowSelectedDeliveryOnly(false)
    try {
      let installData = []
      let deliveryData = []

      if (scope === 'installations' || scope === 'both') {
        const { data, error } = await fetchAllRows((from, to) => {
          let q = supabase.from('v_installations_detail').select('*').eq('status', 'approved')
          if (selectedProjectIds.size) q = q.in('project_id', Array.from(selectedProjectIds))
          if (dateMode === 'range' && dateFrom) q = q.gte('installed_at', dateFrom)
          if (dateMode === 'range' && dateTo) q = q.lte('installed_at', dateTo)
          return q.range(from, to)
        })
        if (error) throw error
        installData = data || []
        if (selectedPersonIds.size) {
          installData = installData.filter((r) => selectedPersonIds.has(r.technician_id) || selectedPersonIds.has(r.supervisor_id))
        }
      }

      if (scope === 'deliveries' || scope === 'both') {
        const { data, error } = await fetchAllRows((from, to) => {
          let q = supabase.from('v_deliveries_detail').select('*').eq('status', 'approved')
          if (selectedProjectIds.size) q = q.in('project_id', Array.from(selectedProjectIds))
          if (deliveryTypeFilter !== 'both') q = q.eq('delivery_type', deliveryTypeFilter)
          if (dateMode === 'range' && dateFrom) q = q.gte('delivered_at', dateFrom)
          if (dateMode === 'range' && dateTo) q = q.lte('delivered_at', `${dateTo}T23:59:59`)
          return q.range(from, to)
        })
        if (error) throw error
        deliveryData = data || []
        if (selectedPersonIds.size) {
          deliveryData = deliveryData.filter((r) => selectedPersonIds.has(r.delivered_by))
        }
      }

      setInstallRecords(installData)
      setDeliveryRecords(deliveryData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const installByItem = useMemo(() => sortByItemOrder(aggregateBy(installRecords, (r) => r.item_type, (r) => r.variant), (row) => row.key), [installRecords])
  const installByProject = useMemo(() => aggregateBy(installRecords, (r) => r.project_name), [installRecords])
  const installByPerson = useMemo(() => aggregateBy(installRecords, (r) => r.technician_name), [installRecords])
  const installTotals = useMemo(() => ({
    quantity: installRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    points: installRecords.reduce((s, r) => s + (Number(r.points_earned) || 0), 0),
  }), [installRecords])

  const deliveryByItem = useMemo(() => sortByItemOrder(aggregateBy(deliveryRecords, (r) => r.item_type, (r) => r.variant), (row) => row.key), [deliveryRecords])
  const deliveryByProject = useMemo(() => aggregateBy(deliveryRecords, (r) => r.project_name), [deliveryRecords])
  const deliveryByPerson = useMemo(() => aggregateBy(deliveryRecords, (r) => r.delivered_by_name), [deliveryRecords])
  const deliveryByType = useMemo(() => aggregateBy(deliveryRecords, (r) => r.delivery_type === 'client' ? 'تسليم للعميل' : 'تسليم للاستشاري'), [deliveryRecords])

  const installGrouped = groupBy === 'project' ? installByProject : groupBy === 'person' ? installByPerson : installByItem
  const deliveryGrouped = groupBy === 'project' ? deliveryByProject : groupBy === 'person' ? deliveryByPerson : deliveryByItem

  // "التحديد والعزل": التحديد بيقتصر على أول 300 سجل المعروضين (نفس حد العرض
  // الموجود أصلًا) - لو محتاج تحدد من أكتر، ضيّق الفلتر فوق الأول زي ما بيوضح
  // نص التنبيه تحت الجدول
  const visibleInstallRecords = useMemo(() => installRecords.slice(0, 300), [installRecords])
  const displayedInstallRecords = showSelectedInstallOnly
    ? visibleInstallRecords.filter((r) => selectedInstallIds.has(r.installation_id))
    : visibleInstallRecords
  const allInstallVisibleSelected = visibleInstallRecords.length > 0 && visibleInstallRecords.every((r) => selectedInstallIds.has(r.installation_id))

  const visibleDeliveryRecords = useMemo(() => deliveryRecords.slice(0, 300), [deliveryRecords])
  const displayedDeliveryRecords = showSelectedDeliveryOnly
    ? visibleDeliveryRecords.filter((r) => selectedDeliveryIds.has(r.delivery_id))
    : visibleDeliveryRecords
  const allDeliveryVisibleSelected = visibleDeliveryRecords.length > 0 && visibleDeliveryRecords.every((r) => selectedDeliveryIds.has(r.delivery_id))

  return (
    <div>
      <h1 className="no-print">التقارير</h1>
      {error && <div className="alert alert-error no-print">{error}</div>}

      <div className="card no-print">
        <h2 style={{ marginBottom: 12 }}>نوع التقرير</h2>
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <button className={scope === 'installations' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setScope('installations')}>تركيبات فقط</button>
          <button className={scope === 'deliveries' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setScope('deliveries')}>تسليمات فقط</button>
          <button className={scope === 'both' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setScope('both')}>كلاهما</button>
        </div>

        {(scope === 'deliveries' || scope === 'both') && (
          <div className="field">
            <label>نوع التسليم</label>
            <div className="toolbar">
              <button className={deliveryTypeFilter === 'both' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDeliveryTypeFilter('both')}>الاثنين</button>
              <button className={deliveryTypeFilter === 'client' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDeliveryTypeFilter('client')}>عميل فقط</button>
              <button className={deliveryTypeFilter === 'consultant' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDeliveryTypeFilter('consultant')}>استشاري فقط</button>
            </div>
          </div>
        )}

        <div className="field">
          <label>الفترة الزمنية</label>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <button className={dateMode === 'all' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDateMode('all')}>منذ البداية</button>
            <button className={dateMode === 'range' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDateMode('range')}>فترة محددة</button>
          </div>
          {dateMode === 'range' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 12 }}>من</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12 }}>إلى</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>المشاريع ({selectedProjectIds.size > 0 ? `${selectedProjectIds.size} محدد` : 'كل المشاريع المتاحة لك'})</label>
          <input placeholder="ابحث بالاسم، الرقم، أو كود المكان..." value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          {filteredProjects.length > 150 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              ظاهر أول 150 مشروع بس من {filteredProjects.length} مطابق. ضيّق البحث عشان تشوف الباقي.
            </p>
          )}
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
            {filteredProjects.slice(0, 150).map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px' }}>
                <input type="checkbox" checked={selectedProjectIds.has(p.id)} onChange={() => toggleProject(p.id)} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 13.5 }}>{p.project_number} — {p.project_name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>الأفراد ({selectedPersonIds.size > 0 ? `${selectedPersonIds.size} محدد` : 'الكل'}) — فني / مشرف / مهندس</label>
          <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
            {[...people].sort((a, b) => (b.is_active - a.is_active) || a.full_name.localeCompare(b.full_name)).map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px' }}>
                <input type="checkbox" checked={selectedPersonIds.has(p.id)} onChange={() => togglePerson(p.id)} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 13.5, color: p.is_active ? 'inherit' : 'var(--muted)' }}>
                  {p.full_name}{!p.is_active && ' (معطّل)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button className="btn-primary" disabled={loading} onClick={runReport} style={{ marginTop: 8 }}>
          {loading ? 'جارِ التحميل...' : 'تشغيل التقرير'}
        </button>
      </div>

      {hasRun && !loading && (
        <>
          {(scope === 'installations' || scope === 'both') && (
            <div className="card">
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <h2>ملخص التركيبات</h2>
                <span className="badge badge-ok">{installTotals.quantity} قطعة · {installTotals.points} نقطة</span>
              </div>
              <div className="toolbar no-print">
                <button className={groupBy === 'item' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setGroupBy('item')}>حسب البند</button>
                <button className={groupBy === 'project' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setGroupBy('project')}>حسب المشروع</button>
                <button className={groupBy === 'person' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setGroupBy('person')}>حسب الفني/المشرف</button>
              </div>
              {installGrouped.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>لا توجد بيانات مطابقة لهذا الفلتر.</p>
              ) : (
                <table>
                  <thead><tr><th></th><th>الكمية</th><th>النقاط</th></tr></thead>
                  <tbody>
                    {installGrouped.map((row) => (
                      <tr key={row.key}><td>{row.key}</td><td>{row.quantity}{variantNoteFrom(row.variants)}</td><td>{row.points}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(scope === 'deliveries' || scope === 'both') && (
            <div className="card">
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <h2>ملخص التسليمات</h2>
                <span className="badge badge-ok">{deliveryRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0)} قطعة</span>
              </div>
              {deliveryByType.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                  {deliveryByType.map((t) => `${t.key}: ${t.quantity}`).join(' — ')}
                </p>
              )}
              {deliveryGrouped.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>لا توجد بيانات مطابقة لهذا الفلتر.</p>
              ) : (
                <table>
                  <thead><tr><th></th><th>الكمية</th></tr></thead>
                  <tbody>
                    {deliveryGrouped.map((row) => (
                      <tr key={row.key}><td>{row.key}</td><td>{row.quantity}{variantNoteFrom(row.variants)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="card">
            <div className="toolbar no-print" style={{ justifyContent: 'space-between' }}>
              <button className="btn-secondary sm" onClick={() => setShowDetail((s) => !s)}>
                {showDetail ? 'إخفاء التفاصيل' : 'عرض التفاصيل الكاملة (بالباب والمشروع)'}
              </button>
              {showDetail && (
                <button className="btn-primary sm" onClick={() => window.print()}>🖨 طباعة</button>
              )}
            </div>

            {showDetail && (scope === 'installations' || scope === 'both') && installRecords.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="toolbar no-print" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <h3 style={{ marginBottom: 0 }}>تفاصيل التركيبات</h3>
                  <div className="toolbar">
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {selectedInstallIds.size > 0 ? `${selectedInstallIds.size} محدد` : ''}
                    </span>
                    {selectedInstallIds.size > 0 && (
                      <button className={showSelectedInstallOnly ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setShowSelectedInstallOnly((s) => !s)}>
                        {showSelectedInstallOnly ? 'اعرض الكل' : 'اعرض المحدد بس'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th className="no-print">
                          <input type="checkbox" checked={allInstallVisibleSelected}
                            onChange={(e) => toggleSelectAllInstall(visibleInstallRecords, e.target.checked)} style={{ width: 17, height: 17 }} />
                        </th>
                        <th>المشروع</th><th>الباب</th><th>البند</th><th>الكمية</th><th>النقاط</th><th>التاريخ</th><th>الفني</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedInstallRecords.map((r) => (
                        <tr key={r.installation_id}>
                          <td className="no-print">
                            <input type="checkbox" checked={selectedInstallIds.has(r.installation_id)}
                              onChange={() => toggleInstallSelect(r.installation_id)} style={{ width: 17, height: 17 }} />
                          </td>
                          <td>{r.project_name}</td>
                          <td className="code-cell">{r.door_code}</td>
                          <td>{r.item_type}</td>
                          <td>{r.quantity}</td>
                          <td>{r.points_earned}</td>
                          <td className="code-cell">{r.installed_at}</td>
                          <td>{r.technician_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {installRecords.length > 300 && (
                    <p className="no-print" style={{ fontSize: 12, color: 'var(--muted)' }}>...وعدد {installRecords.length - 300} سجل آخر (ضيّق الفلتر لعرض الكل)</p>
                  )}
                </div>
              </div>
            )}

            {showDetail && (scope === 'deliveries' || scope === 'both') && deliveryRecords.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="toolbar no-print" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <h3 style={{ marginBottom: 0 }}>تفاصيل التسليمات</h3>
                  <div className="toolbar">
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {selectedDeliveryIds.size > 0 ? `${selectedDeliveryIds.size} محدد` : ''}
                    </span>
                    {selectedDeliveryIds.size > 0 && (
                      <button className={showSelectedDeliveryOnly ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setShowSelectedDeliveryOnly((s) => !s)}>
                        {showSelectedDeliveryOnly ? 'اعرض الكل' : 'اعرض المحدد بس'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th className="no-print">
                          <input type="checkbox" checked={allDeliveryVisibleSelected}
                            onChange={(e) => toggleSelectAllDelivery(visibleDeliveryRecords, e.target.checked)} style={{ width: 17, height: 17 }} />
                        </th>
                        <th>المشروع</th><th>الباب</th><th>البند</th><th>الكمية</th><th>النوع</th><th>التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedDeliveryRecords.map((r) => (
                        <tr key={r.delivery_id}>
                          <td className="no-print">
                            <input type="checkbox" checked={selectedDeliveryIds.has(r.delivery_id)}
                              onChange={() => toggleDeliverySelect(r.delivery_id)} style={{ width: 17, height: 17 }} />
                          </td>
                          <td>{r.project_name}</td>
                          <td className="code-cell">{r.door_code}</td>
                          <td>{r.item_type}</td>
                          <td>{r.quantity}</td>
                          <td>{r.delivery_type === 'client' ? 'عميل' : 'استشاري'}</td>
                          <td className="code-cell">{r.delivery_type === 'client' ? r.client_delivery_date : r.consultant_wir_code}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {deliveryRecords.length > 300 && (
                    <p className="no-print" style={{ fontSize: 12, color: 'var(--muted)' }}>...وعدد {deliveryRecords.length - 300} سجل آخر (ضيّق الفلتر لعرض الكل)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
