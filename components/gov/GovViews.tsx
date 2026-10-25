import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, Clock, FileText, Landmark, Square } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { addCalendarDays, fmtDate } from '../../domain/calendar';
import { GOV_STATES } from '../../domain/labels';
import { allows, holds } from '../../domain/permissions';
import { exceptionScope, govTimes, oppOwner } from '../../domain/selectors';
import type { AppState, GovRound, GovTransaction, User } from '../../domain/types';
import {
  CommandButton, DateText, Drawer, Empty, Fact, Id, Money, Notice, Pill, StatePill, Table, Td, Timeline, cn, userOptions,
} from '../ui';

const OUTCOMES: Record<NonNullable<GovRound['outcome']>, { label: string; tone: 'waiting' | 'danger' | 'success' }> = {
  comments: { label: 'ملاحظات فنية', tone: 'waiting' },
  docs_request: { label: 'طلب مستندات', tone: 'waiting' },
  rejected: { label: 'رفض نهائي', tone: 'danger' },
  issued: { label: 'صدرت', tone: 'success' },
};

const DAY = 86_400_000;
const span = (a?: string, b?: string, now?: string) => (a ? Math.floor((Date.parse(b ?? now ?? a) - Date.parse(a)) / DAY) : undefined);

/** The expeditor's next mandatory weekly update, and whether it is late. */
export function weeklyUpdate(s: AppState, g: GovTransaction) {
  if (g.status !== 'at_authority' || !g.lastUpdateAt) return { next: undefined, late: false };
  const next = addCalendarDays(g.lastUpdateAt, s.settings.expeditorUpdateDays);
  return { next, late: Date.parse(next) <= Date.parse(s.now) };
}

/** Who may see which transactions: project access, or the transaction roles (direct grants). */
export function visibleGov(s: AppState, me: User, projectVisible: (pid: string) => boolean) {
  const all = holds(me, 'gov_transaction.assign') || allows(me, 'gov_transaction.prepare', { depts: ['LIC'] });
  return s.gov.filter((g) => all || g.licensingOfficerId === me.id || g.expeditorId === me.id || projectVisible(g.projectId));
}

