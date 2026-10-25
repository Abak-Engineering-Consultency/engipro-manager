import { Link } from 'react-router-dom';
import { Lock, Paperclip, ShieldCheck } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDate, isAfter } from '../../domain/calendar';
import { deptName } from '../../domain/catalog';
import { deliverableOwners, revLabel } from '../../domain/engine/delivery';
import { DELIVERABLE_STATES } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import { exceptionScope, oppOwner, type ProjectAccess } from '../../domain/selectors';
import type { Deliverable, Project, Revision } from '../../domain/types';
import { CommandButton, DateText, Drawer, Fact, Id, Money, Notice, Pill, StatePill, Table, Td, cn } from '../ui';

const REASONS: Record<Revision['reason'], string> = {
  initial: 'الإصدار الأول',
  internal_return: 'بعد إعادة داخلية',
  client_comments: 'بعد ملاحظات العميل',
};

const CHANNELS = ['البريد الإلكتروني', 'بوابة العميل', 'تسليم ورقي موقع', 'رابط مشاركة Nextcloud', 'منصة الجهة'].map((c) => ({ value: c, label: c }));

/** Deliverables a sales person may see: what is ready to send, sent or approved — never internal work. */
export const clientVisible = (d: Deliverable) =>
  ['ready_for_delivery', 'blocked_pending_payment', 'awaiting_client', 'deemed_acceptance_review', 'client_approved'].includes(d.status) || d.revisions.some((r) => r.issued);

