export const VARIANT_LABELS = { large: 'كبيرة', sliding: 'جرار' }

// يبني ملحوظة زي "(منها: كبيرة ×3، جرار ×2)" لصف فيه متغيرات، أو '' لو مفيش
export function variantNoteFrom(variantsMap) {
  if (!variantsMap) return ''
  const parts = Object.entries(variantsMap)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${VARIANT_LABELS[v] || v} ×${n}`)
  return parts.length > 0 ? ` (منها: ${parts.join('، ')})` : ''
}

export const ITEM_DISPLAY_ORDER = [
  'حلق', 'صب حلق', 'ضلفة', 'حلق هواية/شباك', 'عدد الهوايات', 'كالون', 'بانيك', 'أكرة',
  'ماكينة غلق', 'مهدئ', 'ترباس', 'صدادة ترباس', 'صدادة', 'فرش', 'عتب',
  'ستارة', 'كاوتش', 'مقبض', 'بوش بليت', 'كيك بليت',
]

export function itemOrderIndex(name) {
  const i = ITEM_DISPLAY_ORDER.indexOf(name)
  return i === -1 ? 999 : i
}

// يرتب مصفوفة من العناصر حسب ترتيب البنود المعتمد. getName بيرجع اسم البند من العنصر.
export function sortByItemOrder(arr, getName = (x) => x) {
  return [...arr].sort((a, b) => itemOrderIndex(getName(a)) - itemOrderIndex(getName(b)))
}
