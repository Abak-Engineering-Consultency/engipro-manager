// Requires Playwright with Chromium (not a dependency of this app). Start the app first: npm run build && npm run preview -- --port 4173
// Plays the start of journey 1 and a few cross-checks through the real UI (clicks, forms, toasts).
// usage: node scripts/ui-journey-1.cjs http://localhost:4173 <screenshotsDir>
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  let n = 0;
  const shot = async (tag) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${tag}.png`, fullPage: true });
  const go = async (r) => { await page.goto(`${base}/#${r}`); await page.waitForTimeout(400); };
  const as = async (name) => {
    await page.keyboard.press('Escape');
    await page.locator('button[title^="تبديل المستخدم"]').click();
    await page.getByPlaceholder('بحث بالاسم أو المسمى').fill(name);
    await page.locator('button', { hasText: name }).last().click();
    await page.waitForTimeout(200);
  };
  const scope = (text) => (text ? page.locator('section, li, tr, article').filter({ hasText: text }).last() : page);
  /** Click a command button (optionally inside the block containing `within`), fill its form, submit. */
  const cmd = async (label, { within, fill = {}, select = {}, check = [] } = {}) => {
    const btn = scope(within).getByRole('button', { name: label, exact: true }).first();
    await btn.click();
    const dlg = page.getByRole('dialog');
    if (await dlg.count()) {
      for (const [lbl, v] of Object.entries(fill)) await dlg.getByLabel(lbl, { exact: false }).first().fill(String(v));
      for (const [lbl, v] of Object.entries(select)) {
        const el = dlg.getByLabel(lbl, { exact: false }).first();
        await el.selectOption({ label: v }).catch(async () => el.selectOption(v));
      }
      for (const lbl of check) await dlg.getByLabel(lbl, { exact: false }).first().check();
      await dlg.locator('footer').getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(250);
      const err = await dlg.locator('p.text-st-danger').allTextContents().catch(() => []);
      if (await dlg.count()) {
        console.log(`  ✗ ${label}: ${err.join(' ') || 'dialog still open'}`);
        await shot(`fail-${label}`);
        await page.keyboard.press('Escape');
        return false;
      }
    }
    await page.waitForTimeout(250);
    const toast = (await page.locator('div.fixed.bottom-4 > div').last().textContent().catch(() => '')) || '';
    console.log(`  ✓ ${label}${toast ? ` — ${toast.trim().slice(0, 90)}` : ''}`);
    return true;
  };
  const expectText = async (text, label) => {
    const ok = (await page.getByText(text, { exact: false }).count()) > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };

  await go('/dashboard');
  await page.evaluate(() => localStorage.clear());
  await go('/dashboard');

  console.log('Finance approves the activation');
  await as('منى العتيبي');
  await go('/intake');
  await cmd('اعتماد المالية', { within: 'ACT-2026-0031' });
  await cmd('إعادة معالجة الحدث', { within: 'ACT-2026-0031' });
  await shot('intake-after-approve');

  console.log('Director receives');
  await as('م. سامي القحطاني');
  await go('/projects/PRJ-2026-0006');
  await shot('project-awaiting');
  await cmd('استلام المشروع وتحديد الأقسام', { select: { 'القسم الرئيسي': 'التصميم' } });

  console.log('Department manager nominates, Director approves');
  await as('م. ريم الشهري');
  await go('/projects/PRJ-2026-0006');
  await cmd('ترشيح مدير المشروع', { select: { 'المرشح': 'م. سارة الغامدي — مهندسة معمارية' } });
  await as('م. سامي القحطاني');
  await go('/projects/PRJ-2026-0006');
  await cmd('اعتماد مدير المشروع');
  await expectText('تجهيز', 'project is in preparation');

  console.log('PM tries to start too early (AC-02)');
  await as('م. سارة الغامدي');
  await go('/projects/PRJ-2026-0006?tab=plan');
  await cmd('بدء التنفيذ');
  await shot('plan-gate');

  console.log('Owners assigned by each department manager');
  await as('م. ريم الشهري');
  await go('/projects/PRJ-2026-0006?tab=team');
  await shot('team-before');
  await cmd('تعيين مسؤول', { select: { 'مسؤول': 'م. سارة الغامدي — مهندسة معمارية' } });
  await cmd('تعيين مسؤول', { select: { 'مسؤول': 'م. يوسف البقمي — مهندس معماري' } });
  await as('م. فهد الدوسري');
  await go('/projects/PRJ-2026-0006?tab=team');
  await cmd('تعيين مسؤول', {});
  await as('م. هالة المطيري');
  await go('/projects/PRJ-2026-0006?tab=team');
  await cmd('تعيين مسؤول', {});
  await shot('team-after');

  console.log('PM plans; payment links; finance confirms; kickoff; start');
  await as('م. سارة الغامدي');
  await go('/projects/PRJ-2026-0006?tab=plan');
  await cmd('من بنود العرض');
  await shot('plan-items');
  await go('/projects/PRJ-2026-0006?tab=payments');
  await page.getByRole('button', { name: 'تحرير الربط وإرساله' }).click();
  const dlg = page.getByRole('dialog');
  const block = (i) => dlg.locator('div.rounded-lg.border').nth(i);
  await block(1).locator('select').selectOption('deliverables');
  for (const box of await block(1).locator('label', { hasText: 'المفهوم' }).all()) await box.locator('input').check();
  await block(2).locator('select').selectOption('items');
  await block(2).locator('label', { hasText: 'التصميم الإنشائي' }).first().locator('input').check();
  await block(3).locator('select').selectOption('deliverables');
  await block(3).locator('label', { hasText: 'رخصة بناء إلكترونية' }).first().locator('input').check();
  await shot('mapping-editor');
  await dlg.getByRole('button', { name: 'إرسال للمالية للتحقق' }).click();
  await page.waitForTimeout(300);
  console.log(`  ${(await dlg.count()) ? '✗' : '✓'} payment links sent to finance`);

  await as('منى العتيبي');
  await go('/projects/PRJ-2026-0006?tab=payments');
  await cmd('مطابق للاتفاق — تأكيد');

  await as('م. سارة الغامدي');
  await go('/projects/PRJ-2026-0006?tab=plan');
  await cmd('تسجيل الاجتماع', { fill: { 'المحضر': 'اجتماع افتتاحي مع العميل: قنوات التواصل ومواعيد التسليم' } });
  await cmd('بدء التنفيذ');
  await expectText('قيد التنفيذ', 'project in progress');
  await shot('started');

  console.log('Rev 00 → review (preparer refused) → delivery → client comments → Rev 01');
  await go('/projects/PRJ-2026-0006?tab=deliverables&d=DLV-2026-0006-01');
  await cmd('رفع ملفات Rev 00', { fill: { 'أسماء الملفات': 'concept-A-Rev00.pdf' } });
  await cmd('رفع للمراجعة الداخلية');
  await as('م. ريم الشهري');
  await go('/projects/PRJ-2026-0006?tab=deliverables&d=DLV-2026-0006-01');
  await cmd('قرار المراجعة الداخلية', { fill: { 'الملاحظة': 'مطابق' } });
  await as('م. سارة الغامدي');
  await go('/projects/PRJ-2026-0006?tab=deliverables&d=DLV-2026-0006-01');
  await cmd('إرسال موثق للعميل', { fill: { 'المستلم لدى العميل': 'م. عبدالعزيز الراشد' } });
  await cmd('ملاحظات العميل', { fill: { 'نص الملاحظات': 'تعديل المدخل الرئيسي' } });
  await shot('rev01');
  await expectText('Rev 01', 'Rev 01 opened');

  console.log(errors.length ? errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})();