export function DeliverableDrawer({ project, id, access, onClose }: { project: Project; id?: string | null; access: Exclude<ProjectAccess, null>; onClose: () => void }) {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const d = state.deliverables.find((x) => x.id === id && x.projectId === project.id);
  if (!d) return null;
  const client = access === 'client';
  const owners = deliverableOwners(project, d);
  const isOwner = owners.includes(me.id);
  const scope = exceptionScope(state, project);
  const outOfScope = !scope.inScope(d.scopeItemIds);
  const isPm = project.pmId === me.id;
  const isReviewer = allows(me, 'deliverable.review', { depts: [d.deptCode] });
  const isOpp = oppOwner(state, project) === me.id;
  const current = d.revisions[d.revisions.length - 1];
  const gov = d.govTransactionId ? state.gov.find((g) => g.id === d.govTransactionId) : undefined;
  const blockers = state.payments.filter((p) => p.beforeDeliveryOf?.includes(d.id) && p.collection !== 'fully_collected');
  const items = project.scopeItems.filter((i) => d.scopeItemIds.includes(i.id));
  const site = project.sites.find((s) => s.id === d.siteId);
  const linkedPayments = state.payments.filter((p) => p.projectId === project.id && (
    (p.link.kind === 'deliverables' && p.link.ids.includes(d.id)) || (p.link.kind === 'items' && d.scopeItemIds.some((i) => p.link.ids.includes(i)))));
  const responseLate = d.status === 'awaiting_client' && d.responseDueAt && !isAfter(d.responseDueAt, state.now);
  const base = { deliverableId: d.id };
  const revisions = client ? d.revisions.filter((r) => r.issued) : d.revisions;

  const actions = d.requiresGov ? null : (
    <>
      {isOwner && d.status === 'in_preparation' && !outOfScope && (
        <CommandButton command="deliverable.upload" base={base} variant={current?.files.length ? 'secondary' : 'primary'}
          label={current?.files.length && !current.issued ? `تحديث ملفات ${revLabel(current.rev)}` : `رفع ملفات ${revLabel(current && !current.issued ? current.rev : (current ? current.rev + 1 : 0))}`}
          intro="ملف العمل قابل للتحديث حتى يصدر الإصدار."
          fields={[{ name: 'files', label: 'أسماء الملفات (سطر لكل ملف)', type: 'lines', required: true, placeholder: `${d.id}-Rev00.pdf\n${d.id}-Rev00.dwg` }]}
          success="رُفعت الملفات" />
      )}
      {isOwner && d.status === 'in_preparation' && !!current?.files.length && (
        d.technical ? (
          <CommandButton command="deliverable.submit" base={base} label="رفع للمراجعة الداخلية" success="أُرسل للمراجعة"
            confirm="المخرج فني: المراجعة الداخلية إلزامية من مدير القسم أو مفوّض غير المعدّ." />
        ) : (
          <CommandButton command="deliverable.submit" base={base} label="تجهيز للتسليم" success="تم"
            fields={[{ name: 'withReview', label: 'أرسله للمراجعة الداخلية (اختياري للمخرج غير الفني)', type: 'checkbox' }]} />
        )
      )}
      {isReviewer && d.status === 'internal_review' && current?.createdBy !== me.id && (
        <CommandButton command="deliverable.review" base={base} label="قرار المراجعة الداخلية"
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'accepted', label: 'قبول داخلي ← جاهز للتسليم' }, { value: 'returned', label: 'إعادة بملاحظة (جولة جديدة)' }] },
            { name: 'note', label: 'الملاحظة', type: 'textarea' },
          ]} success="سُجّل قرار المراجعة" />
      )}
      {isPm && d.status === 'ready_for_delivery' && (
        <CommandButton command="deliverable.deliver" base={base} label="إرسال موثق للعميل" title={`تسليم ${revLabel(current?.rev)} — ${d.title}`}
          intro={blockers.length ? <Notice tone="waiting">العقد يشترط سداد «{blockers.map((b) => b.label).join('، ')}» قبل هذا التسليم؛ إن لم تؤكد المالية التحصيل سيُمنع التسليم.</Notice> : 'يُثبت الإرسال: القناة، المستلم، التاريخ، ورقم الإصدار — والإصدار الصادر لا يُستبدل.'}
          fields={[
            { name: 'channel', label: 'القناة', type: 'select', options: CHANNELS },
            { name: 'recipient', label: 'المستلم لدى العميل', type: 'text', required: true },
            { name: 'reference', label: 'مرجع خطاب التسليم', type: 'text', placeholder: `TR-${d.id}` },
          ]} success="سُجّل التسليم" />
      )}
      {allows(me, 'project.grant_exception') && d.status === 'blocked_pending_payment' && (
        <CommandButton command="deliverable.ceo_release" base={base} variant="danger" label="استثناء الرئيس التنفيذي للتسليم"
          intro="الاستثناء موثّق ولا يُسقط المبلغ المستحق." fields={[{ name: 'reason', label: 'السبب', type: 'textarea', required: true }]} success="سُجّل الاستثناء" />
      )}
      {isPm && d.status === 'awaiting_client' && (
        <>
          <CommandButton command="deliverable.client_response" base={base} variant="secondary" label="ملاحظات العميل"
            intro={`تُنشئ ${revLabel((current?.rev ?? 0) + 1)} ولا تمسح ${revLabel(current?.rev)} ولا استحقاقًا سابقًا.`}
            fields={[{ name: 'note', label: 'نص الملاحظات', type: 'textarea', required: true }]}
            transform={(v) => ({ ...v, kind: 'comments' })} success="فُتح إصدار جديد" />
          <CommandButton command="deliverable.client_response" base={base} label="قبول صريح من العميل"
            fields={[{ name: 'note', label: 'ملاحظة', type: 'textarea' }, { name: 'proof', label: 'إثبات القبول (خطاب / بريد / محضر)', type: 'text', required: true }]}
            transform={(v) => ({ ...v, kind: 'accepted' })} success="اعتُمد المخرج" />
        </>
      )}
      {(isPm || isOpp) && d.status === 'awaiting_client' && (
        <CommandButton command="deliverable.log_follow_up" base={base} variant="secondary" label="تسجيل متابعة" fields={[{ name: 'note', label: 'نتيجة المتابعة مع العميل', type: 'textarea', required: true }]} success="سُجّلت المتابعة" />
      )}
      {isPm && d.status === 'awaiting_client' && project.deemedAcceptanceClause && (
        <CommandButton command="deliverable.request_deemed" base={base} variant="secondary" label="طلب إثبات قبول وفق العقد"
          intro={<>البند: «{project.deemedAcceptanceClause}». يُتاح بعد انقضاء مهلة الرد ({fmtDate(d.responseDueAt)}) ويعتمده مدير القسم، ويبقى مميزًا عن القبول الصريح.</>}
          fields={[{ name: 'evidence', label: 'الأدلة (إثبات الاستلام وانقضاء المهلة)', type: 'textarea', required: true }]} success="رُفع الطلب لمدير القسم" />
      )}
      {isReviewer && d.status === 'deemed_acceptance_review' && d.deemedRequest?.by !== me.id && (
        <CommandButton command="deliverable.decide_deemed" base={base} label="قرار القبول الضمني"
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'approved', label: 'اعتماد القبول وفق البند' }, { value: 'returned', label: 'رفض — يبقى بانتظار العميل' }] },
            { name: 'note', label: 'ملاحظة', type: 'textarea' },
          ]} success="سُجّل القرار" />
      )}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <h2 className="text-lg font-semibold text-ink">{d.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <StatePill s={DELIVERABLE_STATES[d.status]} />
            {current && <span className="ltr-iso font-semibold text-ink">{revLabel(current.rev)}</span>}
            <span>{d.requiresGov ? 'يصدر من جهة حكومية' : d.technical ? 'فني — مراجعة إلزامية' : 'غير فني'}</span>
            <span>· {deptName(d.deptCode)}{site && <> · {site.name}</>}</span>
            <Id>{d.id}</Id>
          </div>
        </div>
      }
      actions={actions}
    >
      <div className="space-y-6">
        {outOfScope && !client && (
          <Notice tone="waiting" title="خارج نطاق الاستثناء — ينتظر الاعتماد المالي">
            المسموح الآن: {project.scopeItems.filter((i) => scope.allowedItemIds.includes(i.id)).map((i) => i.title).join('، ') || '—'}. يُفتح هذا المخرج بعد اعتماد المالية.
          </Notice>
        )}
        {d.requiresGov && (
          <Notice tone="progress" title="يُعتمد هذا المخرج بصدور المعاملة الحكومية">
            {gov ? <>المعاملة <Link className="font-medium underline" to={`/gov?id=${gov.id}`}>{gov.procedureType}</Link> لدى {gov.authority}. صدورها يسجّل الوثيقة.</> : 'تُنشأ المعاملة عند بدء التنفيذ.'}
          </Notice>
        )}
        {d.status === 'blocked_pending_payment' && (
          <Notice tone="danger" title="التسليم ممنوع حتى تؤكد المالية السداد">
            {blockers.map((b) => <span key={b.id} className="me-2"><Link className="underline" to={`/projects/${project.id}?tab=payments&p=${b.id}`}>{b.label}</Link> (<Money v={b.amount - b.collected} /> متبقية)</span>)}
            <span className="mt-1 block text-xs">الاستثناء للرئيس التنفيذي وحده ولا يُسقط المبلغ.</span>
          </Notice>
        )}
        {d.ceoRelease && <Notice tone="waiting" title="استثناء الرئيس التنفيذي للتسليم قبل السداد">{d.ceoRelease.reason} — {userName(d.ceoRelease.by)} · {fmtDate(d.ceoRelease.at)} (المبلغ يبقى مستحقًا)</Notice>}
        {d.status === 'awaiting_client' && (
          <Notice tone={responseLate ? 'danger' : 'waiting'} title={responseLate ? 'انقضت مهلة الرد — لا قبول آلي بالصمت' : 'بانتظار رد العميل'}>
            مهلة الرد حتى {fmtDate(d.responseDueAt)} ({project.responseDays} يوم {project.dayType === 'working' ? 'عمل' : ''}) · المتابعة التالية {fmtDate(d.nextFollowUpAt)}
            {responseLate && (project.deemedAcceptanceClause ? <span className="block text-xs">يمكن لمدير المشروع طلب إثبات القبول وفق بند العقد.</span> : <span className="block text-xs">لا يوجد في العقد بند قبول ضمني — استمر في المتابعة.</span>)}
          </Notice>
        )}
        {d.deemedRequest && (
          <section>
            <Notice tone="progress" title="طلب إثبات قبول وفق العقد">
              <p>{d.deemedRequest.clause}</p>
              <p className="mt-1 text-xs">الأدلة: {d.deemedRequest.evidence} — {userName(d.deemedRequest.by)} · {fmtDate(d.deemedRequest.at)}</p>
              {d.deemedRequest.decision && <p className="text-xs">القرار: {d.deemedRequest.decision === 'approved' ? 'اعتُمد' : 'رُفض'} — {userName(d.deemedRequest.decidedBy)} {d.deemedRequest.note}</p>}
            </Notice>
          </section>
        )}
        {d.exclusion && <Notice tone="muted" title="مستبعد من النطاق بموافقة">{d.exclusion.reason} · موافقة العميل: {d.exclusion.clientAgreement} · اعتمده {userName(d.exclusion.approvedBy)}</Notice>}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="مسؤول البند">{owners.length ? owners.map((o) => userName(o)).join('، ') : <span className="text-st-waiting">لم يُعيّن</span>}</Fact>
          <Fact label="البنود">{items.map((i) => i.title).join('، ') || '—'}</Fact>
          <Fact label="الدفعات المرتبطة">{linkedPayments.length ? linkedPayments.map((p) => <Link key={p.id} className="me-2 text-brand-700 hover:underline" to={`/projects/${project.id}?tab=payments&p=${p.id}`}>{p.label}</Link>) : '—'}</Fact>
          <Fact label="مصدره">{d.origin === 'contract' ? 'نطاق العقد' : d.origin === 'paid_addition' ? 'إضافة بمقابل' : d.origin === 'free_addition' ? 'إضافة دون مقابل' : 'مشروع قائم'}</Fact>
        </dl>

        {!d.requiresGov && !['client_approved', 'excluded'].includes(d.status) && isPm && (
          <p className="text-xs text-muted">لاستبعاد المخرج من النطاق: تبويب «التغييرات».</p>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink">سجل الإصدارات {revisions.length > 0 && <span className="font-normal text-muted">· {revisions.length}</span>}</h3>
          {client && <p className="mb-3 text-xs text-muted">تظهر للمبيعات الإصدارات الصادرة فقط.</p>}
          {!revisions.length && <p className="text-sm text-muted">لم يُرفع إصدار بعد.</p>}
          <div className="space-y-3">
            {revisions.slice().reverse().map((r) => <RevisionCard key={r.rev} r={r} hideInternal={client} />)}
          </div>
        </section>
      </div>
    </Drawer>
  );
}

