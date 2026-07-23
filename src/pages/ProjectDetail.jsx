import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [itemTypes, setItemTypes] = useState([])
  const [doors, setDoors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('manual')

  useEffect(() => { loadAll() }, [projectId]) // eslint-disable-line

  async function loadAll() {
    setLoading(true)
    setError('')
    const [projRes, typesRes, doorsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('item_types').select('*').order('name'),
      supabase
        .from('doors')
        .select('id, door_code, location, door_items(id, item_type_id, quantity, item_types(name))')
        .eq('project_id', projectId)
        .order('door_code'),
    ])
    const firstError = projRes.error || typesRes.error || doorsRes.error
    if (firstError) setError(firstError.message)
    setProject(projRes.data || null)
    setItemTypes(typesRes.data || [])
    setDoors(doorsRes.data || [])
    setLoading(false)
  }

  const existingCodes = useMemo(() => new Set(doors.map((d) => d.door_code)), [doors])

  if (loading) return <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
  if (!project) {
    return <div className="alert alert-error">لا يمكن الوصول لهذا المشروع (غير موجود أو غير مخصص لك).</div>
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <Link to="/projects" style={{ fontSize: 13, color: 'var(--muted)' }}>← كل المشاريع</Link>
          <h1>{project.project_name}</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span className="code-cell">{project.project_number}</span> · {project.client_name || 'بدون عميل'} · {doors.length} باب مُضاف
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="toolbar">
        <button className={tab === 'manual' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('manual')}>
          إضافة يدوية
        </button>
        <button className={tab === 'import' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('import')}>
          استيراد من ملف
        </button>
        <button className={tab === 'list' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('list')}>
          الأبواب المُضافة ({doors.length})
        </button>
      </div>

      {tab === 'manual' && (
        <ManualAdd
          projectId={projectId}
          itemTypes={itemTypes}
          existingCodes={existingCodes}
          onSaved={(msg) => { setNotice(msg); setError(''); loadAll() }}
          onError={(e) => { setError(e); setNotice('') }}
        />
      )}
      {tab === 'import' && (
        <ImportFile
          projectId={projectId}
          itemTypes={itemTypes}
          onSaved={(msg) => { setNotice(msg); setError(''); loadAll() }}
          onError={(e) => { setError(e); setNotice('') }}
        />
      )}
      {tab === 'list' && <DoorsList doors={doors} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ManualAdd({ projectId, itemTypes, existingCodes, onSaved, onError }) {
  const [doorCode, setDoorCode] = useState('')
  const [location, setLocation] = useState('')
  const [rows, setRows] = useState([{ item_type_id: '', quantity: 1 }])
  const [saving, setSaving] = useState(false)

  function addRow() { setRows([...rows, { item_type_id: '', quantity: 1 }]) }
  function updateRow(i, patch) { setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))) }
  function removeRow(i) { setRows(rows.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e) {
    e.preventDefault()
    onError('')
    const code = doorCode.trim()
    if (!code) { onError('اكتب كود الباب أولًا'); return }
    const validRows = rows.filter((r) => r.item_type_id)
    if (validRows.length === 0) { onError('أضف بندًا واحدًا على الأقل (حلق، ضلفة، أو إكسسوار)'); return }

    setSaving(true)
    const { data: door, error: doorErr } = await supabase
      .from('doors')
      .upsert({ project_id: projectId, door_code: code, location: location.trim() || null }, { onConflict: 'project_id,door_code' })
      .select()
      .single()

    if (doorErr) { onError(doorErr.message); setSaving(false); return }

    const itemsPayload = validRows.map((r) => ({
      door_id: door.id, item_type_id: r.item_type_id, quantity: Number(r.quantity) || 1,
    }))
    const { error: itemsErr } = await supabase.from('door_items').upsert(itemsPayload, { onConflict: 'door_id,item_type_id' })

    setSaving(false)
    if (itemsErr) { onError(itemsErr.message); return }

    onSaved(`تم حفظ الباب "${code}" بعدد ${validRows.length} بند.`)
    setDoorCode(''); setLocation(''); setRows([{ item_type_id: '', quantity: 1 }])
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      {doorCode.trim() && existingCodes.has(doorCode.trim()) && (
        <div className="alert alert-ok">هذا الكود موجود بالفعل — سيتم إضافة/تحديث البنود على نفس الباب.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>كود الباب *</label>
          <input required value={doorCode} onChange={(e) => setDoorCode(e.target.value)} />
        </div>
        <div className="field">
          <label>الموقع / الدور (اختياري)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>

      <label>بنود الباب (حلق، ضلفة، وكل إكسسوار)</label>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select style={{ flex: 2 }} value={r.item_type_id} onChange={(e) => updateRow(i, { item_type_id: e.target.value })}>
            <option value="">اختر البند...</option>
            {itemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="number" min={1} style={{ width: 80 }} value={r.quantity}
            onChange={(e) => updateRow(i, { quantity: e.target.value })} />
          {rows.length > 1 && (
            <button type="button" className="btn-danger sm" onClick={() => removeRow(i)}>حذف</button>
          )}
        </div>
      ))}
      <button type="button" className="btn-secondary sm" onClick={addRow} style={{ marginBottom: 14 }}>+ بند آخر</button>
      <div>
        <button className="btn-primary" disabled={saving}>{saving ? 'جارِ الحفظ...' : 'حفظ الباب'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
function ImportFile({ projectId, itemTypes, onSaved, onError }) {
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')

  const typeByName = useMemo(() => {
    const m = new Map()
    itemTypes.forEach((t) => m.set(t.name.trim().toLowerCase(), t))
    return m
  }, [itemTypes])

  function downloadTemplate() {
    const wsData = [
      ['door_code', 'location', 'item_type', 'quantity'],
      ['D-101', 'الدور الأول', 'حلق', 1],
      ['D-101', 'الدور الأول', 'ضلفة', 1],
      ['D-101', 'الدور الأول', 'كالون', 1],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'الأبواب')
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['أنواع البنود المتاحة'], ...itemTypes.map((t) => [t.name])]),
      'قائمة الأنواع'
    )
    XLSX.writeFile(wb, 'نموذج_استيراد_الأبواب.xlsx')
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    onError('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const rows = json
        .map((r) => ({
          door_code: String(r.door_code ?? r['كود الباب'] ?? '').trim(),
          location: String(r.location ?? r['الموقع'] ?? '').trim(),
          item_type: String(r.item_type ?? r['البند'] ?? '').trim(),
          quantity: Number(r.quantity ?? r['الكمية'] ?? 1) || 1,
        }))
        .filter((r) => r.door_code && r.item_type)
      buildPreview(rows)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = '' // يسمح برفع نفس الملف مرة أخرى إذا لزم
  }

  function buildPreview(rows) {
    const unmatched = new Set()
    const doorMap = new Map()
    rows.forEach((r) => {
      const t = typeByName.get(r.item_type.trim().toLowerCase())
      if (!t) unmatched.add(r.item_type)
      if (!doorMap.has(r.door_code)) doorMap.set(r.door_code, { door_code: r.door_code, location: r.location, items: [] })
      doorMap.get(r.door_code).items.push({ item_type: r.item_type, item_type_id: t?.id, quantity: r.quantity })
    })
    setPreview({
      doors: Array.from(doorMap.values()),
      unmatchedTypes: Array.from(unmatched),
      doorCount: doorMap.size,
      itemCount: rows.length,
    })
  }

  async function upsertInChunks(table, rows, onConflict, chunkSize = 500) {
    const results = []
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      setProgress(`جارِ الحفظ... (${Math.min(i + chunkSize, rows.length)} / ${rows.length})`)
      const { data, error } = await supabase.from(table).upsert(chunk, { onConflict }).select()
      if (error) throw error
      results.push(...(data || []))
    }
    return results
  }

  async function handleImport() {
    if (!preview || preview.doors.length === 0) return
    setImporting(true)
    onError('')
    try {
      const doorRows = preview.doors.map((d) => ({
        project_id: projectId, door_code: d.door_code, location: d.location || null,
      }))
      const savedDoors = await upsertInChunks('doors', doorRows, 'project_id,door_code')
      const idByCode = new Map(savedDoors.map((d) => [d.door_code, d.id]))

      const itemRows = []
      preview.doors.forEach((d) => {
        const doorId = idByCode.get(d.door_code)
        d.items.forEach((it) => {
          if (it.item_type_id && doorId) itemRows.push({ door_id: doorId, item_type_id: it.item_type_id, quantity: it.quantity })
        })
      })
      await upsertInChunks('door_items', itemRows, 'door_id,item_type_id')

      onSaved(`تم استيراد ${preview.doorCount} باب بإجمالي ${itemRows.length} بند بنجاح.`)
      setPreview(null)
    } catch (err) {
      onError(err.message)
    } finally {
      setImporting(false)
      setProgress('')
    }
  }

  return (
    <div className="card">
      <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
        الملف يجب أن يحتوي أعمدة: <code>door_code</code> (كود الباب) · <code>location</code> (اختياري) ·{' '}
        <code>item_type</code> (اسم البند كما هو مسجل بالنظام) · <code>quantity</code> (اختياري، افتراضي 1).
        كرر نفس كود الباب في أكثر من سطر لإضافة أكثر من بند لنفس الباب.
      </p>
      <div className="toolbar">
        <button type="button" className="btn-secondary" onClick={downloadTemplate}>⬇ تحميل نموذج الاستيراد</button>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
      </div>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <div className="alert alert-ok">تم قراءة الملف: {preview.doorCount} باب، {preview.itemCount} بند.</div>
          {preview.unmatchedTypes.length > 0 && (
            <div className="alert alert-error">
              الأنواع التالية غير موجودة بالنظام ولن تُستورد حتى تصحيحها في الملف أو إضافتها بمعرفة الأدمن:{' '}
              {preview.unmatchedTypes.join('، ')}
            </div>
          )}
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table>
              <thead><tr><th>كود الباب</th><th>الموقع</th><th>عدد البنود</th></tr></thead>
              <tbody>
                {preview.doors.slice(0, 50).map((d, i) => (
                  <tr key={i}><td className="code-cell">{d.door_code}</td><td>{d.location || '—'}</td><td>{d.items.length}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.doors.length > 50 && (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>...وعدد {preview.doors.length - 50} باب آخر</p>
          )}
          <button className="btn-primary" style={{ marginTop: 12 }} disabled={importing} onClick={handleImport}>
            {importing ? (progress || 'جارِ الاستيراد...') : `تأكيد الاستيراد (${preview.doorCount} باب)`}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function DoorsList({ doors }) {
  if (doors.length === 0) {
    return <div className="empty-state"><div className="icon">🚪</div>لا توجد أبواب مُضافة بعد.</div>
  }
  return (
    <div className="card">
      <table>
        <thead><tr><th>كود الباب</th><th>الموقع</th><th>البنود</th></tr></thead>
        <tbody>
          {doors.map((d) => (
            <tr key={d.id}>
              <td className="code-cell">{d.door_code}</td>
              <td>{d.location || '—'}</td>
              <td>
                {(d.door_items || []).map((it) => (
                  <span key={it.id} className="badge badge-empty" style={{ marginInlineEnd: 4 }}>
                    {it.item_types?.name} × {it.quantity}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
