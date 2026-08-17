import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder } from '../lib/itemOrder'
import { useAuth } from '../AuthContext'
import DoorFilter from '../components/DoorFilter'

// قيم احتياطية لو جدول door_leaf_variant_points مش موجود أو الاستعلام فشل لأي
// سبب - عشان النقاط متطلعش صفر بالغلط، بترجع لنفس القيم المعروفة زي الأول.
const FALLBACK_VARIANT_POINTS = { large: 50, sliding: 100 }

export default function ProjectDetail() {
  const { projectId } = useParams()
  const { profile } = useAuth()
  const [project, setProject] = useState(null)
  const [itemTypes, setItemTypes] = useState([])
  const [doors, setDoors] = useState([])
  const [variantPoints, setVariantPoints] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState(profile.role === 'engineer' && !profile.is_installations_manager ? 'list' : 'manual')
  const [editingInfo, setEditingInfo] = useState(false)
  const [clientNameInput, setClientNameInput] = useState('')
  const [locationCodeInput, setLocationCodeInput] = useState('')

  useEffect(() => { loadAll() }, [projectId]) // eslint-disable-line

  async function loadAll() {
    setLoading(true)
    setError('')
    const [projRes, typesRes, doorsRes, variantRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('item_types').select('*').order('display_order'),
      fetchAllRows((from, to) =>
        supabase
          .from('doors')
          .select('id, door_code, order_number, serial, building, floor, door_number, door_type, door_items(id, item_type_id, quantity, variant, status, points_override, item_types(name, points))')
          .eq('project_id', projectId)
          .order('serial')
          .range(from, to)
      ),
      supabase.from('door_leaf_variant_points').select('variant, points'),
    ])
    const firstError = projRes.error || typesRes.error || doorsRes.error
    if (firstError) setError(firstError.message)
    setProject(projRes.data || null)
    setItemTypes(typesRes.data || [])
    setDoors(doorsRes.data || [])
    setVariantPoints(Object.fromEntries((variantRes.data || []).map((v) => [v.variant, v.points])))
    setLoading(false)
  }

  const existingSerials = useMemo(() => new Set(doors.map((d) => d.serial)), [doors])

  if (loading) return <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
  if (!project) {
    return <div className="alert alert-error">لا يمكن الوصول لهذا المشروع (غير موجود أو غير مخصص لك).</div>
  }

  async function saveProjectInfo() {
    const { error } = await supabase
      .from('projects')
      .update({ client_name: clientNameInput || null, location_code: locationCodeInput || null })
      .eq('id', projectId)
    if (error) { setError(error.message); return }
    setEditingInfo(false)
    loadAll()
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <Link to="/projects" style={{ fontSize: 13, color: 'var(--muted)' }}>← كل المشاريع</Link>
          <h1>{project.project_name}</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span className="code-cell">{project.project_number}</span> · {project.client_name || 'بدون عميل'}
            · {doors.length} باب مُضاف
          </div>
          {project.final_delivery_status === 'delivered' && (
            <div style={{ marginTop: 4 }}>
              <span className="badge badge-ok">
                ✅ تم تسليمه نهائيًا بتاريخ {project.final_delivery_approved_at?.slice(0, 10)} — تم تنزيل نقاطه
              </span>
            </div>
          )}
          {project.final_delivery_status === 'pending_approval' && (
            <div style={{ marginTop: 4 }}>
              <span className="badge badge-pending">⏳ طلب تسليم نهائي بانتظار اعتماد مدير التركيبات</span>
            </div>
          )}
        </div>
        {['admin', 'data_entry'].includes(profile.role) && (
          <button
            className="btn-secondary sm"
            onClick={() => {
              setClientNameInput(project.client_name || '')
              setLocationCodeInput(project.location_code || '')
              setEditingInfo((s) => !s)
            }}
          >
            تعديل بيانات المشروع
          </button>
        )}
      </div>

      {editingInfo && (
        <div className="card">
          <div className="field">
            <label>اسم العميل</label>
            <input value={clientNameInput} onChange={(e) => setClientNameInput(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="field">
            <label>كود المكان</label>
            <input value={locationCodeInput} onChange={(e) => setLocationCodeInput(e.target.value)} style={{ width: '100%' }} />
          </div>
          <button className="btn-primary" onClick={saveProjectInfo}>حفظ</button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="toolbar">
        {(profile.role !== 'engineer' || profile.is_installations_manager) && project.final_delivery_status !== 'delivered' && (
          <>
            <button className={tab === 'manual' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('manual')}>
              إضافة يدوية
            </button>
            <button className={tab === 'import' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('import')}>
              استيراد من ملف
            </button>
          </>
        )}
        <button className={tab === 'list' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('list')}>
          الأبواب المُضافة ({doors.length})
        </button>
      </div>

      {tab === 'manual' && (profile.role !== 'engineer' || profile.is_installations_manager) && project.final_delivery_status !== 'delivered' && (
        <ManualAdd
          projectId={projectId}
          itemTypes={itemTypes}
          doors={doors}
          existingSerials={existingSerials}
          onSaved={(msg) => { setNotice(msg); setError(''); loadAll() }}
          onError={(e) => { setError(e); setNotice('') }}
        />
      )}
      {tab === 'import' && (profile.role !== 'engineer' || profile.is_installations_manager) && project.final_delivery_status !== 'delivered' && (
        <ImportFile
          projectId={projectId}
          itemTypes={itemTypes}
          onSaved={(msg) => { setNotice(msg); setError(''); loadAll() }}
          onError={(e) => { setError(e); setNotice('') }}
        />
      )}
      {tab === 'list' && <DoorsList doors={doors} itemTypes={itemTypes} variantPoints={variantPoints} isDelivered={project.final_delivery_status === 'delivered'} onReload={loadAll} onError={setError} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

const VENT_ONLY_ITEMS = ['حلق هواية/شباك', 'عدد الهوايات']
const VENT_ALLOWED_ITEMS = ['حلق هواية/شباك', 'عدد الهوايات']

function ManualAdd({ projectId, itemTypes, doors, existingSerials, onSaved, onError }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [serial, setSerial] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [doorNumber, setDoorNumber] = useState('')
  const [doorType, setDoorType] = useState('door')
  const [rows, setRows] = useState([{ item_type_id: '', quantity: 1 }])
  const [saving, setSaving] = useState(false)

  // اقتراحات "اكتب أو اختار" - القيم اللي اتكتبت قبل كده في نفس المشروع بس
  const orderSuggestions = useMemo(() => [...new Set(doors.map((d) => d.order_number).filter(Boolean))], [doors])
  const buildingSuggestions = useMemo(() => [...new Set(doors.map((d) => d.building).filter(Boolean))], [doors])
  const floorSuggestions = useMemo(() => [...new Set(doors.map((d) => d.floor).filter(Boolean))], [doors])

  // معاينة كود الباب اللي هيتولّد تلقائيًا - نفس صيغة الـ trigger بالظبط، بس
  // للعرض قبل الحفظ. القاعدة هي اللي بتحسم القيمة الفعلية النهائية دايمًا.
  const codePreview = orderNumber && serial && building && floor && doorNumber
    ? `${orderNumber}-س${serial}-${building}-${floor}-ب${doorNumber}`
    : null

  const availableItemTypes = doorType === 'vent_window'
    ? itemTypes.filter((t) => VENT_ALLOWED_ITEMS.includes(t.name))
    : itemTypes.filter((t) => !VENT_ONLY_ITEMS.includes(t.name))

  function addRow() { setRows([...rows, { item_type_id: '', quantity: 1 }]) }
  function updateRow(i, patch) { setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))) }
  function removeRow(i) { setRows(rows.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e) {
    e.preventDefault()
    onError('')
    if (!orderNumber.trim() || !serial || !building.trim() || !floor.trim() || !doorNumber.trim()) {
      onError('لازم تملي الخمس خانات: الأوردر، السيريال، المبنى، الدور، رقم الباب')
      return
    }
    const validRows = rows.filter((r) => r.item_type_id)
    if (validRows.length === 0) { onError('أضف بندًا واحدًا على الأقل (حلق، ضلفة، أو إكسسوار)'); return }
    setSaving(true)
    const { data: door, error: doorErr } = await supabase
      .from('doors')
      .upsert({
        project_id: projectId,
        order_number: orderNumber.trim(),
        serial: Number(serial),
        building: building.trim(),
        floor: floor.trim(),
        door_number: doorNumber.trim(),
        door_type: doorType,
      }, { onConflict: 'project_id,serial' })
      .select()
      .single()

    if (doorErr) { onError(doorErr.message); setSaving(false); return }

    const itemsPayload = validRows.map((r) => ({
      door_id: door.id, item_type_id: r.item_type_id, quantity: Number(r.quantity) || 1,
    }))
    const { error: itemsErr } = await supabase.from('door_items').upsert(itemsPayload, { onConflict: 'door_id,item_type_id' })

    setSaving(false)
    if (itemsErr) { onError(itemsErr.message); return }

    onSaved(`تم حفظ الباب "${door.door_code}" بعدد ${validRows.length} بند.`)
    setOrderNumber(''); setSerial(''); setBuilding(''); setFloor(''); setDoorNumber(''); setDoorType('door')
    setRows([{ item_type_id: '', quantity: 1 }])
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      {serial && existingSerials.has(Number(serial)) && (
        <div className="alert alert-ok">السيريال ده موجود بالفعل — سيتم إضافة/تحديث البنود على نفس الباب.</div>
      )}
      <div className="field">
        <label>نوع البند</label>
        <div className="toolbar">
          <button type="button" className={doorType === 'door' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDoorType('door')}>باب</button>
          <button type="button" className={doorType === 'vent_window' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setDoorType('vent_window')}>هواية / شباك</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="field">
          <label>رقم الأوردر *</label>
          <input required list="order-suggestions" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          <datalist id="order-suggestions">
            {orderSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="field">
          <label>السيريال *</label>
          <input required type="number" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </div>
        <div className="field">
          <label>المبنى *</label>
          <input required list="building-suggestions" value={building} onChange={(e) => setBuilding(e.target.value)} />
          <datalist id="building-suggestions">
            {buildingSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="field">
          <label>الدور *</label>
          <input required list="floor-suggestions" value={floor} onChange={(e) => setFloor(e.target.value)} />
          <datalist id="floor-suggestions">
            {floorSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="field">
          <label>رقم الباب *</label>
          <input required type="text" value={doorNumber} onChange={(e) => setDoorNumber(e.target.value)} />
        </div>
      </div>
      {codePreview && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -6, marginBottom: 12 }}>
          كود الباب هيبقى: <strong style={{ color: 'inherit' }}>{codePreview}</strong>
        </p>
      )}

      <label>{doorType === 'vent_window' ? 'بنود الهواية/الشباك' : 'بنود الباب (حلق، ضلفة، وكل إكسسوار)'}</label>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select style={{ flex: 2 }} value={r.item_type_id} onChange={(e) => updateRow(i, { item_type_id: e.target.value })}>
            <option value="">اختر البند...</option>
            {availableItemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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

// خانة اختيار عمود من الملف، أو التبديل لقيمة ثابتة واحدة تتكرر لكل الصفوف -
// مفيدة للحقول اللي ممكن تتكرر قيمتها في المشروع كله (زي مشروع كله مبنى
// واحد أو دور واحد، فمفيش داعي عمود منفصل ليها في الملف أصلًا).
// ملحوظة مهمة: القطعة دي لازم تفضل مُعرَّفة هنا (مستقلة، مش جوه ImportFile) -
// لو اتحطت جوه دالة مكوّن تاني، React بيعيد "خلقها" من الصفر مع كل حرف
// يتكتب، وده بيفقد التركيز فورًا ويخلي الكتابة تبدو معطوبة (حرف واحد بس في
// كل مرة) - وده بالظبط الباگ اللي كان موجود قبل كده.
function FieldMapper({ label, mode, col, fixed, headers, onModeChange, onColChange, onFixedChange }) {
  return (
    <div className="field">
      <label>{label} *</label>
      <div className="toolbar" style={{ marginBottom: 6 }}>
        <button type="button" className={mode === 'column' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => onModeChange('column')}>من عمود</button>
        <button type="button" className={mode === 'fixed' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => onModeChange('fixed')}>قيمة ثابتة</button>
      </div>
      {mode === 'column' ? (
        <select value={col} onChange={(e) => onColChange(e.target.value)}>
          <option value="">-- اختر عمود --</option>
          {headers.map((h) => <option key={h.idx} value={h.idx}>{h.label}</option>)}
        </select>
      ) : (
        <input value={fixed} onChange={(e) => onFixedChange(e.target.value)} placeholder="نفس القيمة لكل الصفوف" />
      )}
    </div>
  )
}

function ImportFile({ projectId, itemTypes, onSaved, onError }) {
  const [rawSheet, setRawSheet] = useState(null)
  const [headerRowNum, setHeaderRowNum] = useState(1)
  const [mapping, setMapping] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [mappingLoadedFromStorage, setMappingLoadedFromStorage] = useState(false)

  function downloadTemplate() {
    const wsData = [
      ['رقم الأوردر', 'السيريال', 'المبنى', 'الدور', 'رقم الباب', 'item_type', 'quantity'],
      ['INST-1', 1, 'B1', 'F1', 'D101', 'حلق', 1],
      ['INST-1', 1, 'B1', 'F1', 'D101', 'ضلفة', 1],
      ['INST-1', 1, 'B1', 'F1', 'D101', 'كالون', 1],
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
    // بادئة نسخة جديدة عشان مطابقات الشكل القديم ما تتحمّلش هنا بالغلط وتسبب
    // تعارض مع شكل البيانات الجديد (حقل ثابت اختياري للأوردر/المبنى/الدور)
    // ----------------------------------------------------------------------
    // تطبيع كل المسافات (مش بس الأول والآخر زي trim) لمسافة عادية واحدة، عشان
    // مسافات غير عادية جوّه النص (زي مسافة غير قابلة للكسر لو جاية من نسخ من
    // PDF أو برنامج تاني) - متطابقة تمامًا للعين في إكسل - متخليش الملف
    // يتعامل معاه كملف مختلف كليًا
    const normalizeLabel = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim()
    return 'doors-import-map-v3:' + headers.map((h) => normalizeLabel(h.label)).join('|')
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
    setMappingLoadedFromStorage(!!loaded)
    setMapping(loaded || {
      orderNumberMode: 'column', orderNumberCol: '', orderNumberFixed: '',
      serialCol: '',
      buildingMode: 'column', buildingCol: '', buildingFixed: '',
      floorMode: 'column', floorCol: '', floorFixed: '',
      doorNumberCol: '',
      items: {},
    })
  }, [storageKey])

  function updateItemMap(itemTypeId, patch) {
    setMapping((m) => ({ ...m, items: { ...m.items, [itemTypeId]: { ...(m.items[itemTypeId] || {}), ...patch } } }))
  }

  function saveMappingTemplate() {
    if (!storageKey || !mapping) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(mapping))
      setSavedMsg('تم الحفظ. المرة الجاية اللي ترفع فيها ملف بنفس أسماء الأعمدة، هتتحمّل نفس المطابقة تلقائيًا.')
    } catch (e) {
      setSavedMsg('فشل الحفظ: ' + e.message + ' (جرب تتأكد إن المتصفح مش في وضع التصفح الخاص، أو امسح بيانات تصفح قديمة)')
    }
    setTimeout(() => setSavedMsg(''), 5000)
  }

  function strVal(v) { return v !== undefined && v !== null ? String(v).trim() : '' }

  // بيرجع رقم صحيح موجب لو القيمة سليمة، أو null لو فاضية/مش رقم/صفر أو أقل -
  // مستخدمة للسيريال بس (الوحيد اللي لازم يكون رقم صافي)
  function parseIntSafe(v) {
    if (v === undefined || v === null || v === '') return null
    const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  // بيرجّع قيمة الحقل (الأوردر/المبنى/الدور) - إما من عمود في الملف، أو قيمة
  // ثابتة واحدة بتتكرر لكل الصفوف لو المشروع كله مبنى واحد أو دور واحد مثلًا
  function fieldValue(row, mode, col, fixed) {
    if (mode === 'fixed') return strVal(fixed)
    return strVal(row[col])
  }

  // معاينة كود الباب اللي هيتولّد تلقائيًا لصف معيّن - بس للعرض، القاعدة هي
  // اللي بتحسم القيمة الفعلية دايمًا (نفس صيغة الـ trigger بالظبط)
  function previewCode(row, m) {
    const orderNumber = fieldValue(row, m.orderNumberMode, m.orderNumberCol, m.orderNumberFixed)
    const serial = parseIntSafe(row[m.serialCol])
    const building = fieldValue(row, m.buildingMode, m.buildingCol, m.buildingFixed)
    const floor = fieldValue(row, m.floorMode, m.floorCol, m.floorFixed)
    const doorNumber = strVal(row[m.doorNumberCol])
    if (!orderNumber || !serial || !building || !floor || !doorNumber) return null
    return `${orderNumber}-س${serial}-${building}-${floor}-ب${doorNumber}`
  }

  function buildPreview() {
    onError('')
    if (mapping.orderNumberMode === 'column' && !mapping.orderNumberCol) { onError('حدد عمود رقم الأوردر، أو بدّل لقيمة ثابتة'); return }
    if (mapping.orderNumberMode === 'fixed' && !mapping.orderNumberFixed.trim()) { onError('اكتب قيمة رقم الأوردر الثابتة'); return }
    if (!mapping.serialCol) { onError('حدد عمود السيريال'); return }
    if (mapping.buildingMode === 'column' && !mapping.buildingCol) { onError('حدد عمود المبنى، أو بدّل لقيمة ثابتة'); return }
    if (mapping.buildingMode === 'fixed' && !mapping.buildingFixed.trim()) { onError('اكتب قيمة المبنى الثابتة'); return }
    if (mapping.floorMode === 'column' && !mapping.floorCol) { onError('حدد عمود الدور، أو بدّل لقيمة ثابتة'); return }
    if (mapping.floorMode === 'fixed' && !mapping.floorFixed.trim()) { onError('اكتب قيمة الدور الثابتة'); return }
    if (!mapping.doorNumberCol) { onError('حدد عمود رقم الباب'); return }

    const doorMap = new Map() // مفتاح الخريطة هو السيريال - المفتاح الحقيقي لتفرد الباب
    let skippedRows = 0
    dataRows.forEach((row) => {
      const orderNumber = fieldValue(row, mapping.orderNumberMode, mapping.orderNumberCol, mapping.orderNumberFixed)
      const serial = parseIntSafe(row[mapping.serialCol])
      const building = fieldValue(row, mapping.buildingMode, mapping.buildingCol, mapping.buildingFixed)
      const floor = fieldValue(row, mapping.floorMode, mapping.floorCol, mapping.floorFixed)
      const doorNumber = strVal(row[mapping.doorNumberCol])
      // لو أي خانة من الخمسة فاضية أو غير سليمة (زي سيريال نصي مش رقم)، نتخطى
      // الصف ده بدل ما نحفظ باب بيانات ناقصة - ونعدّه عشان نبلّغ المستخدم
      if (!orderNumber || !serial || !building || !floor || !doorNumber) { skippedRows++; return }

      if (!doorMap.has(serial)) {
        doorMap.set(serial, { order_number: orderNumber, serial, building, floor, door_number: doorNumber, items: [] })
      }
      const doorEntry = doorMap.get(serial)
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
      skippedRows,
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
        project_id: projectId,
        order_number: d.order_number,
        serial: d.serial,
        building: d.building,
        floor: d.floor,
        door_number: d.door_number,
      }))
      // السيريال هو مفتاح التفرد الحقيقي جوه المشروع - كود الباب بيتولّد تلقائيًا
      // بواسطة trigger في القاعدة، فمش محتاجين نبعته إحنا خالص
      const savedDoors = await upsertInChunks('doors', doorRows, 'project_id,serial')
      const idBySerial = new Map(savedDoors.map((d) => [d.serial, d.id]))

      const itemRows = []
      preview.doors.forEach((d) => {
        const doorId = idBySerial.get(d.serial)
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
      onError(`الاستيراد: ${err.message}`)
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
            الجاية هتحدد إنت أنهي عمود يمثّل كل خانة (رقم الأوردر، السيريال، المبنى، الدور، رقم الباب)، وأنهي
            أعمدة تمثل كل بند (حلق، ضلفة، كالون، مفصلات...). لو مشروعك كله مبنى واحد أو دور واحد، تقدر تكتب
            قيمة ثابتة بدل ما تدوّر على عمود ليها. لو معندكش ملف جاهز، فيه نموذج بسيط تقدر تنزّله وتبدأ بيه.
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

          <div style={{ overflow: 'auto', maxHeight: 130, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
            <table>
              <thead><tr>{headers.map((h) => <th key={h.idx}>{h.label}</th>)}</tr></thead>
              <tbody>
                {dataRows.slice(0, 2).map((r, i) => (
                  <tr key={i}>{headers.map((h) => <td key={h.idx}>{String(r[h.idx] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={mappingLoadedFromStorage ? 'alert alert-ok' : 'alert alert-pending'} style={{ fontSize: 12.5, marginBottom: 14 }}>
            {mappingLoadedFromStorage
              ? '✓ اتلاقت مطابقة محفوظة لملف بنفس أسماء الأعمدة دي بالظبط، واتحمّلت تلقائيًا تحت.'
              : 'ℹ️ مفيش مطابقة محفوظة لملف بنفس أسماء الأعمدة دي بالظبط - هتبدأ فاضية.'}
            {' '}أسماء الأعمدة اللي البرنامج شايفها (صف رقم {headerRowNum}): {headers.map((h) => h.label).join('، ')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 8 }}>
            <FieldMapper
              label="رقم الأوردر" mode={mapping.orderNumberMode} col={mapping.orderNumberCol} fixed={mapping.orderNumberFixed} headers={headers}
              onModeChange={(v) => setMapping((m) => ({ ...m, orderNumberMode: v }))}
              onColChange={(v) => setMapping((m) => ({ ...m, orderNumberCol: v }))}
              onFixedChange={(v) => setMapping((m) => ({ ...m, orderNumberFixed: v }))}
            />
            <div className="field">
              <label>عمود السيريال *</label>
              <select value={mapping.serialCol} onChange={(e) => setMapping((m) => ({ ...m, serialCol: e.target.value }))}>
                <option value="">-- اختر --</option>
                {headers.map((h) => <option key={h.idx} value={h.idx}>{h.label}</option>)}
              </select>
            </div>
            <FieldMapper
              label="المبنى" mode={mapping.buildingMode} col={mapping.buildingCol} fixed={mapping.buildingFixed} headers={headers}
              onModeChange={(v) => setMapping((m) => ({ ...m, buildingMode: v }))}
              onColChange={(v) => setMapping((m) => ({ ...m, buildingCol: v }))}
              onFixedChange={(v) => setMapping((m) => ({ ...m, buildingFixed: v }))}
            />
            <FieldMapper
              label="الدور" mode={mapping.floorMode} col={mapping.floorCol} fixed={mapping.floorFixed} headers={headers}
              onModeChange={(v) => setMapping((m) => ({ ...m, floorMode: v }))}
              onColChange={(v) => setMapping((m) => ({ ...m, floorCol: v }))}
              onFixedChange={(v) => setMapping((m) => ({ ...m, floorFixed: v }))}
            />
            <div className="field">
              <label>عمود رقم الباب *</label>
              <select value={mapping.doorNumberCol} onChange={(e) => setMapping((m) => ({ ...m, doorNumberCol: e.target.value }))}>
                <option value="">-- اختر --</option>
                {headers.map((h) => <option key={h.idx} value={h.idx}>{h.label}</option>)}
              </select>
            </div>
          </div>
          {dataRows[0] && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -4, marginBottom: 14 }}>
              مثال على النتيجة (أول صف بيانات): <span className="code-cell">{previewCode(dataRows[0], mapping) || 'مكتملش كل الخانات المطلوبة لسه'}</span>
            </p>
          )}

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
          {preview.skippedRows > 0 && (
            <div className="alert alert-error">
              تنبيه: {preview.skippedRows} صف اتخطّى لإنه ناقص خانة أو أكتر من الخمس خانات المطلوبة (أو فيها قيمة
              مش رقمية في خانة السيريال). راجع الملف لو العدد ده أعلى من المتوقع.
            </div>
          )}
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table>
              <thead><tr><th>الأوردر</th><th>السيريال</th><th>المبنى</th><th>الدور</th><th>رقم الباب</th><th>عدد البنود</th></tr></thead>
              <tbody>
                {preview.doors.slice(0, 50).map((d, i) => (
                  <tr key={i}>
                    <td>{d.order_number}</td><td>{d.serial}</td><td>{d.building}</td>
                    <td>{d.floor}</td><td>{d.door_number}</td><td>{d.items.length}</td>
                  </tr>
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

function DoorsList({ doors, itemTypes, variantPoints, isDelivered, onReload, onError }) {
  const { profile } = useAuth()
  const [busyId, setBusyId] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteTypeId, setDeleteTypeId] = useState('')
  const [filteredDoors, setFilteredDoors] = useState(doors)
  const [selected, setSelected] = useState(new Set())
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)

  useEffect(() => { if (selected.size === 0) setShowSelectedOnly(false) }, [selected])

  const allVisibleSelected = filteredDoors.length > 0 && filteredDoors.every((d) => selected.has(d.id))

  // "اعرض المحدد بس" - بيشتغل فوق فلتر الأبواب، عشان تقدر تجمّع مجموعة أبواب
  // من فلاتر مختلفة وتشوفهم مع بعض في مكان واحد
  const selectionFilteredDoors = useMemo(() => {
    if (!showSelectedOnly) return filteredDoors
    return filteredDoors.filter((d) => selected.has(d.id))
  }, [filteredDoors, showSelectedOnly, selected])

  const itemsSummary = useMemo(() => {
    const byType = new Map()
    let pending = 0, approved = 0, rejected = 0
    let catalogPoints = 0
    const doorFrameLeaf = new Map() // door_id -> { frameQty, leafQty } - لحساب نقاط التسليم المتوقعة
    const rejectedList = []
    doors.forEach((d) => {
      doorFrameLeaf.set(d.id, { frameQty: 0, leafQty: 0 })
      ;(d.door_items || []).forEach((it) => {
        const name = it.item_types?.name || '—'
        const qty = Number(it.quantity || 0)
        byType.set(name, (byType.get(name) || 0) + qty)
        const unit = it.points_override ?? it.item_types?.points
        if (unit) catalogPoints += Number(unit) * qty
        const fl = doorFrameLeaf.get(d.id)
        if (name === 'حلق' || name === 'حلق هواية/شباك') fl.frameQty += qty
        else if (name === 'ضلفة') fl.leafQty += qty
        if (it.status === 'pending_review') pending++
        else if (it.status === 'approved') approved++
        else if (it.status === 'rejected') {
          rejected++
          rejectedList.push({ door_code: d.door_code, item_type: name, quantity: it.quantity })
        }
      })
    })
    let deliveryPoints = 0
    doorFrameLeaf.forEach((fl) => { deliveryPoints += (fl.frameQty > 0 ? fl.frameQty : fl.leafQty) * 7 })
    const byTypeSorted = sortByItemOrder(
      Array.from(byType.entries()).map(([name, qty]) => ({ name, qty })),
      (it) => it.name
    )
    return { byType: byTypeSorted, pending, approved, rejected, rejectedList, totalPoints: Math.round(catalogPoints + deliveryPoints) }
  }, [doors])

  function toggleSelectAll(checked) {
    setSelected((s) => {
      const n = new Set(s)
      filteredDoors.forEach((d) => (checked ? n.add(d.id) : n.delete(d.id)))
      return n
    })
  }
  function toggleSelectOne(id, checked) {
    setSelected((s) => {
      const n = new Set(s)
      checked ? n.add(id) : n.delete(id)
      return n
    })
  }

  async function performToggleType(door, nextType) {
    const itemCount = (door.door_items || []).length
    if (itemCount > 0) {
      const { error: delErr } = await supabase.from('door_items').delete().eq('door_id', door.id)
      if (delErr) throw delErr
    }
    const { error } = await supabase.from('doors').update({ door_type: nextType }).eq('id', door.id)
    if (error) throw error

    if (nextType === 'vent_window') {
      const frameType = itemTypes.find((t) => t.name === 'حلق هواية/شباك')
      const countType = itemTypes.find((t) => t.name === 'عدد الهوايات')
      const newItems = [frameType, countType]
        .filter(Boolean)
        .map((t) => ({ door_id: door.id, item_type_id: t.id, quantity: 1 }))
      if (newItems.length > 0) {
        const { error: insErr } = await supabase.from('door_items').insert(newItems)
        if (insErr) throw insErr
      }
    }
  }

  async function toggleType(door) {
    const nextType = door.door_type === 'vent_window' ? 'door' : 'vent_window'
    const label = nextType === 'vent_window' ? 'هواية/شباك' : 'باب عادي'
    const itemCount = (door.door_items || []).length
    const warning = itemCount > 0
      ? `تحويل "${door.door_code}" إلى ${label} هيمسح كل بنوده الحالية (${itemCount} بند) وأي تركيبات مسجلة عليها نهائيًا${nextType === 'vent_window' ? '، وهيضيف بدلها بند "حلق هواية/شباك" وبند "عدد الهوايات" بكمية 1 لكل منهما (تقدر تعدّل كمية عدد الهوايات بعدين حسب العدد الفعلي)' : ''}. متأكد؟`
      : `تحويل "${door.door_code}" إلى ${label}؟`
    if (!window.confirm(warning)) return
    setBusyId(door.id)
    try {
      await performToggleType(door, nextType)
      onReload()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusyId('')
    }
  }

  async function bulkToggleType(nextType) {
    const targets = filteredDoors.filter((d) => selected.has(d.id))
    if (targets.length === 0) return
    const label = nextType === 'vent_window' ? 'هواية/شباك' : 'باب عادي'
    const ok = window.confirm(
      `تحويل ${targets.length} باب إلى ${label} هيمسح كل بنودهم الحالية وأي تركيبات مسجلة عليها نهائيًا. متأكد؟`
    )
    if (!ok) return
    setBulkBusy(true)
    try {
      for (const door of targets) {
        await performToggleType(door, nextType)
      }
      onReload()
      setSelected(new Set())
    } catch (e) {
      onError(e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkVariantChange(variant) {
    const targets = filteredDoors.filter((d) => selected.has(d.id))
    let doorLeafItems = targets
      .map((d) => (d.door_items || []).find((it) => it.item_types?.name === 'ضلفة'))
      .filter(Boolean)
    const totalFound = doorLeafItems.length
    if (profile.role !== 'admin') {
      doorLeafItems = doorLeafItems.filter((it) => it.status === 'pending_review')
    }
    const skippedApproved = totalFound - doorLeafItems.length
    if (doorLeafItems.length === 0) {
      onError(
        skippedApproved > 0
          ? 'كل بنود الضلفة في الأبواب المحددة معتمدة بالفعل من المهندس - مدخل البيانات مايقدرش يعدّلها بعد الاعتماد.'
          : 'مفيش بند "ضلفة" في أي من الأبواب المحددة.'
      )
      return
    }
    const label = variant === 'large' ? 'ضلفة كبيرة' : variant === 'sliding' ? 'ضلفة جرار' : 'ضلفة عادية'
    const skipNote = skippedApproved > 0 ? ` (${skippedApproved} باب اتجاهل لإن بند الضلفة فيه معتمد بالفعل)` : ''
    const ok = window.confirm(
      `تعديل ${doorLeafItems.length} بند ضلفة إلى "${label}"${skipNote}${variant === 'sliding' ? '، وده هيمسح باقي بنود كل باب من الأبواب دي (غير الضلفة نفسها)' : ''}. متأكد؟`
    )
    if (!ok) return
    setBulkBusy(true)
    try {
      for (const it of doorLeafItems) {
        await performVariantChange(it, variant)
      }
      onReload()
      setSelected(new Set())
    } catch (e) {
      onError(e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDeletePendingByType(itemTypeId, itemTypeName) {
    const pendingIds = []
    doors.forEach((d) => (d.door_items || []).forEach((it) => {
      if (it.status === 'pending_review' && it.item_type_id === itemTypeId) pendingIds.push(it.id)
    }))
    if (pendingIds.length === 0) { onError(`مفيش أي بند معلّق من نوع "${itemTypeName}" في المشروع ده.`); return }
    const ok = window.confirm(`هيتمسح ${pendingIds.length} بند معلّق من نوع "${itemTypeName}" في المشروع كامل. البنود المعتمدة من النوع ده مش هتتأثر. الإجراء ده مايتراجعش فيه. متأكد؟`)
    if (!ok) return
    setBulkBusy(true)
    try {
      const CHUNK = 150
      for (let i = 0; i < pendingIds.length; i += CHUNK) {
        const batch = pendingIds.slice(i, i + CHUNK)
        const { error } = await supabase.from('door_items').delete().in('id', batch)
        if (error) throw error
      }
      onReload()
    } catch (e) {
      onError(e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkApproveAllPending() {
    const pendingIds = []
    doors.forEach((d) => (d.door_items || []).forEach((it) => { if (it.status === 'pending_review') pendingIds.push(it.id) }))
    if (pendingIds.length === 0) return
    const ok = window.confirm(`اعتماد ${pendingIds.length} بند معلّق في هذا المشروع؟`)
    if (!ok) return
    setBulkBusy(true)
    try {
      const CHUNK = 150
      for (let i = 0; i < pendingIds.length; i += CHUNK) {
        const batch = pendingIds.slice(i, i + CHUNK)
        const { error } = await supabase
          .from('door_items')
          .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
          .in('id', batch)
        if (error) throw error
      }
      onReload()
    } catch (e) {
      onError(e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleItemApproval(itemId, newStatus) {
    const { error } = await supabase
      .from('door_items')
      .update({ status: newStatus, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) { onError(error.message); return }
    onReload()
  }

  async function handleDeleteItem(itemId, itemLabel) {
    const ok = window.confirm(`متأكد إنك عايز تمسح "${itemLabel}"؟ الإجراء ده مايتراجعش فيه.`)
    if (!ok) return
    const { error } = await supabase.from('door_items').delete().eq('id', itemId)
    if (error) { onError(error.message); return }
    onReload()
  }

  async function handleQuantityChange(doorItemId, newQty) {
    const q = Number(newQty)
    if (!Number.isFinite(q) || q < 1) return
    const { error } = await supabase.from('door_items').update({ quantity: q }).eq('id', doorItemId)
    if (error) { onError(error.message); return }
    onReload()
  }

  async function performVariantChange(doorItem, variant) {
    const points = variant === 'regular' ? null : (variantPoints[variant] ?? FALLBACK_VARIANT_POINTS[variant] ?? null)
    const { error } = await supabase
      .from('door_items')
      .update({ variant: variant === 'regular' ? null : variant, points_override: points })
      .eq('id', doorItem.id)
    if (error) throw error
    if (variant === 'sliding') {
      const { error: delErr } = await supabase.from('door_items').delete().eq('door_id', doorItem.door_id).neq('id', doorItem.id)
      if (delErr) throw delErr
    }
  }

  async function handleVariantChange(doorItem, variant) {
    if (variant === 'sliding') {
      const ok = window.confirm('تحويل لضلفة باب جرار هيمسح كل باقي بنود هذا الباب وأي تركيبات تمت عليها نهائيًا (غير الضلفة نفسها). متأكد؟')
      if (!ok) return
    }
    setBusyId(doorItem.door_id)
    try {
      await performVariantChange(doorItem, variant)
      onReload()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusyId('')
    }
  }

  if (doors.length === 0) {
    return <div className="empty-state"><div className="icon">🚪</div>لا توجد أبواب مُضافة بعد.</div>
  }

  const canBulkEdit = ['admin', 'data_entry', 'engineer'].includes(profile.role)
  return (
    <div className="card">
      {['admin', 'data_entry', 'engineer'].includes(profile.role) && (
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h3 style={{ marginBottom: 0 }}>ملخص بنود المشروع</h3>
            <span className="badge badge-ok">إجمالي نقاط المشروع: {itemsSummary.totalPoints}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            {itemsSummary.byType.map((it) => (
              <span key={it.name} className="badge badge-empty">{it.name}: {it.qty}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span className="badge badge-pending">معلّق: {itemsSummary.pending}</span>
            <span className="badge badge-ok">معتمد: {itemsSummary.approved}</span>
            <span className="badge badge-danger">مرفوض: {itemsSummary.rejected}</span>
          </div>
          {profile.role === 'data_entry' && itemsSummary.rejectedList.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13.5 }}>البنود المرفوضة (محتاجة تصحيح):</strong>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 18, fontSize: 13 }}>
                {itemsSummary.rejectedList.map((r, i) => (
                  <li key={i}><span className="code-cell">{r.door_code}</span> — {r.item_type} × {r.quantity}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {(profile.role === 'admin' || profile.role === 'engineer') && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn-secondary sm" disabled={bulkBusy} onClick={bulkApproveAllPending}>
            اعتماد كل البنود المعلّقة في المشروع
          </button>
        </div>
      )}
      {['admin', 'data_entry'].includes(profile.role) && !isDelivered && (() => {
        const deletePendingCount = deleteTypeId
          ? doors.reduce((sum, d) => sum + (d.door_items || []).filter((it) => it.status === 'pending_review' && it.item_type_id === deleteTypeId).length, 0)
          : 0
        return (
          <div className="no-print" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>تصحيح غلطة إدخال جماعية (لنوع بند اتضاف غلط لعدة أبواب)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              بيمسح بس البنود "المعلّقة" من النوع اللي تختاره (اللي لسه ما اعتمدهاش المهندس) — أي بند من نفس النوع اتعتمد أو اترفض قبل كده مش هيتأثر خالص.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={deleteTypeId} onChange={(e) => setDeleteTypeId(e.target.value)} style={{ maxWidth: 200 }}>
                <option value="">-- اختار نوع البند --</option>
                {itemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {deleteTypeId && (
                <span className={deletePendingCount > 0 ? 'badge badge-pending' : 'badge badge-empty'}>
                  {deletePendingCount > 0 ? `هيتمسح ${deletePendingCount} بند معلّق` : 'مفيش بنود معلّقة من النوع ده'}
                </span>
              )}
              <button
                className="btn-danger sm"
                disabled={bulkBusy || !deleteTypeId || deletePendingCount === 0}
                onClick={() => bulkDeletePendingByType(deleteTypeId, itemTypes.find((t) => t.id === deleteTypeId)?.name || '')}
              >
                🗑️ امسح المعلّق من النوع ده
              </button>
            </div>
          </div>
        )
      })()}
      <DoorFilter doors={doors} onFilteredChange={setFilteredDoors} />

      <table>
        <thead>
          <tr>
            {canBulkEdit && (
              <th>
                <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
              </th>
            )}
            <th>كود الباب</th><th>السيريال</th><th>النوع</th><th>المبنى / الدور</th><th>البنود</th><th></th>
          </tr>
        </thead>
        <tbody>
          {selectionFilteredDoors.map((d) => (
            <tr key={d.id}>
              {canBulkEdit && (
                <td>
                  <input type="checkbox" checked={selected.has(d.id)} onChange={(e) => toggleSelectOne(d.id, e.target.checked)} />
                </td>
              )}
              <td className="code-cell">{d.door_code}</td>
              <td>{d.serial}</td>
              <td>
                <span className={d.door_type === 'vent_window' ? 'badge badge-pending' : 'badge badge-empty'}>
                  {d.door_type === 'vent_window' ? 'هواية/شباك' : 'باب'}
                </span>
              </td>
              <td>{d.building} / {d.floor}</td>
              <td>
                {sortByItemOrder(d.door_items || [], (it) => it.item_types?.name).map((it) => {
                  const isDoorLeaf = it.item_types?.name === 'ضلفة'
                  const isVentCount = it.item_types?.name === 'عدد الهوايات'
                  const canEdit = ['admin', 'data_entry', 'engineer'].includes(profile.role) && !isDelivered
                  const canApproveItem = ['admin', 'engineer'].includes(profile.role) && !isDelivered
                  const canDeletePending = ['admin', 'data_entry'].includes(profile.role) && !isDelivered && it.status === 'pending_review'
                  const variantLabel = it.variant === 'large' ? ' (كبيرة)' : it.variant === 'sliding' ? ' (جرار)' : ''
                  const statusCls = it.status === 'approved' ? 'badge-empty' : it.status === 'rejected' ? 'badge-danger' : 'badge-pending'
                  const canChangeVariant = profile.role === 'admin' || (profile.role === 'data_entry' && it.status === 'pending_review')
                  if (isDoorLeaf && canChangeVariant && !isDelivered) {
                    return (
                      <select
                        key={it.id}
                        value={it.variant || 'regular'}
                        disabled={busyId === d.id}
                        onChange={(e) => handleVariantChange({ id: it.id, door_id: d.id }, e.target.value)}
                        className="badge badge-empty"
                        style={{ marginInlineEnd: 4, cursor: 'pointer', border: 'none' }}
                      >
                        <option value="regular">ضلفة عادية × {it.quantity}</option>
                        <option value="large">ضلفة كبيرة × {it.quantity} (50 نقطة)</option>
                        <option value="sliding">ضلفة جرار × {it.quantity} (100 نقطة)</option>
                      </select>
                    )
                  }
                  if (isVentCount && canEdit) {
                    return (
                      <span key={it.id} className={`badge ${statusCls}`} style={{ marginInlineEnd: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        عدد الهوايات ×
                        <input
                          type="number" min={1} defaultValue={it.quantity}
                          onBlur={(e) => { if (Number(e.target.value) !== it.quantity) handleQuantityChange(it.id, e.target.value) }}
                          style={{ width: 44, border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 700 }}
                        />
                        {it.status === 'pending_review' && canApproveItem && (
                          <>
                            <button type="button" title="اعتماد" onClick={() => handleItemApproval(it.id, 'approved')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✅</button>
                            <button type="button" title="رفض" onClick={() => handleItemApproval(it.id, 'rejected')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>❌</button>
                          </>
                        )}
                        {canDeletePending && (
                          <button type="button" title="حذف (غلطة إدخال)" onClick={() => handleDeleteItem(it.id, `عدد الهوايات × ${it.quantity}`)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🗑️</button>
                        )}
                      </span>
                    )
                  }
                  return (
                    <span key={it.id} className={`badge ${statusCls}`} style={{ marginInlineEnd: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {it.item_types?.name} × {it.quantity}{variantLabel}
                      {it.status === 'pending_review' && canApproveItem && (
                        <>
                          <button type="button" title="اعتماد" onClick={() => handleItemApproval(it.id, 'approved')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✅</button>
                          <button type="button" title="رفض" onClick={() => handleItemApproval(it.id, 'rejected')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>❌</button>
                        </>
                      )}
                      {canDeletePending && (
                        <button type="button" title="حذف (غلطة إدخال)" onClick={() => handleDeleteItem(it.id, `${it.item_types?.name} × ${it.quantity}`)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🗑️</button>
                      )}
                    </span>
                  )
                })}
              </td>
              <td>
                {profile.role === 'admin' && (
                  <button className="btn-secondary sm" disabled={busyId === d.id} onClick={() => toggleType(d)}>
                    {d.door_type === 'vent_window' ? 'تحويل لباب' : 'تحويل لهواية/شباك'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectionFilteredDoors.length === 0 && (
        <div className="empty-state">
          <div className="icon">🔍</div>
          {showSelectedOnly ? 'مفيش أي حاجة من المحدد ظاهرة تحت الفلتر الحالي.' : 'مفيش أبواب مطابقة للبحث.'}
        </div>
      )}

      {canBulkEdit && selected.size > 0 && (
        <div className="sticky-action-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>تم اختيار {selected.size} باب</span>
          <button type="button" className={showSelectedOnly ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setShowSelectedOnly((s) => !s)}>
            {showSelectedOnly ? 'اعرض الكل' : 'اعرض المحدد بس'}
          </button>
          {!isDelivered && (
            <>
              <button className="btn-secondary sm" disabled={bulkBusy} onClick={() => bulkToggleType('vent_window')}>
                تحويل الكل لهواية/شباك
              </button>
              <button className="btn-secondary sm" disabled={bulkBusy} onClick={() => bulkToggleType('door')}>
                تحويل الكل لباب عادي
              </button>
              {['admin', 'data_entry'].includes(profile.role) && (
                <>
                  <button className="btn-secondary sm" disabled={bulkBusy} onClick={() => bulkVariantChange('large')}>
                    الضلفة كبيرة للكل
                  </button>
                  <button className="btn-secondary sm" disabled={bulkBusy} onClick={() => bulkVariantChange('sliding')}>
                    الضلفة جرار للكل
                  </button>
                </>
              )}
            </>
          )}
          <button className="btn-secondary sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            إلغاء التحديد
          </button>
        </div>
      )}
    </div>
  )
}
