import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle } from 'lucide-react';
import { useStore } from '../app/store';
import { HARD_RULES, JOURNEYS, MASTER, RULE_COUNT, SECTIONS } from '../domain/process';
import { Button, Card, Input, PageHeader, Pill, Table, Tabs, Td, Code } from '../components/ui';

type View = 'journeys' | 'rules' | 'master' | 'hard';

export const Process: React.FC = () => {
  const [view, setView] = useState<View>('journeys');
  const simulated = SECTIONS.flatMap((s) => s.rules).filter((r) => r.simulated).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="مسار العمل"
        subtitle={<><span className="font-semibold text-ink">{RULE_COUNT}</span> قاعدة من لوحة FigJam للمسار الكامل · {RULE_COUNT - simulated} مطبّقة و{simulated} بمحاكاة Nextcloud</>}
      />
      <Card pad={false}>
        <div className="px-5">
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: 'journeys', label: 'رحلات الاختبار (08)', count: JOURNEYS.length },
              { id: 'master', label: 'المسار الرئيسي MASTER' },
              { id: 'rules', label: 'قواعد الأقسام 01–10', count: RULE_COUNT },
              { id: 'hard', label: 'قواعد لا تُكسر (11-F)', count: HARD_RULES.length },
            ]}
          />
        </div>
        <div className="p-5">
          {view === 'journeys' && <Journeys />}
          {view === 'master' && <Master />}
          {view === 'rules' && <Rules />}
          {view === 'hard' && <Hard />}
        </div>
      </Card>
    </div>
  );
};

function Journeys() {
  const { setActor, state } = useStore();
  const navigate = useNavigate();
  const go = (userId: string, to: string) => {
    setActor(userId);
    navigate(to);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {JOURNEYS.map((j) => (
        <section key={j.n} className="rounded-lg border border-line">
          <header className="border-b border-line bg-page px-4 py-3">
            <p className="text-xs text-muted">الرحلة {j.n}</p>
            <h3 className="font-semibold text-ink">{j.title}</h3>
            <p className="mt-0.5 text-xs text-muted">{j.summary}</p>
          </header>
          <ol className="divide-y divide-line">
            {j.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 tabular">{i + 1}</span>
                <div className="min-w-0 grow">
                  <p className="text-sm text-ink">{s.text}</p>
                  <p className="text-xs text-muted">بصفة: {s.as} — {state.users.find((u) => u.id === s.userId)?.name}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<PlayCircle size={15} />} onClick={() => go(s.userId, s.to)} title="بدّل المستخدم وافتح الشاشة">
                  تصرّف بصفته
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Master() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">الخطوات 1–12 في نظام المبيعات. يبدأ هذا النموذج من الخطوة 13 (القبول والتفعيل) حتى الإغلاق المالي.</p>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {MASTER.map((m) => (
          <li key={m.n}>
            <Link to={m.to} className="block h-full rounded-lg border border-line bg-card p-3 transition-colors hover:border-brand-300 hover:bg-brand-50">
              <span className="text-xs font-semibold text-brand-600 tabular">{m.n}</span>
              <p className="text-sm font-medium text-ink">{m.title}</p>
              <p className="mt-1 text-xs text-muted">المسؤول: {m.owner}</p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Rules() {
  const [q, setQ] = useState('');
  return (
    <div className="space-y-5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم القاعدة أو نصها (مثل DL-04 أو «التحصيل»)" className="max-w-md" aria-label="بحث في القواعد" />
      {SECTIONS.map((s) => {
        const rules = s.rules.filter((r) => !q || r.id.toLowerCase().includes(q.toLowerCase()) || r.text.includes(q) || r.how.includes(q));
        if (!rules.length) return null;
        return (
          <section key={s.id}>
            <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <Code>{s.id}</Code> {s.title}
              <span className="text-xs font-normal text-faint ltr-iso">{s.node}</span>
            </h3>
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={['القاعدة', 'النص', 'أين في النموذج', 'كيف يفرضها المحرّك']}>
                {rules.map((r) => (
                  <tr key={r.id} className="align-top">
                    <Td className="!align-top"><Code>{r.id}</Code></Td>
                    <Td className="min-w-64 !align-top text-ink">{r.text}</Td>
                    <Td className="whitespace-nowrap !align-top">
                      <Link to={r.to} className="inline-flex items-center gap-1 text-brand-700 hover:underline">{r.where}<ArrowLeft size={13} /></Link>
                      {r.simulated && <Pill tone="waiting" className="ms-1">محاكاة</Pill>}
                    </Td>
                    <Td className="!align-top"><code className="text-xs text-muted" dir="ltr">{r.how}</code></Td>
                  </tr>
                ))}
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Hard() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">مفروضة داخل أوامر المحرّك نفسه لا بإخفاء الأزرار: نفّذ إجراءً بصفة شخص لا يملكه فيُرفض مع السبب.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {HARD_RULES.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className="flex items-start gap-2">
              <Code>{r.id}</Code>
              <p className="text-sm font-medium text-ink">{r.text}</p>
            </div>
            <p className="mt-2 text-xs text-muted"><code dir="ltr">{r.how}</code></p>
          </div>
        ))}
      </div>
    </div>
  );
}
