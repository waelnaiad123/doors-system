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
// استيراد ذكي: يقبل ملف الإكسل الحقيقي كما هو (مهما كان شكله معقدًا)،
// ويترك المستخدم يحدد يدويًا أي عمود يمثل كود الباب، وأي أعمدة تمثل كل بند.
// المطابقة يمكن حفظها محليًا (localStorage) وإعادة استخدامها تلقائيًا لملفات
// أخرى بنفس رؤوس الأعمدة (مفيد جدًا مع مئات الملفات المتشابهة الشكل).
function ImportFile({ projectId, itemTypes, onSaved, onError }) {
  const [rawSheet, setRawSheet] = useState(null)
  const [headerRowNum, setHeaderRowNum] = useState(1)
  const [mapping, setMapping] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

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
    setPreview(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
      setRawSheet(rows)

      // نخمّن صف العناوين تلقائيًا: الصف اللي فيه أكبر عدد خلايا مكتوبة من أول 6 صفوف
      // (الرؤوس المدمجة زي "General Data" بتملأ خلية واحدة بس، بعكس صف العناوين التفصيلي)
      let bestRow = 0
      let bestCount = -1
      for (let r = 0; r < Math.min(6, rows.length); r++) {
        const count = (rows[r] || []).filter((c) => c !== undefined && c !== null && String(c).trim() !== '').length
        if (count > bestCount) { bestCount = count; bestRow = r }
      }
      setHeaderRowNum(bestRow + 1)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const headers = useMemo(() => {
    if (!rawSheet || !rawSheet[headerRowNum - 1]) return []
    return rawSheet[headerRowNum - 1].map((h, idx) => ({
      idx,
      label: h !== undefined && h !== null && String(h).trim() !== '' ? String(h).trim() : `عمود ${idx + 1}`,
    }))
  }, [rawSheet, headerRowNum])

  const dataRows = useMemo(() => {
    if (!rawSheet) return []
    return rawSheet
      .slice(headerRowNum)
      .filter((r) => (r || []).some((c) => c !== undefined && c !== null && String(c).trim() !== ''))
  }, [rawSheet, headerRowNum])

  const storageKey = useMemo(() => {
    if (headers.length === 0) return null
    return 'doors-import-map:' + headers.map((h) => h.label).join('|')
  }, [headers])

  useEffect(() => {
    if (!storageKey) return
    let loaded = null
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) loaded = JSON.parse(saved)
    } catch (e) {
      loaded = null
    }
    if (loaded && !loaded.doorCodeCols && loaded.doorCodeCol !== undefined) {
      // توافق مع مطابقة قديمة كانت تعتمد عمود واحد فقط لكود الباب
      loaded = {
        ...loaded,
        doorCodeCols: loaded.doorCodeCol !== '' ? [loaded.doorCodeCol] : [],
        doorCodeSeparator: '-',
      }
    }
    setMapping(loaded || { doorCodeCols: [], doorCodeSeparator: '-', locationCol: '', items: {} })
  }, [storageKey])

  function addDoorCodeCol(colIdx) {
    if (colIdx === '') return
    setMapping((m) => (m.doorCodeCols.includes(colIdx) ? m : { ...m, doorCodeCols: [...m.doorCodeCols, colIdx] }))
  }
  function removeDoorCodeCol(colIdx) {
    setMapping((m) => ({ ...m, doorCodeCols: m.doorCodeCols.filter((c) => c !== colIdx) }))
  }

  function updateItemMap(itemTypeId, patch) {
    setMapping((m) => ({ ...m, items: { ...m.items, [itemTypeId]: { ...(m.items[itemTypeId] || {}), ...patch } } }))
  }

  function saveMappingTemplate() {
    if (!storageKey || !mapping) return
    localStorage.setItem(storageKey, JSON.stringify(mapping))
    setSavedMsg('تم الحفظ. المرة الجاية اللي ترفع فيها ملف بنفس أسماء الأعمدة، هتتحمّل نفس المطابقة تلقائيًا.')
    setTimeout(() => setSavedMsg(''), 5000)
  }

  function buildDoorCode(row, mapping) {
    const parts = mapping.doorCodeCols
      .map((colIdx) => {
        const v = row[colIdx]
        return v !== undefined && v !== null ? String(v).trim() : ''
      })
      .filter((p) => p !== '')
    return parts.join(mapping.doorCodeSeparator || '-')
  }

  function buildPreview() {
    onError('')
    if (!mapping || !mapping.doorCodeCols || mapping.doorCodeCols.length === 0) {
      onError('حدد عمود واحد على الأقل لتكوين كود الباب')
      return
    }
    const doorMap = new Map()
    dataRows.forEach((row) => {
      const code = buildDoorCode(row, mapping)
      if (!code) return
      const locRaw = mapping.locationCol !== '' ? row[mapping.locationCol] : ''
      const location = locRaw !== undefined && locRaw !== null ? String(locRaw).trim() : ''
      if (!doorMap.has(code)) doorMap.set(code, { door_code: code, location, items: [] })
      const doorEntry = doorMap.get(code)

      itemTypes.forEach((t) => {
        const im = mapping.items[t.id]
        if (!im || !im.mode || im.mode === 'none') return
        let qty = 0
        if (im.mode === 'always1') {
          qty = 1
        } else if (im.mode === 'column' && im.col !== '' && im.col !== undefined) {
          const raw = row[im.col]
          if (typeof raw === 'number') {
            if (raw > 0) qty = raw
          } else if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
            const num = parseFloat(raw)
            qty = !isNaN(num) && num > 0 ? num : 1
          }
        }
        if (qty > 0) doorEntry.items.push({ item_type_id: t.id, quantity: qty })
      })
    })
    const doorsArr = Array.from(doorMap.values())
    setPreview({
      doors: doorsArr,
      doorCount: doorsArr.length,
      itemCount: doorsArr.reduce((s, d) => s + d.items.length, 0),
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
      setRawSheet(null)
      setMapping(null)
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
      {!rawSheet && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
            ارفع ملف الإكسل بتاعك <strong>كما هو تمامًا</strong>، حتى لو شكله معقد وفيه أعمدة كتيرة. في الخطوة
            الجاية هتحدد إنت أنهي عمود هو كود الباب، وأنهي أعمدة تمثل كل بند (حلق، ضلفة، كالون، مفصلات...).
            لو معندكش ملف جاهز، فيه نموذج بسيط تقدر تنزّله وتبدأ بيه.
          </p>
          <div className="toolbar">
            <button type="button" className="btn-secondary" onClick={downloadTemplate}>⬇ تحميل نموذج بسيط</button>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
          </div>
        </>
      )}

      {rawSheet && !preview && mapping && (
        <div>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>رقم صف عناوين الأعمدة في ملفك (كما تراه في إكسل)</label>
              <input
                type="number" min={1} style={{ width: 90 }} value={headerRowNum}
                onChange={(e) => setHeaderRowNum(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <button type="button" className="btn-secondary sm" onClick={() => { setRawSheet(null); setMapping(null) }}>
              ملف آخر
            </button>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 130, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
            <table>
              <thead><tr>{headers.map((h) => <th key={h.idx}>{h.label}</th>)}</tr></thead>
              <tbody>
                {dataRows.slice(0, 2).map((r, i) => (
                  <tr key={i}>{headers.map((h) => <td key={h.idx}>{String(r[h.idx] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="field">
            <label>كود الباب يتكوّن من أي أعمدة؟ (بالترتيب) *</label>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -4, marginBottom: 8 }}>
              مثال: رقم أمر الشغل - اسم المبنى - الدور - رقم الباب. اختر الأعمدة بنفس ترتيبها هنا.
            </p>
            {mapping.doorCodeCols.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {mapping.doorCodeCols.map((colIdx, i) => (
                  <span key={i} className="badge badge-pending">
                    {i + 1}. {headers[colIdx]?.label || colIdx}
                    <button
                      type="button" onClick={() => removeDoorCodeCol(colIdx)}
                      style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 4px', font: 'inherit' }}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={{ flex: 1 }} value="" onChange={(e) => addDoorCodeCol(e.target.value)}>
                <option value="">+ أضف عمودًا لكود الباب...</option>
                {headers.filter((h) => !mapping.doorCodeCols.includes(h.idx)).map((h) => (
                  <option key={h.idx} value={h.idx}>{h.label}</option>
                ))}
              </select>
              <input
                style={{ width: 70 }} value={mapping.doorCodeSeparator}
                onChange={(e) => setMapping((m) => ({ ...m, doorCodeSeparator: e.target.value }))}
                title="الفاصل بين الأجزاء"
              />
            </div>
            {mapping.doorCodeCols.length > 0 && dataRows[0] && (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
                مثال على النتيجة: <span className="code-cell">{buildDoorCode(dataRows[0], mapping) || '—'}</span>
              </p>
            )}
          </div>

          <div className="field">
            <label>أي عمود هو الموقع/الدور؟ (اختياري)</label>
            <select value={mapping.locationCol} onChange={(e) => setMapping((m) => ({ ...m, locationCol: e.target.value }))}>
              <option value="">بدون</option>
              {headers.map((h) => <option key={h.idx} value={h.idx}>{h.label}</option>)}
            </select>
          </div>

          <label>مطابقة بنود التركيب (لكل نوع، حدد من أين تُقرأ كميته)</label>
          {itemTypes.map((t) => {
            const im = mapping.items[t.id] || {}
            return (
              <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ width: 90, fontSize: 13.5, flexShrink: 0 }}>{t.name}</span>
                <select style={{ flex: 1 }} value={im.mode || 'none'} onChange={(e) => updateItemMap(t.id, { mode: e.target.value })}>
                  <option value="none">غير موجود في الملف</option>
                  <option value="always1">دائمًا موجود (كمية 1) لكل صف/باب</option>
                  <option value="column">من عمود في الملف...</option>
                </select>
                {im.mode === 'column' && (
                  <select style={{ flex: 1 }} value={im.col ?? ''} onChange={(e) => updateItemMap(t.id, { col: e.target.value })}>
                    <option value="">اختر العمود...</option>
                    {headers.map((h) => <option key={h.idx} value={h.idx}>{h.label}</option>)}
                  </select>
                )}
              </div>
            )
          })}

          {savedMsg && <div className="alert alert-ok" style={{ marginTop: 10 }}>{savedMsg}</div>}
          <div className="toolbar" style={{ marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={saveMappingTemplate}>💾 احفظ هذه المطابقة لملفات مشابهة لاحقًا</button>
            <button type="button" className="btn-primary" onClick={buildPreview}>معاينة قبل الاستيراد ←</button>
          </div>
        </div>
      )}

      {preview && (
        <div>
          <div className="alert alert-ok">
            تم تجهيز {preview.doorCount} باب بإجمالي {preview.itemCount} بند. راجع العينة قبل التأكيد.
          </div>
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
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>← رجوع لتعديل المطابقة</button>
            <button className="btn-primary" disabled={importing} onClick={handleImport}>
              {importing ? (progress || 'جارِ الاستيراد...') : `تأكيد الاستيراد (${preview.doorCount} باب)`}
            </button>
          </div>
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
