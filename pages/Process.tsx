import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle } from 'lucide-react';
import { useStore } from '../app/store';
import { HARD_RULES, JOURNEYS, MASTER, RULE_COUNT, SECTIONS } from '../domain/process';
import { Button, Card, PageHeader, Pill, Rule, Tabs } from '../components/ui';

type View = 'journeys' | 'rules' | 'master' | 'hard';

export const Process: React.FC = () => {
  const [view, setView] = useState<View>('journeys');
  const simulated = SECTIONS.flatMap((s) => s.rules).filter((r) => r.simulated).length;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="المرجع: لوحة FigJam «ABAK ERP — Full Process Flowchart» — الأقسام 01–10 وMASTER والقسم 11"
        title="مسار العمل الكامل للمشاريع"
        subtitle={`${RULE_COUNT} قاعدة من الفلوتشارت، كلها تمر بأوامر محرّك العمليات نفسه: ${RULE_COUNT - simulated} مطبّقة فعليًا و${simulated} بمحاكاة Nextcloud. اختر رحلة وتصرّف بصفة كل شخص فيها.`}
      />
      <Card pad={false}>
        <div className="px-2">
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
        <div className="p-4">
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
    <div className="grid gap-4 xl:grid-cols-2">
      {JOURNEYS.map((j) => (
        <section key={j.n} className="rounded-lg border border-line">
          <header className="border-b border-line bg-page px-4 py-3">
            <p className="text-xs text-muted">الرحلة {j.n}</p>
            <h3 className="font-semibold text-ink">{j.title}</h3>
            <p className="text-xs text-muted">{j.summary}</p>
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
      <p className="text-sm text-ink-2">
        الخطوات 1–12 (الاستقبال، التأهيل، طلب التسعير، العرض، الاعتمادات، الإرسال، متابعة العميل) قائمة في نظام ABAK ERP للمبيعات. هذا النموذج يبدأ من الخطوة 13: القبول الموثق والتفعيل، حتى الإغلاق المالي (36).
      </p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {MASTER.map((m) => (
          <li key={m.n}>
            <Link to={m.to} className="block h-full rounded-lg border border-line bg-card p-3 transition-colors hover:border-brand-300 hover:bg-brand-50">
              <span className="text-xs font-semibold text-accent-600 tabular">{m.n}</span>
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم القاعدة أو نصها (مثل DL-04 أو «التحصيل»)" className="h-10 w-full max-w-md rounded-md border border-input px-3 text-sm" />
      {SECTIONS.map((s) => {
        const rules = s.rules.filter((r) => !q || r.id.toLowerCase().includes(q.toLowerCase()) || r.text.includes(q) || r.how.includes(q));
        if (!rules.length) return null;
        return (
          <section key={s.id}>
            <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <span className="rounded bg-brand-600 px-1.5 text-xs text-white">{s.id}</span> {s.title}
              <span className="text-xs font-normal text-muted ltr-iso">{s.node}</span>
            </h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-page text-xs text-muted">
                    <th className="px-3 py-2 text-start font-medium">القاعدة</th>
                    <th className="px-3 py-2 text-start font-medium">النص</th>
                    <th className="px-3 py-2 text-start font-medium">أين في النموذج</th>
                    <th className="px-3 py-2 text-start font-medium">كيف يفرضها المحرّك</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 align-top"><Rule>{r.id}</Rule></td>
                      <td className="min-w-64 px-3 py-2 align-top text-ink">{r.text}</td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <Link to={r.to} className="inline-flex items-center gap-1 text-brand-700 hover:underline">{r.where}<ArrowLeft size={13} /></Link>
                        {r.simulated && <Pill tone="waiting" className="ms-1">محاكاة</Pill>}
                      </td>
                      <td className="px-3 py-2 align-top"><code className="text-xs text-ink-2" dir="ltr">{r.how}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Hard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {HARD_RULES.map((r) => (
        <div key={r.id} className="rounded-lg border border-line p-3">
          <div className="flex items-start gap-2">
            <Rule>{r.id}</Rule>
            <p className="text-sm font-medium text-ink">{r.text}</p>
          </div>
          <p className="mt-1 text-xs text-muted">في المحرّك: <code dir="ltr">{r.how}</code></p>
        </div>
      ))}
      <p className="text-xs text-muted md:col-span-2">
        هذه القواعد مفروضة داخل أوامر المحرّك نفسه، لا بإخفاء الأزرار: جرّب تنفيذ إجراء بصفة شخص لا يملكه، فيرفضه المحرّك ويعرض السبب. ويتحقق منها السكربت <code dir="ltr">npm run journeys</code>.
      </p>
    </div>
  );
}
