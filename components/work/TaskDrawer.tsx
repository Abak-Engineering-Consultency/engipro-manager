import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Ban, CheckCircle2, MessageSquare, Paperclip, Pause, Play, Plus, RotateCcw, Send, UserCheck } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { addCalendarDays, fmtDateTime } from '../../domain/calendar';
import { BLOCK_TYPES, TASK_STATES } from '../../domain/labels';
import { holds } from '../../domain/permissions';
import type { RecordLink } from '../../domain/types';
import { Button, CommandButton, DateText, Drawer, Fact, Id, Notice, PersonChip, Pill, StatePill, Table, Td, Textarea, Timeline, userOptions } from '../ui';
import { recordHref, recordOptions, RECORD_TYPE_NAMES, toRecordLink } from './records';
import { isOverdue, PRIORITY, SOURCE_NAMES } from './TaskViews';

const PRIORITY_OPTIONS = [
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'low', label: 'منخفضة' },
];

/** Create a task — one owner, due date, priority, optional linked record and reviewer. */
export function NewTaskButton({ presetLink, label = 'مهمة جديدة', variant = 'primary', onCreated }: { presetLink?: RecordLink; label?: string; variant?: 'primary' | 'secondary'; onCreated?: (id: string) => void }) {
  const { state, me } = useStore();
  if (!holds(me, 'task.manage')) return null;
  const options = recordOptions(state, me, ['project', 'deliverable', 'gov', 'visit', 'opportunity']);
  const preset = presetLink ? `${presetLink.type}:${presetLink.id}` : 'none';
  if (presetLink && !options.some((o) => o.value === preset)) options.push({ value: preset, label: `${RECORD_TYPE_NAMES[presetLink.type]} — ${presetLink.label}` });
  return (
    <CommandButton
      command="task.create"
      base={{}}
      label={label}
      title="مهمة جديدة"
      variant={variant}
      size="md"
      icon={<Plus size={16} />}
      success="أُنشئت المهمة وأُبلغ المسؤول"
      intro={<>لكل مهمة مسؤول واحد. الاعتمادات والتحصيل تُسجَّل في سجلاتها لا في المهام.</>}
      fields={[
        { name: 'title', label: 'عنوان المهمة', type: 'text', required: true },
        { name: 'ownerId', label: 'المسؤول (شخص واحد)', type: 'select', options: userOptions(state.users), initial: me.id, required: true },
        { name: 'dueDate', label: 'الموعد', type: 'date', initial: addCalendarDays(state.now, 3), required: true },
        { name: 'priority', label: 'الأولوية', type: 'select', options: PRIORITY_OPTIONS },
        { name: 'record', label: 'السجل المرتبط (اختياري)', type: 'select', options, initial: preset, hint: 'المهمة قد ترتبط بمشروع أو مخرج أو معاملة أو زيارة أو فرصة، أو تبقى مستقلة.' },
        { name: 'reviewerId', label: 'المراجع', type: 'select', options: [{ value: '', label: '— دون مراجع —' }, ...userOptions(state.users)], initial: '', hint: 'إلزامي إذا ارتبطت المهمة بمخرج فني، ويجب أن يكون غير المسؤول.' },
        { name: 'contributors', label: 'المساهمون (اختياري)', type: 'multiselect', options: userOptions(state.users), hint: 'يرون المهمة ويعلّقون ويرفقون الملفات، والمسؤولية تبقى على المسؤول وحده.' },
      ]}
      transform={(v) => ({
        title: v.title,
        ownerId: v.ownerId,
        dueDate: v.dueDate,
        priority: v.priority,
        reviewerId: v.reviewerId || undefined,
        contributors: v.contributors,
        link: toRecordLink(state, v.record),
      })}
      onDone={(id) => onCreated?.(String(id))}
    />
  );
}

