// كل بند من بنود الشركة وعموده المقابل في نظامنا (البنود اللي مش موجودة هنا، زي architrave، مستبعدة عمدًا)
export const REPORT_COLUMNS = [
  { key: 'frame', label: 'تركيب فريم', match: (r) => r.item_type === 'حلق' },
  { key: 'frame_cast', label: 'صب فريم', match: (r) => r.item_type === 'صب حلق' },
  { key: 'leaf_large', label: 'ضلف (ك)', match: (r) => r.item_type === 'ضلفة' && r.variant === 'large' },
  { key: 'leaf_regular', label: 'ضلف (ص)', match: (r) => r.item_type === 'ضلفة' && !r.variant },
  { key: 'sliding_door', label: 'باب جرار', match: (r) => r.item_type === 'ضلفة' && r.variant === 'sliding' },
  { key: 'vent_frame', label: 'حلق شباك', match: (r) => r.item_type === 'حلق هواية/شباك' },
  { key: 'vent_count', label: 'ريش هواية/شباك', match: (r) => r.item_type === 'عدد الهوايات' },
  { key: 'kalon', label: 'كالون', match: (r) => r.item_type === 'كالون' },
  { key: 'panic', label: 'بانيك', match: (r) => r.item_type === 'بانيك' },
  { key: 'akra', label: 'أكرة', match: (r) => r.item_type === 'أكرة' },
  { key: 'closer', label: 'ماكينة', match: (r) => r.item_type === 'ماكينة غلق' },
  { key: 'coordinator', label: 'مهدئ', match: (r) => r.item_type === 'مهدئ' },
  { key: 'flush_bolt', label: 'ترباس', match: (r) => r.item_type === 'ترباس' },
  { key: 'dust_proof', label: 'صدادة ترباس', match: (r) => r.item_type === 'صدادة ترباس' },
  { key: 'door_stop', label: 'صدادة', match: (r) => r.item_type === 'صدادة' },
  { key: 'd_bottom', label: 'فرش', match: (r) => r.item_type === 'فرش' },
  { key: 'threshold', label: 'عتب', match: (r) => r.item_type === 'عتب' },
  { key: 'astragal', label: 'ستارة', match: (r) => r.item_type === 'ستارة' },
  { key: 'gasket', label: 'كاوتش', match: (r) => r.item_type === 'كاوتش' },
  { key: 'pull_handle', label: 'مقبض', match: (r) => r.item_type === 'مقبض' },
  { key: 'push_plate', label: 'بوش بليت', match: (r) => r.item_type === 'بوش بليت' },
  { key: 'kick_plate', label: 'كيك بليت', match: (r) => r.item_type === 'كيك بليت' },
]

export function emptyColumnTotals() {
  const t = {}
  REPORT_COLUMNS.forEach((c) => { t[c.key] = 0 })
  return t
}
