// وقت القاهرة الحقيقي (Africa/Cairo)، بدل الاعتماد على توقيت جهاز المستخدم -
// نفس المنطقة الزمنية المستخدمة في الـ triggers على مستوى قاعدة البيانات
// (check_workforce_supervisor_time_lock وcheck_monthly_period_lock). لو جهاز
// المستخدم مضبوط على توقيت مختلف، الشاشة دلوقتي هتوافق نفس القرار اللي
// القاعدة هتاخده وقت الحفظ.

function cairoParts() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  })
  return Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]))
}

// تاريخ اليوم بتوقيت القاهرة، بصيغة YYYY-MM-DD
export function cairoTodayStr() {
  const { year, month, day } = cairoParts()
  return `${year}-${month}-${day}`
}

// الساعة الحالية بتوقيت القاهرة (0-23)
export function cairoHour() {
  const { hour } = cairoParts()
  // بعض المتصفحات بترجع "24" بدل "00" مع hour12: false عند منتصف الليل بالظبط
  return parseInt(hour, 10) % 24
}