function RevisionCard({ r, hideInternal }: { r: Revision; hideInternal: boolean }) {
  const { userName } = useLookup();
  const resp = r.clientResponse;
  return (
    <article className={cn('rounded-lg border p-4', r.issued ? 'border-brand-200' : 'border-line')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="ltr-iso text-sm font-semibold text-ink">{revLabel(r.rev)}</span>
          <span className="text-xs text-muted">{REASONS[r.reason]} · <DateText iso={r.createdAt} /> · {userName(r.createdBy)}</span>
        </div>
        {r.issued ? <Pill tone="brand"><Lock size={11} /> صادر — ثابت</Pill> : <Pill tone="muted">نسخة عمل</Pill>}
      </header>
      {r.files.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-md border border-line">
          <Table head={['الملف', 'معرّف Nextcloud', 'البصمة', 'الحجم']}>
            {r.files.map((f) => (
              <tr key={f.fileId}>
                <Td><span className="inline-flex items-center gap-1"><Paperclip size={13} className="text-muted" /><bdi>{f.name}</bdi></span></Td>
                <Td><span className="ltr-iso text-xs text-muted">{f.fileId}</span></Td>
                <Td><span className="ltr-iso text-xs text-muted">{f.checksum}</span></Td>
                <Td className="text-xs">{f.size}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      {!hideInternal && r.reviewRounds.length > 0 && (
        <div className="mt-3 space-y-1">
          {r.reviewRounds.map((rr, i) => (
            <p key={i} className="text-xs text-ink-2">
              جولة مراجعة {i + 1}: رُفعت <DateText iso={rr.submittedAt} />
              {rr.decision ? <> — {rr.decision === 'accepted' ? 'قُبلت' : 'أُعيدت'} من {userName(rr.reviewerId)} {rr.note && `«${rr.note}»`}</> : ' — بانتظار المراجع'}
            </p>
          ))}
        </div>
      )}
      {!hideInternal && r.approvedInternallyAt && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-st-success"><ShieldCheck size={13} /> اعتماد داخلي <DateText iso={r.approvedInternallyAt} /></p>
      )}
      {r.issued && (
        <p className="mt-2 text-xs text-ink-2">
          أُصدر <DateText iso={r.issued.at} time /> عبر {r.issued.channel} إلى {r.issued.recipient} · المرجع <span className="ltr-iso">{r.issued.reference}</span> · أرسله {userName(r.issued.by)}
        </p>
      )}
      {resp && (
        <div className={cn('mt-3 rounded-md px-3 py-2 text-xs',
          resp.kind === 'comments' ? 'bg-st-waiting-bg text-st-waiting' : resp.kind === 'deemed' ? 'bg-st-progress-bg text-st-progress' : 'bg-st-success-bg text-st-success')}
        >
          <p className="font-semibold">{resp.kind === 'comments' ? 'ملاحظات العميل' : resp.kind === 'deemed' ? 'قبول ضمني وفق بند العقد' : 'قبول صريح من العميل'}</p>
          <p>{resp.note}{resp.proof && <> · الإثبات: {resp.proof}</>}</p>
          <p className="opacity-80"><DateText iso={resp.at} /> · {userName(resp.by)}</p>
        </div>
      )}
    </article>
  );
}