export function TaskDrawer({ taskId, onClose }: { taskId?: string | null; onClose: () => void }) {
  const { state, me, dispatch } = useStore();
  const { user, userName } = useLookup();
  const [comment, setComment] = useState('');
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : undefined;
  if (!taskId) return null;
  if (!task) {
    return (
      <Drawer open onClose={onClose} title={<span>مهمة غير موجودة</span>}>
        <p className="text-sm text-muted">لم يُعثر على {taskId}.</p>
      </Drawer>
    );
  }
  const proj = task.link?.projectId ? state.projects.find((p) => p.id === task.link!.projectId) : undefined;
  const isOwner = task.ownerId === me.id;
  const isReviewer = task.reviewerId === me.id;
  const open = !['completed', 'cancelled'].includes(task.status);
  const canReassign = open && [task.ownerId, task.creatorId, proj?.pmId].includes(me.id);
  const canCancel = open && [task.ownerId, task.creatorId].includes(me.id);
  const canAttach = open && [task.ownerId, task.creatorId, task.reviewerId, ...task.contributors].includes(me.id);
  const base = { taskId: task.id };
  const href = recordHref(task.link);

  const actions = (
    <>
      {isOwner && task.status === 'new' && <CommandButton command="task.start" base={base} label="بدء العمل" icon={<Play size={14} />} success="بدأ العمل على المهمة" />}
      {isOwner && task.status === 'in_progress' && (
        <CommandButton
          command="task.block" base={base} label="تعطيل / بانتظار" variant="secondary" icon={<Pause size={14} />} success="سُجّل سبب التعطيل"
          intro={<>مواعيد المتابعة لا تُلغى أثناء التعطيل</>}
          fields={[
            { name: 'type', label: 'نوع السبب', type: 'select', options: Object.entries(BLOCK_TYPES).map(([value, label]) => ({ value, label })) },
            { name: 'note', label: 'السبب', type: 'textarea', required: true },
          ]}
        />
      )}
      {isOwner && task.status === 'blocked' && <CommandButton command="task.unblock" base={base} label="زال السبب — استئناف" icon={<Play size={14} />} success="استؤنف العمل" />}
      {isOwner && ['new', 'in_progress'].includes(task.status) && (
        <CommandButton
          command="task.complete" base={base} label={task.reviewerId ? 'إنجاز وإرسال للمراجعة' : 'إكمال بنتيجة موثقة'} icon={<CheckCircle2 size={14} />}
          success={task.reviewerId ? 'أُرسلت للمراجع' : 'اكتملت المهمة'}
          fields={[{ name: 'result', label: 'النتيجة الموثقة', type: 'textarea', required: true }]}
        />
      )}
      {isReviewer && task.status === 'in_review' && (
        <CommandButton
          command="task.review" base={base} label="قرار المراجعة" icon={<UserCheck size={14} />} success="سُجّل قرار المراجعة"
          intro={<>النتيجة المقدمة: «{task.result}»</>}
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'accepted', label: 'قبول — تكتمل المهمة' }, { value: 'returned', label: 'إعادة بملاحظة' }] },
            { name: 'note', label: 'ملاحظة', type: 'textarea' },
          ]}
        />
      )}
      {canReassign && (
        <CommandButton
          command="task.reassign" base={base} label="تغيير المسؤول" variant="secondary" icon={<ArrowLeftRight size={14} />} success="تغيّر المسؤول وأُبلغ الطرفان"
          intro={<>يُسجل من، إلى، السبب، التاريخ، ويُبلَّغ الطرفان، وتنتقل المتابعات المفتوحة</>}
          fields={[
            { name: 'toId', label: 'المسؤول الجديد', type: 'select', options: userOptions(state.users, (u) => u.id !== task.ownerId) },
            { name: 'reason', label: 'السبب', type: 'textarea', required: true },
          ]}
        />
      )}
      {canReassign && (
        <CommandButton
          command="task.update" base={base} label="تعديل الموعد / الأولوية / المراجع / المساهمين" variant="secondary" success="عُدّلت المهمة وأُبلغ المعنيون"
          intro={<>المسؤول لا يتغير هنا — استخدم «تغيير المسؤول»</>}
          fields={[
            { name: 'dueDate', label: 'الموعد', type: 'date', initial: task.dueDate },
            { name: 'priority', label: 'الأولوية', type: 'select', initial: task.priority, options: [{ value: 'low', label: 'منخفضة' }, { value: 'medium', label: 'متوسطة' }, { value: 'high', label: 'عالية' }] },
            { name: 'reviewerId', label: 'المراجع', type: 'select', initial: task.reviewerId ?? '', options: [{ value: '', label: 'بلا مراجع' }, ...userOptions(state.users, (u) => u.id !== task.ownerId)] },
            { name: 'contributors', label: 'المساهمون', type: 'multiselect', initial: task.contributors, options: userOptions(state.users, (u) => u.id !== task.ownerId) },
            { name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true },
          ]}
        />
      )}
      {canAttach && (
        <CommandButton
          command="task.attach" base={base} label="إرفاق ملفات" variant="secondary" icon={<Paperclip size={14} />} success="أُرفقت الملفات وأُبلغ المعنيون"
          intro="تُحفظ في Nextcloud ضمن مجلد السجل المرتبط."
          fields={[{ name: 'files', label: 'أسماء الملفات (سطر لكل ملف)', type: 'lines', required: true, placeholder: `${task.id}-ملاحظات.pdf` }]}
        />
      )}
      {canCancel && (
        <CommandButton
          command="task.cancel" base={base} label="إلغاء" variant="secondary" icon={<Ban size={14} />} success="أُلغيت المهمة"
          fields={[{ name: 'reason', label: 'سبب الإلغاء الموثق', type: 'textarea', required: true }]}
        />
      )}
    </>
  );

  const sendComment = () => {
    if (!comment.trim()) return;
    const r = dispatch('task.comment', { taskId: task.id, text: comment });
    if (r.ok) setComment('');
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <h2 className="text-lg font-semibold text-ink">{task.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatePill s={TASK_STATES[task.status]} />
            <Pill tone={PRIORITY[task.priority].tone}>أولوية {PRIORITY[task.priority].label}</Pill>
            {isOverdue(task, state.now) && <Pill tone="danger">متأخرة</Pill>}
            <Id>{task.id}</Id>
          </div>
        </div>
      }
      actions={actions}
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="المسؤول"><PersonChip user={user(task.ownerId)} sub={user(task.ownerId)?.title} /></Fact>
          <Fact label="المنشئ"><PersonChip user={user(task.creatorId)} /></Fact>
          <Fact label="المراجع">{task.reviewerId ? <PersonChip user={user(task.reviewerId)} /> : <span className="font-normal text-muted">لا يوجد</span>}</Fact>
          <Fact label="الموعد"><span className={isOverdue(task, state.now) ? 'text-st-danger' : undefined}><DateText iso={task.dueDate} /></span></Fact>
          <Fact label="السجل المرتبط">
            {task.link ? (
              <span className="text-sm">
                <span className="text-xs text-muted">{RECORD_TYPE_NAMES[task.link.type]}: </span>
                {href ? <Link to={href} onClick={onClose} className="text-brand-700 hover:underline">{task.link.label}</Link> : task.link.label}
              </span>
            ) : 'مهمة مستقلة دون سجل'}
          </Fact>
          <Fact label="المصدر"><span title={task.dedupeKey ? `مفتاح منع التكرار: ${task.dedupeKey}` : undefined}>{SOURCE_NAMES[task.source]}</span></Fact>
          <Fact label="أُنشئت"><DateText iso={task.createdAt} time /></Fact>
          {task.contributors.length > 0 && <Fact label="المساهمون">{task.contributors.map((c) => userName(c)).join('، ')}</Fact>}
          {task.completedAt && <Fact label="اكتملت"><DateText iso={task.completedAt} time /></Fact>}
        </dl>

        {task.status === 'blocked' && task.blockReason && (
          <Notice tone="waiting" title={`معطّلة — السبب: ${BLOCK_TYPES[task.blockReason.type]}`}>
            {task.blockReason.note} · منذ {fmtDateTime(task.blockReason.since)}
          </Notice>
        )}
        {task.result && <Notice tone={task.status === 'completed' ? 'success' : 'progress'} title="النتيجة الموثقة">{task.result}</Notice>}
        {task.reviewNote && <Notice tone="new" title="ملاحظة المراجع">{task.reviewNote}</Notice>}
        {task.cancelReason && <Notice tone="muted" title="سبب الإلغاء">{task.cancelReason}</Notice>}

        {task.escalations.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-ink">التذكير والتصعيد</h4>
            <ul className="space-y-2 text-sm">
              {task.escalations.map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-ink-2">
                  <Pill tone={e.level === 2 ? 'danger' : 'waiting'}>المستوى {e.level}</Pill>
                  إلى {userName(e.to)} · <span className="text-xs text-muted">{fmtDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink"><Paperclip size={15} className="text-muted" /> المرفقات {task.attachments.length > 0 && <span className="font-normal text-muted">· {task.attachments.length}</span>}</h4>
          {task.attachments.length ? (
            <div className="overflow-hidden rounded-lg border border-line"><Table head={['الملف', 'معرّف Nextcloud', 'الحجم', 'أرفقه']}>
              {task.attachments.map((f) => (
                <tr key={f.fileId}>
                  <Td><bdi className="whitespace-nowrap">{f.name}</bdi></Td>
                  <Td><span className="ltr-iso text-xs text-muted">{f.fileId}</span></Td>
                  <Td className="whitespace-nowrap text-xs">{f.size}</Td>
                  <Td className="text-xs">{userName(f.by)} · {fmtDateTime(f.at)}</Td>
                </tr>
              ))}
            </Table></div>
          ) : (
            <p className="text-sm text-muted">لا توجد مرفقات.</p>
          )}
        </section>

        {task.reassignLog.length > 0 && (
          <section>
            <h4 className="mb-3 text-sm font-semibold text-ink">سجل تغيير المسؤول</h4>
            <Timeline items={task.reassignLog.map((r) => ({ at: r.at, title: <>من {userName(r.from)} إلى {userName(r.to)}</>, by: userName(r.by), note: r.reason }))} />
          </section>
        )}

        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink"><MessageSquare size={15} className="text-muted" /> المتابعات والتعليقات</h4>
          {task.comments.length ? (
            <ul className="space-y-2">
              {task.comments.map((c, i) => (
                <li key={i} className="rounded-lg bg-page px-4 py-3">
                  <p className="text-sm text-ink">{c.text}</p>
                  <p className="mt-1 text-xs text-muted">{userName(c.by)} · {fmtDateTime(c.at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">لا توجد تعليقات.</p>
          )}
          <div className="mt-3 flex items-end gap-2">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="أضف متابعة أو تعليقًا…" />
            <Button onClick={sendComment} disabled={!comment.trim()} icon={<Send size={14} />}>إرسال</Button>
          </div>
        </section>

        {!open && task.status === 'completed' && task.source === 'collection' && (
          <p className="flex items-center gap-1 text-xs text-muted"><RotateCcw size={12} /> أُغلقت متابعة التحصيل بتأكيد المالية وحدها.</p>
        )}
      </div>
    </Drawer>
  );
}