export function GovTable({ items, onOpen, showProject = true }: { items: GovTransaction[]; onOpen: (id: string) => void; showProject?: boolean }) {
  const { state } = useStore();
  const { userName, project } = useLookup();
  if (!items.length) return <Empty icon={<Landmark size={28} />} title="لا توجد معاملات حكومية" hint="تُنشأ المعاملة تلقائيًا عند بدء التنفيذ لكل بند يتطلب إجراءً حكوميًا." />;
  return (
    <Table head={['المعاملة', ...(showProject ? ['المشروع'] : []), 'الجهة', 'الحالة', 'الجولة / رقم الطلب', 'المعقّب', 'التحديث الأسبوعي', 'المكتب / الجهة']}>
      {items.map((g) => {
        const t = govTimes(state.now, g);
        const r = g.rounds[g.rounds.length - 1];
        const wu = weeklyUpdate(state, g);
        return (
          <tr key={g.id} className="cursor-pointer hover:bg-page" onClick={() => onOpen(g.id)}>
            <Td>
              <p className="text-sm font-medium text-ink">{g.procedureType}</p>
              <p className="text-xs text-muted">{g.title} · <span className="ltr-iso">{g.id}</span></p>
            </Td>
            {showProject && (
              <Td>
                <p className="max-w-[220px] truncate text-sm text-ink-2">{project(g.projectId)?.title}</p>
                <Id>{g.projectId}</Id>
              </Td>
            )}
            <Td>
              <p className="text-sm">{g.authority}</p>
              <p className="text-xs text-muted">{g.platform}</p>
            </Td>
            <Td><StatePill s={GOV_STATES[g.status]} /></Td>
            <Td>
              {r ? (
                <>
                  <p className="text-sm">جولة {r.n}</p>
                  <span className="ltr-iso text-xs text-muted">{r.requestNo}</span>
                </>
              ) : <span className="text-xs text-muted">لم تُقدّم</span>}
            </Td>
            <Td className="text-sm">{g.expeditorId ? userName(g.expeditorId) : <span className="text-xs text-muted">—</span>}</Td>
            <Td>
              {g.status === 'at_authority' ? (
                <span className={cn('inline-flex items-center gap-1 text-xs', wu.late ? 'font-medium text-st-danger' : 'text-ink-2')}>
                  {wu.late && <AlertTriangle size={13} />}
                  آخر: {fmtDate(g.lastUpdateAt)} · التالي: {fmtDate(wu.next)}
                </span>
              ) : <span className="text-xs text-muted">—</span>}
            </Td>
            <Td>
              <span className="text-sm tabular">{t.office} / {t.authority} يوم</span>
              {t.waitingNow > 0 && <p className="text-xs text-muted">لدى الجهة الآن {t.waitingNow} يوم</p>}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

export function GovDrawer({ govId, onClose }: { govId?: string | null; onClose: () => void }) {
  const { state, me, dispatch } = useStore();
  const { userName, project: projectOf } = useLookup();
  const g = state.gov.find((x) => x.id === govId);
  if (!g) return null;
  const proj = projectOf(g.projectId);
  const isOfficer = g.licensingOfficerId === me.id || allows(me, 'gov_transaction.prepare', { depts: ['LIC'], own: g.licensingOfficerId === me.id });
  const isExpeditor = g.expeditorId === me.id;
  const isAssigner = holds(me, 'gov_transaction.assign');
  const isPm = proj?.pmId === me.id;
  const isOppOwner = proj ? oppOwner(state, proj) === me.id : false;
  const times = govTimes(state.now, g);
  const wu = weeklyUpdate(state, g);
  const deliverable = state.deliverables.find((d) => d.id === g.deliverableId);
  const cost = g.fees?.costRequestId ? state.costs.find((c) => c.id === g.fees!.costRequestId) : undefined;
  const missing = g.requiredDocs.filter((d) => !d.received);
  const events = state.events.filter((e) => e.entity.type === 'gov' && e.entity.id === g.id).slice().reverse();
  const canToggle = isOfficer && ['preparing', 'awaiting_client'].includes(g.status);
  const base = { govId: g.id };

  const actions = (
    <>
      {isOfficer && g.status === 'preparing' && missing.length > 0 && (
        <CommandButton command="gov.request_client_docs" base={base} variant="secondary" label="طلب المستندات من العميل" title="طلب المستندات عبر مسؤول الفرصة"
          intro={<>يُبلَّغ مسؤول الفرصة بطلب: {missing.map((d) => d.name).join('، ')}</>}
          fields={[{ name: 'note', label: 'ملاحظة', type: 'textarea' }]} success="أُرسل الطلب لمسؤول الفرصة" />
      )}
      {(isOppOwner || isOfficer) && g.status === 'awaiting_client' && (
        <CommandButton command="gov.client_docs_received" base={base} label="وصلت مستندات العميل" success="سُجّل وصول المستندات" />
      )}
      {isOfficer && ['preparing', 'comments_processing'].includes(g.status) && (
        <CommandButton command="gov.submit" base={base} label={g.rounds.length ? `إعادة التقديم — جولة ${g.rounds.length + 1}` : 'تقديم على المنصة — جولة 1'}
          intro={<>الرسوم على العميل أصلًا؛ دفع أباك استثنائيًا يمر بطلب تكلفة إلى مدير الأقسام ثم المالية.{proj && exceptionScope(state, proj).active && ' المشروع باستثناء الرئيس التنفيذي: لا تُقدَّم إلا معاملات البنود المسموحة قبل الاعتماد المالي.'}</>}
          fields={[
            { name: 'requestNo', label: 'رقم الطلب في المنصة', type: 'text', required: true, initial: g.rounds.at(-1)?.requestNo ?? '' },
            { name: 'feeInvoiceChecked', label: 'تم التحقق من فاتورة الرسوم', type: 'checkbox', initial: true },
            { name: 'feeAmount', label: 'رسوم الجهة (اتركها 0 إن لا رسوم)', type: 'number', initial: 0 },
            { name: 'feePayer', label: 'من يدفع الرسوم', type: 'select', options: [{ value: 'client', label: 'العميل (الأصل)' }, { value: 'abak', label: 'أباك استثنائيًا — طلب تكلفة' }] },
          ]}
          transform={(v) => ({ requestNo: v.requestNo, feeInvoiceChecked: !!v.feeInvoiceChecked, fees: Number(v.feeAmount) > 0 ? { amount: Number(v.feeAmount), payer: v.feePayer } : undefined })}
          success="قُدّمت المعاملة" />
      )}
      {isOfficer && g.status === 'awaiting_fees' && g.fees?.payer === 'client' && (
        <CommandButton command="gov.record_client_fees" base={base} label="سجّل سداد العميل للرسوم" fields={[{ name: 'receipt', label: 'إيصال السداد', type: 'text', required: true }]} success="سُجّل سداد الرسوم" />
      )}
      {isAssigner && ['submitted', 'awaiting_fees', 'at_authority', 'comments_processing', 'preparing'].includes(g.status) && (
        <CommandButton command="gov.assign_expeditor" base={base} variant={g.status === 'submitted' && !g.expeditorId ? 'primary' : 'secondary'}
          label={g.expeditorId ? 'إعادة إسناد المعقّب' : 'إسناد لمعقّب'}
          fields={[{ name: 'expeditorId', label: 'المعقّب', type: 'select', options: userOptions(state.users, (u) => u.grants.some((gr) => gr.perm === 'gov_transaction.follow_up')), initial: g.expeditorId }]}
          success="أُسندت المتابعة" />
      )}
      {isExpeditor && g.status === 'at_authority' && (
        <CommandButton command="gov.follow_up" base={base} label="تحديث المتابعة الأسبوعي" title="متابعة لدى الجهة"
          fields={[
            { name: 'outcome', label: 'النتيجة', type: 'textarea', required: true },
            { name: 'platformStatus', label: 'حالة المنصة', type: 'text', required: true },
            { name: 'nextRequirement', label: 'المتطلب التالي', type: 'text' },
          ]} success="سُجّلت المتابعة" />
      )}
      {(isExpeditor || g.licensingOfficerId === me.id) && g.status === 'at_authority' && (
        <CommandButton command="gov.record_result" base={base} variant="secondary" label="تسجيل نتيجة الجهة" title="نتيجة الجهة لهذه الجولة"
          fields={[
            { name: 'outcome', label: 'النتيجة', type: 'select', options: [
              { value: 'comments', label: 'ملاحظات فنية ← مهمة للقسم' }, { value: 'docs_request', label: 'طلب مستند من العميل' },
              { value: 'rejected', label: 'رفض نهائي' }, { value: 'issued', label: 'صدرت' },
            ] },
            { name: 'note', label: 'نص الملاحظات / التفاصيل', type: 'textarea' },
            { name: 'docNo', label: 'رقم الوثيقة (عند الصدور)', type: 'text' },
            { name: 'issuedAt', label: 'تاريخ الإصدار', type: 'date', initial: state.now },
            { name: 'expiresAt', label: 'تاريخ الانتهاء (إن وجد)', type: 'date' },
          ]}
          transform={(v) => ({ outcome: v.outcome, note: v.note ?? '', ...(v.outcome === 'issued' ? { docNo: v.docNo, issuedAt: v.issuedAt, expiresAt: v.expiresAt } : {}) })}
          success="سُجّلت النتيجة" />
      )}
      {(isPm || g.licensingOfficerId === me.id) && g.status === 'final_rejection_decision' && (
        <CommandButton command="gov.final_decision" base={base} variant="danger" label="قرار بعد الرفض النهائي" title="إعادة التقديم أم الإغلاق دون صدور"
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'resubmit', label: 'إعادة التجهيز والتقديم' }, { value: 'close', label: 'إغلاق دون صدور' }] },
            { name: 'reason', label: 'السبب الموثق', type: 'textarea', required: true },
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{g.procedureType}</h2>
            <StatePill s={GOV_STATES[g.status]} />
            {g.rounds.length > 0 && <Pill tone="muted">جولة {g.rounds.length}</Pill>}
          </div>
          <p className="mt-0.5 text-sm text-muted">{g.authority} · {g.platform} · <span className="ltr-iso">{g.id}</span></p>
        </div>
      }
      actions={actions}
    >
      <div className="space-y-5">
        {g.status === 'at_authority' && wu.late && (
          <Notice tone="danger" title="تأخر التحديث الأسبوعي الإلزامي">آخر تحديث {fmtDate(g.lastUpdateAt)} — نُبّه مدير المعاملات الحكومية.</Notice>
        )}
        {g.status === 'comments_processing' && (() => {
          const r = g.rounds[g.rounds.length - 1];
          const t = state.tasks.find((x) => x.id === r?.commentsTaskId);
          return (
            <Notice tone="waiting" title="ملاحظات الجهة قيد المعالجة — يُحسب الآن وقت المكتب">
              {t ? <>المهمة <Link className="underline" to={`/work?task=${t.id}`}>{t.id}</Link> لدى {userName(t.ownerId)} — {t.status === 'completed' ? 'مكتملة: يمكن إعادة التقديم' : 'لم تكتمل بعد'}</> : null}
            </Notice>
          );
        })()}
        {g.status === 'closed_not_issued' && <Notice tone="muted" title="أُغلقت دون صدور">{g.closedReason}</Notice>}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="المشروع">{proj ? <Link className="text-brand-700 hover:underline" to={`/projects/${proj.id}?tab=gov`}>{proj.id} — {proj.title}</Link> : g.projectId}</Fact>
          <Fact label="المخرج المرتبط">{deliverable ? <Link className="text-brand-700 hover:underline" to={`/projects/${g.projectId}?tab=deliverables&d=${deliverable.id}`}>{deliverable.title}</Link> : '—'}</Fact>
          <Fact label="مسؤول الرخص">{userName(g.licensingOfficerId)}</Fact>
          <Fact label="المعقّب">{g.expeditorId ? userName(g.expeditorId) : 'لم يُسند'}</Fact>
          <Fact label="وقت المكتب"><span className="tabular">{times.office} يوم</span></Fact>
          <Fact label="انتظار الجهة (كل الجولات)"><span className="tabular">{times.authority} يوم</span></Fact>
          {g.status === 'at_authority' && <Fact label="آخر تحديث / التالي">{fmtDate(g.lastUpdateAt)} / {fmtDate(wu.next)}</Fact>}
          <Fact label="أُنشئت"><DateText iso={g.createdAt} /> <span className="ltr-iso text-xs font-normal text-muted">{g.serviceCode}</span></Fact>
        </dl>

        {g.result && (
          <Notice tone="success" title={<>صدرت — رقم الوثيقة <span className="ltr-iso">{g.result.docNo}</span></>}>
            تاريخ الإصدار {fmtDate(g.result.issuedAt)}{g.result.expiresAt && <> · تنتهي {fmtDate(g.result.expiresAt)}</>}
          </Notice>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">المستندات المطلوبة <span className="font-normal text-muted">({g.requiredDocs.filter((d) => d.received).length}/{g.requiredDocs.length})</span></h3>
          {g.requiredDocs.length === 0 && <p className="text-sm text-muted">لا مستندات محددة.</p>}
          <ul className="space-y-1">
            {g.requiredDocs.map((d) => (
              <li key={d.name}>
                <button
                  disabled={!canToggle}
                  onClick={() => dispatch('gov.toggle_doc', { govId: g.id, name: d.name, received: !d.received })}
                  className={cn('flex w-full items-start gap-2 rounded px-2 py-1 text-start text-sm', canToggle ? 'hover:bg-sunken' : 'cursor-default')}
                >
                  {d.received ? <CheckSquare size={16} className="mt-0.5 shrink-0 text-st-success" /> : <Square size={16} className="mt-0.5 shrink-0 text-faint" />}
                  <span className={d.received ? 'text-ink' : 'text-ink-2'}>{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">الجولات</h3>
          {g.rounds.length === 0 ? <p className="text-sm text-muted">لم تُقدّم بعد.</p> : (
            <Table head={['#', 'التقديم', 'انتظار الجهة', 'معالجة المكتب', 'النتيجة']}>
              {g.rounds.map((r) => {
                const a = span(r.authorityStart, r.authorityEnd, state.now);
                const o = span(r.officeStart, r.officeEnd, state.now);
                const task = state.tasks.find((t) => t.id === r.commentsTaskId);
                return (
                  <tr key={r.n}>
                    <Td className="tabular">{r.n}</Td>
                    <Td><DateText iso={r.submittedAt} /><p className="ltr-iso text-xs text-muted">{r.requestNo}</p></Td>
                    <Td>{r.authorityStart ? <><span className="text-xs">{fmtDate(r.authorityStart)} ← {r.authorityEnd ? fmtDate(r.authorityEnd) : 'مستمر'}</span><p className="text-xs tabular text-muted">{a} يوم</p></> : <span className="text-xs text-muted">لم يبدأ</span>}</Td>
                    <Td>{r.officeStart ? <><span className="text-xs">{fmtDate(r.officeStart)} ← {r.officeEnd ? fmtDate(r.officeEnd) : 'مستمر'}</span><p className="text-xs tabular text-muted">{o} يوم</p></> : <span className="text-xs text-muted">—</span>}</Td>
                    <Td>
                      {r.outcome ? <Pill tone={OUTCOMES[r.outcome].tone}>{OUTCOMES[r.outcome].label}</Pill> : <span className="text-xs text-muted">بانتظار</span>}
                      {r.outcomeNote && <p className="mt-0.5 text-xs text-ink-2">{r.outcomeNote}</p>}
                      {task && <p className="text-xs"><Link className="text-brand-700 hover:underline" to={`/work?task=${task.id}`}>مهمة {task.id}</Link></p>}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </section>

        {g.fees && (
          <section className="text-sm">
            <h3 className="mb-2 font-semibold text-ink">رسوم الجهة</h3>
            <div className="rounded-lg bg-page p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Money v={g.fees.amount} className="text-base font-semibold text-ink" />
                {g.fees.status === 'paid' ? <Pill tone="success">مسددة</Pill> : <Pill tone="waiting">بانتظار السداد</Pill>}
              </div>
              <p className="mt-1 text-xs text-muted">
                {g.fees.payer === 'client' ? 'يدفعها العميل' : 'تدفعها أباك استثنائيًا'} · فاتورة الرسوم {g.feeInvoiceChecked ? 'متحقق منها' : 'لم يُتحقق منها'}
                {cost && <> · طلب التكلفة <Link className="text-brand-700 hover:underline" to={`/projects/${cost.projectId}?tab=costs&c=${cost.id}`}>{cost.id}</Link></>}
              </p>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">متابعات المعقّب</h3>
          <Timeline items={g.followUps.slice().reverse().map((f) => ({
            at: f.at, by: userName(f.by),
            title: <span className="inline-flex items-center gap-1"><Clock size={13} className="text-muted" />{f.outcome}</span>,
            note: <>المنصة: {f.platformStatus}{f.nextRequirement && <> · التالي: {f.nextRequirement}</>}{f.visitId && <> · <Link className="text-brand-700" to={`/visits?id=${f.visitId}`}>{f.visitId}</Link></>}</>,
          }))} />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">سجل المعاملة</h3>
          <Timeline items={events.map((e) => ({ at: e.at, by: e.actorId === 'system' ? 'النظام' : userName(e.actorId), title: <span className="inline-flex items-center gap-1"><FileText size={13} className="text-muted" />{e.summary}</span> }))} />
        </section>
      </div>
    </Drawer>
  );
}
