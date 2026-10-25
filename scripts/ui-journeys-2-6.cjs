// Requires Playwright with Chromium (not a dependency of this app). Start the app first: npm run build && npm run preview -- --port 4173
// Plays journeys 2–6, the CEO exception and the closure chain through the real UI (clicks and forms).
// usage: node scripts/ui-journeys-2-6.cjs http://localhost:4173 <screenshotsDir>
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let pass = 0;
let fail = 0;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  let n = 0;
  const shot = async (tag) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${tag}.png`, fullPage: true });
  const result = (ok, label) => { ok ? pass++ : fail++; console.log(`  ${ok ? '✓' : '✗'} ${label}`); };
  const go = async (r) => { await page.goto(`${base}/#${r}`); await page.waitForTimeout(350); };
  const as = async (name) => {
    await page.keyboard.press('Escape');
    await page.locator('button[title^="تبديل المستخدم"]').click();
    await page.getByPlaceholder('بحث بالاسم أو المسمى').fill(name);
    await page.locator('button', { hasText: name }).last().click();
    await page.waitForTimeout(150);
  };
  const tab = async (name) => { await page.getByRole('tab', { name, exact: false }).first().click(); await page.waitForTimeout(200); };
  const drawer = () => page.locator('div.fixed.inset-0.z-50 aside');
  const scope = (text) => (text ? page.locator('section, li, tr, article').filter({ hasText: text }).last() : page);
  const root = async (text, label) => (!text && (await drawer().count()) ? drawer() : text ? page.locator('div, section, li, tr, article').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: label, exact: true }) }).last() : page);
  const toastText = async () => ((await page.locator('div.fixed.bottom-4 > div').last().textContent().catch(() => '')) || '').trim();
  /** Click a command button, fill its form, submit. `refuse: true` expects the engine to refuse. */
  const cmd = async (label, { within, fill = {}, select = {}, check = [], uncheck = [], refuse = false } = {}) => {
    const btn = (await root(within, label)).getByRole('button', { name: label, exact: true }).first();
    if (!(await btn.count()) && refuse) { result(true, `${label} not offered to this user (hidden; the engine also refuses)`); return false; }
    if (!(await btn.count())) { result(false, `${label}: button not found${within ? ` in «${within}»` : ''}`); await shot(`missing-${label}`); return false; }
    await btn.click();
    await page.waitForTimeout(150);
    const dlg = page.getByRole('dialog');
    let error = '';
    if (await dlg.count()) {
      for (const [lbl, v] of Object.entries(fill)) await dlg.getByLabel(lbl, { exact: false }).first().fill(String(v));
      for (const [lbl, v] of Object.entries(select)) {
        const el = dlg.getByLabel(lbl, { exact: false }).first();
        const opts = await el.locator('option').allTextContents();
        const hit = opts.find((o) => o.includes(v));
        await el.selectOption({ label: hit ?? v });
      }
      for (const lbl of check) await dlg.locator('label', { hasText: lbl }).last().locator('input').first().check();
      for (const lbl of uncheck) await dlg.locator('label', { hasText: lbl }).last().locator('input').first().uncheck();
      await dlg.locator('footer').getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(250);
      if (await dlg.count()) {
        error = (await dlg.locator('p.text-st-danger').allTextContents().catch(() => [])).join(' ') || 'dialog still open';
        await page.keyboard.press('Escape');
      }
    } else {
      const t = await toastText();
      if (/لا تملك|غير مستوفاة|تعارض|مرفوض|يتجاوز/.test(t)) error = t;
    }
    if (refuse) result(!!error, `${label} refused as expected: ${error.slice(0, 110)}`);
    else {
      result(!error, `${label}${error ? ` — ${error.slice(0, 140)}` : ` — ${(await toastText()).slice(0, 80)}`}`);
      if (error) await shot(`fail-${label}`);
    }
    return !error;
  };
  const see = async (text, label) => result((await page.getByText(text, { exact: false }).count()) > 0, label);
  const openRow = async (text) => { await page.getByText(text, { exact: false }).first().click(); await page.waitForTimeout(250); };

  await go('/dashboard');
  await page.evaluate(() => localStorage.clear());
  await go('/dashboard');

  console.log('Journey 2 — licensing (GOV-2026-0011)');
  const G = '/gov?id=GOV-2026-0011';
  await as('نورة السالم'); await go(G);
  await cmd('تقديم على المنصة — جولة 1', { fill: { 'رقم الطلب': 'B-1' }, refuse: true });
  await cmd('طلب المستندات من العميل');
  await as('علي القحطاني'); await go(G);
  await cmd('وصلت مستندات العميل');
  await as('نورة السالم'); await go(G);
  await cmd('تقديم على المنصة — جولة 1', { fill: { 'رقم الطلب في المنصة': 'BALADY-77812', 'رسوم الجهة': 2400 }, check: ['تم التحقق من فاتورة الرسوم'], select: { 'من يدفع الرسوم': 'أباك' } });
  await as('م. سامي القحطاني'); await go('/projects/PRJ-2026-0003?tab=costs');
  await openRow('رسوم رخصة');
  await cmd('قرار مدير الأقسام', { select: { 'القرار': 'اعتماد' } });
  await as('منى العتيبي'); await go('/finance'); await tab('تكاليف للصرف');
  await cmd('صرف', { within: 'رسوم رخصة', fill: { 'المبلغ': 2400, 'إثبات الصرف': 'SADAD-1' } });
  await as('عبدالرحمن الحربي'); await go(G);
  await cmd('إسناد لمعقّب', { select: { 'المعقّب': 'محمد الشهري' } });
  await see('رقم الطلب', 'transaction drawer open'); await see('معقّب', 'expeditor shown');
  await go('/dashboard'); await page.getByRole('button', { name: '+أسبوع' }).click(); await page.waitForTimeout(300);
  await go('/work'); await see('تأخر التحديث الأسبوعي', 'transactions manager sees the missing weekly update');
  await as('محمد الشهري'); await go(G);
  await cmd('تحديث المتابعة الأسبوعي', { fill: { 'النتيجة': 'قيد المراجعة الفنية', 'حالة المنصة': 'تحت الدراسة' } });
  await cmd('تسجيل نتيجة الجهة', { select: { 'النتيجة': 'ملاحظات فنية' }, fill: { 'نص الملاحظات': 'تعديل الارتداد الأمامي' } });
  await as('م. سارة الغامدي'); await go('/work');
  await openRow('معالجة ملاحظات الجهة');
  await cmd('بدء العمل');
  await cmd('إكمال بنتيجة موثقة', { fill: { 'النتيجة الموثقة': 'عُدّلت المخططات حسب ملاحظات الأمانة' } });
  await as('نورة السالم'); await go(G);
  await cmd('إعادة التقديم — جولة 2', { fill: { 'رقم الطلب في المنصة': 'BALADY-77812' }, check: ['تم التحقق من فاتورة الرسوم'] });
  await as('محمد الشهري'); await go(G);
  await cmd('تسجيل نتيجة الجهة', { select: { 'النتيجة': 'صدرت' }, fill: { 'رقم الوثيقة': '4410023871', 'تاريخ الإصدار': '2026-11-02', 'تاريخ الانتهاء': '2029-11-02' } });
  await shot('gov-issued');
  await as('منى العتيبي'); await go('/projects/PRJ-2026-0003?tab=payments');
  await see('مستحقة', 'licence payment is due');
  await see('مكتمل فنيًا', 'project technically complete');

  console.log('Journey 3 — supervision visits');
  await as('م. خالد المالكي'); await go('/visits');
  await cmd('جدولة زيارة', { fill: { 'الغرض': 'زيارة إشراف إضافية', 'الموقع': 'مستودعات السلي', 'الموعد المخطط': '2026-10-26T10:00' }, check: ['م. عمر الشمري'], refuse: true });
  await as('م. تركي السبيعي'); await go('/visits?id=VST-2026-0023');
  await cmd('اعتماد تقرير الإشراف', { select: { 'القرار': 'اعتماد التقرير' } });
  await as('م. خالد المالكي'); await go('/visits?id=VST-2026-0024');
  await cmd('تسجيل الوصول');
  await cmd('متعذرة', { fill: { 'سبب التعذر': 'الموقع مغلق', 'إثبات الحضور': 'صورة البوابة + الموقع' } });
  await see('متعذرة', 'inaccessible visit recorded');
  await as('منى العتيبي'); await go('/finance'); await tab('زيارات للفوترة');
  await cmd('مطالبة يدوية', { check: ['VST-2026-0022', 'VST-2026-0023'], fill: { 'مبلغ المطالبة': 6000, 'مرجع المطالبة': 'CLM-1' } });
  await shot('visits-claimed');

  console.log('Journey 4 — standalone task');
  await as('مدير النظام'); await go('/work');
  await openRow('تجديد اشتراك برنامج التصميم');
  await cmd('بدء العمل');
  await cmd('إكمال بنتيجة موثقة', { fill: { 'النتيجة الموثقة': 'جُدّد الاشتراك حتى أكتوبر 2027' } });

  console.log('Journey 5 — pre-system project');
  await as('م. يوسف البقمي'); await go('/projects/PRJ-2026-0005?tab=plan');
  await cmd('بدء التنفيذ', { refuse: true });
  await as('منى العتيبي'); await go('/finance'); await tab('مشاريع قائمة');
  await cmd('مراجعة الأرصدة السابقة', { fill: { 'نتيجة المراجعة': 'رصيد سابق 40,000 مسدد بالكامل' } });
  await as('م. ريم الشهري'); await go('/projects/PRJ-2026-0005?tab=team');
  await cmd('تعيين مسؤول', { select: { 'مسؤول': 'م. يوسف البقمي' } });
  await cmd('تعيين مسؤول', { select: { 'مسؤول': 'م. يوسف البقمي' } });
  await as('م. يوسف البقمي'); await go('/projects/PRJ-2026-0005?tab=plan');
  await cmd('بدء التنفيذ');
  await see('قيد التنفيذ', 'pre-system project in progress');

  console.log('Journey 6 — one project, three sites');
  await go('/projects/PRJ-2026-0004?tab=changes');
  await cmd('مسار تنفيذ مستقل', { fill: { 'اسم المسار': 'مسار محطة 3', 'السبب': 'جدول مستقل للمحطة 3' }, check: ['تصميم محطة 3'] });
  await as('م. سامي القحطاني'); await go('/projects/PRJ-2026-0004?tab=changes');
  await cmd('اعتماد', { within: 'مسار محطة 3' });
  await as('م. يوسف البقمي'); await go('/projects/PRJ-2026-0004?tab=plan');
  await cmd('تعليق الموقع', { within: 'محطة 2', fill: { 'السبب': 'بانتظار صك الأرض من العميل' } });
  await see('قيد التنفيذ', 'other sites continue');
  await shot('multi-site');

  console.log('CEO exception');
  await as('م. فهد الدوسري'); await go('/intake'); await tab('استثناء البدء');
  await cmd('طلب استثناء بدء', { refuse: true, select: { 'الفرصة': 'OPP-2026-0150' }, fill: { 'السبب': 'موعد مدن', 'مستند التعميد القائم': 'PO-7781', 'وصف النطاق المسموح': 'التصميم الإنشائي فقط', 'المدة': 30, 'سقف التكلفة': 10000 } });
  await cmd('طلب استثناء بدء', { select: { 'الفرصة': 'OPP-2026-0150' }, check: ['التصميم الإنشائي للمصنع'], fill: { 'السبب': 'موعد مدن', 'مستند التعميد القائم': 'PO-7781', 'وصف النطاق المسموح': 'التصميم الإنشائي فقط', 'المدة': 30, 'سقف التكلفة': 10000 } });
  await as('م. سامي القحطاني'); await go('/intake'); await tab('استثناء البدء');
  await cmd('منح الاستثناء', { refuse: true });
  await as('م. خالد الزهراني'); await go('/intake'); await tab('استثناء البدء');
  await cmd('منح الاستثناء', { fill: { 'ملاحظة القرار': 'بحدود السقف' } });
  await go('/projects/PRJ-2026-0006');
  await see('البنود المسموحة: التصميم الإنشائي للمصنع', 'project bar names the allowed scope items');
  await go('/projects/PRJ-2026-0006?tab=deliverables');
  result((await page.getByText('خارج نطاق الاستثناء', { exact: false }).count()) > 0, 'deliverables outside the allowed scope are marked as waiting for finance');
  await shot('exception-scope');
  await as('منى العتيبي'); await go('/intake'); await tab('طلبات التفعيل');
  await cmd('اعتماد المالية', { within: 'ACT-2026-0032' });
  await go('/projects');
  result((await page.getByText('PRJ-2026-0006').count()) > 0 && (await page.getByText('PRJ-2026-0007').count()) === 0, 'finance approval linked to the same project PRJ-2026-0006 (no PRJ-2026-0007)');
  await go('/projects/PRJ-2026-0006?tab=deliverables');
  result((await page.getByText('خارج نطاق الاستثناء', { exact: false }).count()) === 0, 'after finance approval no deliverable is held by the exception scope');

  console.log('Task contributors and attachments (TK-03)');
  const T = 'تجهيز ملف تأهيل لمنافسة البلدية';
  await as('م. سامي القحطاني'); await go('/work');
  await cmd('مهمة جديدة', { fill: { 'عنوان المهمة': T }, select: { 'المسؤول': 'م. ريم الشهري' }, check: ['م. سارة الغامدي', 'م. فهد الدوسري'] });
  await as('م. سارة الغامدي'); await go('/work'); await tab('أساهم فيها');
  await see(T, 'the contributor finds the task under «أساهم فيها»');
  await openRow(T);
  await cmd('إرفاق ملفات', { fill: { 'أسماء الملفات': 'شهادة التصنيف.pdf' } });
  await see('شهادة التصنيف.pdf', 'attachment listed with its Nextcloud reference');
  await shot('task-attachments');
  await as('م. ريم الشهري'); await go('/work'); await tab('المسندة إليّ');
  await openRow(T);
  await cmd('تعديل الموعد / الأولوية / المراجع / المساهمين', { uncheck: ['م. فهد الدوسري'], fill: { 'سبب التعديل': 'لم يعد القسم الإنشائي مطلوبًا' } });
  await as('م. فهد الدوسري'); await go('/work'); await tab('أساهم فيها');
  result((await page.getByText(T, { exact: false }).count()) === 0, 'a removed contributor no longer sees the task under «أساهم فيها»');

  console.log('Closure chain and collection after closure (PRJ-2026-0001)');
  const C = '/projects/PRJ-2026-0001?tab=closure';
  await as('م. ياسر البلوي'); await go(C);
  await cmd('طلب الإغلاق', { fill: { 'ملخص الإغلاق': 'سُلّمت كل المخرجات' } });
  await as('م. سامي القحطاني'); await go(C);
  await cmd('اعتماد', { refuse: true });
  for (const who of ['م. عادل الشمراني', 'م. سامي القحطاني', 'منى العتيبي', 'م. خالد الزهراني']) {
    await as(who); await go(C);
    await cmd('اعتماد');
  }
  await see('مغلق تشغيليًا', 'operationally closed');
  await as('منى العتيبي'); await go('/projects/PRJ-2026-0001?tab=payments&p=FPS-2026-0001-2');
  await cmd('تسجيل تحصيل (المالية فقط)', { fill: { 'المبلغ': 17500, 'رقم السند': 'RCV-AFTER' } });
  await go(C);
  await cmd('الإغلاق المالي', { fill: { 'ملخص التسوية': 'سويت الأرصدة' } });
  await see('مسوّى ماليًا', 'financial closure after collection');
  await shot('closed');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errors.length ? errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})();
