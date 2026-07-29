// يستدعي دالة بناء الاستعلام مرارًا بصفحات من 1000 صف لحد ما يجيب كل البيانات،
// عشان نتخطى حد الـ 1000 صف الافتراضي في Supabase مهما كان حجم البيانات الحقيقي.
// الاستخدام: fetchAllRows((from, to) => supabase.from('doors').select('*').range(from, to))
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  let allRows = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) return { data: null, error }
    allRows = allRows.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { data: allRows, error: null }
}
