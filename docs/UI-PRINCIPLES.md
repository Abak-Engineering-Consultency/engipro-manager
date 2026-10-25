# EngiPro — UI/UX principles audit and redesign

This document compares three versions of the EngiPro front end against standard UI/UX principles. It explains what the redesign kept from each version, what it changed, and why.

| Version | Commit | In one line |
|---|---|---|
| **A. Original EngiPro** | `4797111` | Sleek, light, and easy to read, but built on static mock data |
| **B. Flowchart build** | `b7f8648` (PR #30) | Implements the full process correctly, but every screen is overwhelming |
| **C. This redesign** | this branch | A's layout and calm, ABAK colours and logo, B's process, and new elements where the process needs them |

**Method.**
- Each version was run in a browser and the same screens were captured: dashboard, projects list, project page and My Work.
- Each screen was read with the Glance Test: where am I, what matters, what can I do, and what is next. The test was run on the normal screenshot, on a grayscale copy (does the hierarchy survive without colour?) and on a blurred copy (what is the first shape the eye lands on?).
- Findings are graded by *comprehension gap × exposure × cost of a mistake*:
  - **S1**: misleads the user.
  - **S2**: makes the user work to understand.
  - **S3**: friction.

---

## 1. Principles checklist

Key: ✅ followed · ◐ partly · ✗ broken

| Principle | A. Original | B. Flowchart build | C. Redesign |
|---|---|---|---|
| **Proximity**: related items closer than unrelated ones | ✅ Label/value pairs and card groups clearly spaced | ◐ One gap value everywhere. Facts, chips and notes sit at equal distance, so grouping has to be read | ✅ A spacing scale tied to relationships (see §3) |
| **Common region / containment**: boxes only where spacing can't group | ✅ One card per topic | ✗ Cards inside cards: KPI tiles in the finance card, bordered boxes inside cards, a dashed empty state inside a card | ✅ One card per topic. Insides use spacing, dividers or a tinted block. Empty states lose their box inside a card |
| **Visual hierarchy / one focal point per region** | ✅ Page title, then KPIs, then cards | ✗ Every block had the same weight. The project header had a title, 4–6 chips, a stepper, a 7-fact bar and 3 banners all competing | ✅ Each region has one lead: the page title, then the "next step" strip, then the first card. Everything else is demoted |
| **Emphasis is rivalrous**: demote rather than add | ◐ Six differently coloured KPI icons competed for no reason | ✗ Gold rule-code chips (X-01, F13, PJ-09…) on almost every card spent the accent colour on metadata | ✅ Rule codes removed from working screens. They remain only on the flowchart reference page, as neutral grey chips |
| **Similarity / consistency**: the same thing looks the same everywhere | ◐ Consistent cards and tabs, but status, priority and category colours were mixed | ◐ Consistent tokens, but three different "tag" styles (Pill, StepBadge, Rule) | ✅ One card, one tab, one segmented control, one status pill, one KPI. Colour has one job each (§3) |
| **Figure / ground**: navigation separate from work | ✅ Dark sidebar, light content | ✗ White sidebar on a white page with a thin line, so navigation blended into content | ✅ Dark ABAK sidebar (`#0F2C3A`) with a light logo. The active item is filled with brand blue |
| **Fixed landmarks (Jakob's law)** | ✅ Sidebar, top bar with search, user at the bottom of the sidebar | ◐ The landmark bar held demo controls (date, +day, +week, reset) and a yellow "interactive model" banner | ✅ Original landmarks restored. The demo date moved into one calendar popover; switching user moved into the sidebar user block |
| **Hick's law**: fewer, clearer choices | ✅ 7 project tabs | ✗ 13 project tabs with long labels (overflowed at 1440 px) | ✅ 12 one-word tabs that fit on one row. Payments and costs share «المالية» with a switch inside |
| **Progressive disclosure** | ✅ (little to disclose) | ✗ Everything shown at once: the identity chain, the 7-fact bar, rule explanations under every title | ✅ The header shows only what is needed now. Contract clauses and government-procedure detail open in their own card or tab |
| **Recognition over recall** | ◐ Static mock data. "My Tasks" didn't know what the user had to do | ✅ Pending actions are derived from records | ✅ Kept, and surfaced: «ما ينتظرك الآن» leads the dashboard; «الخطوة التالية» names the action and its owner on every project |
| **Label / value**: the value is emphasised, the label recedes | ✅ | ✗ Labels and values had the same weight | ✅ Labels are `text-xs muted`; values are `font-medium` or `font-semibold ink` |
| **Text carries content, layout carries structure** | ✅ | ✗ Paragraphs explained the layout ("this is derived…", "the bar shows…", "F13") | ✅ Explanatory paragraphs removed. Structure is now shown by grouping and headings |
| **Colour semantics**: one colour per job | ✗ Blue, indigo, red, amber, emerald and purple icons with no meaning. Rainbow pie chart | ◐ Good status tokens, but gold used for rule metadata | ✅ Brand blue for action, navigation and identity icons; status hues only for status; gold only in the logo |
| **Non-colour redundancy**: status survives in grayscale | ◐ Authority status was a coloured dot only | ✅ Status pills always have text | ✅ Kept. "Needs attention" and "late" also carry an icon and text; notices have a tone icon |
| **Signifiers / false affordances** | ✗ "⋮" menus, bulk actions, export, pagination and filter buttons did nothing | ✅ Every button runs a real command | ✅ Kept. The search box now works (projects by number, name or client); KPI tiles open the list behind them |
| **Feedback / system status** | ◐ None (static) | ✅ Toasts, and the command's refusal reason inside the dialog | ✅ Kept. Errors in dialogs are announced (`role="alert"`) |
| **Language consistency** | ✗ Arabic UI with English data and labels ("High", "Normal", "Sunset Villa", "hours ago") | ✅ Arabic throughout | ✅ Arabic throughout |
| **RTL correctness** | ◐ `ml/mr` with `rtl:` overrides | ✅ Logical properties only | ✅ Logical properties only |

**Summary.**
- **A** got the *visual* principles right: proximity, region, hierarchy, figure/ground, landmarks and minimalism. It failed on *meaning*: decorative colour, controls that did nothing, mock data and mixed languages.
- **B** got the *meaning* right: real states, real commands and derived actions. It broke the visual principles: no focal point, overused containment, metadata given emphasis, too many choices, and text carrying structure. That is why it felt overwhelming.
- **C** takes the visual system from A and the meaning from B.

---

## 2. Findings on version B (what made it overwhelming)

| Sev. | Finding | Mechanism | Fix in C |
|---|---|---|---|
| S1 | Gold rule chips (X-01, F13, PJ-09, NX-04…) on almost every card, button intro and notice | Gold was the only accent hue, and it was spent on references the user cannot act on. The eye went to metadata first | Removed from working screens. Kept only on «مسار العمل» as neutral grey `Code` chips, where they are the content |
| S2 | Project header: title, 4–6 chips, a 6-step stepper, a 7-fact project bar and up to 3 banners | Fifteen-plus elements of equal weight, so there was no focal point | Header keeps title + id, client · PM, status + progress, and three quick stats (old design). One strip shows **الخطوة التالية + صاحب الإجراء + why it needs attention**. The stepper moved to an «مراحل المشروع» card and the government facts to «المعاملة الحكومية الجارية» |
| S2 | 13 tabs with long names ("التعيين والفريق", "المخرجات والإصدارات", "الملفات (Nextcloud)"…) overflowed the row | Hick's law, and labels had to be read to tell tabs apart | One-word labels; «الدفعات» + «التكاليف» merged into «المالية» with a segmented switch |
| S2 | «سلسلة الهوية والروابط» chain of 9 boxes at the top of Overview | Showed the data model, not the task | Replaced by an «العميل والتعاقد» card: client tile, then opportunity, quotation, activation and payment schedule as label/value rows |
| S2 | A subtitle explaining the rule under every card title | Text carried structure. Two lines to read before every block | Subtitles removed or reduced to orientation only |
| S2 | KPI tiles inside the finance card; bordered boxes inside cards; dashed empty states inside cards | Containment used on everything, so it no longer signalled grouping | Finance shown as a label/value grid; boxes inside cards removed; empty states have no box inside a card |
| S2 | White sidebar on a white page | Weak figure/ground between navigation and work | Dark brand sidebar, as in the original |
| S3 | Demo date controls and the "interactive model" banner in the top bar | Prototype tooling competed with the product in a fixed landmark | One calendar button with a popover. Banner removed |
| S3 | Category pills in 5 hues (قرار / مالية / مراجعة / متابعة / عمل) | Status colours reused for categories | Neutral icon tile per kind plus a text label. Colour is reserved for state (late, blocked) |

## 3. The design system C uses

The goal is a minimum set of rules, used without exception.

- **Layout landmarks.**
  - Dark sidebar on the start side, with the light ABAK logo, the navigation, and the acting user at the bottom (click to switch).
  - White top bar with menu, project search, the demo date and notifications.
  - Content on `#F7F9FA`.
- **Spacing.** Gaps are tied to relationships, not set by eye.

  | Relationship | Gap |
  |---|---|
  | Within an element | 4–8 px (`gap-1/2`) |
  | Related items | 12–16 px (`gap-3/4`) |
  | Between cards | 24 px (`gap-6`, `space-y-6`) |
  | Card padding | 20 px; header `px-5 py-4` |

- **Type roles.**

  | Role | Style |
  |---|---|
  | Page title | `2xl bold` |
  | Card title | `base semibold` |
  | Body | `sm` |
  | Label | `xs muted` |
  | Value | `sm medium/semibold ink` |
  | IDs | `xs muted`, LTR-isolated |

  Font: Inter for Latin script, and the system Arabic face (as in the original).
- **Colour jobs.**

  | Colour | Job |
  |---|---|
  | Brand `#216383` | Primary action, active navigation, links, identity icons |
  | Dark brand `#0F2C3A` | Sidebar |
  | Status tokens (success / waiting / danger / progress / muted) | Status only, always with text |
  | Gold | The logo only |

- **Containment.**
  - One card per topic. No cards inside cards.
  - Lists and tables sit in one white panel.
  - Shadows are a 1 px hairline on cards; real elevation is kept for menus, popovers, dialogs and drawers.
- **One primary per view.** For example: «مهمة جديدة» on My Work, «طلبات التفعيل» on Projects, and the drawer's main command.

## 4. Where C goes beyond the original

These are new elements, because the process has information the original never had.

1. **«الخطوة التالية» strip** on every project: what must happen next, who holds it, and why the project needs attention (suspended, late, start gate unmet, delivery blocked until payment, working under a CEO exception). This answers "what should I do next?" from the header alone.
2. **«تحتاج انتباهًا»** KPI on the dashboard and a matching quick filter on Projects. The user no longer has to scan every project to find the stuck ones.
3. **«المشاريع حسب المرحلة»**: projects in lifecycle order. Empty stages recede; occupied stages lead and link to the filtered list.
4. **KPI tiles are links** to the list behind the number (dashboard → My Work and Projects).
5. **«مراحل المشروع»** is shown vertically: done stages are ticked, the current one leads, the rest recede.
6. **Deliverable progress by department**, with a count per state above the bars. This replaces the original's mock "phase progress".
7. **The search box works.** It finds projects you can see by number, name or client; Enter opens the first result.
8. **The overview adapts.** When nothing waits on you, deliverable progress takes the lead slot instead of an empty «ما المطلوب منك» card.

## 5. Verification

- `npm run typecheck`, `npm run journeys` (79 engine checks) and `npm run build`.
- UI journeys through the real interface: `scripts/ui-journey-1.cjs` and `scripts/ui-journeys-2-6.cjs`. Every button label, field label and tab label the scripts use was kept, so the journeys still exercise the same commands.
- Grayscale and blur screenshots of the dashboard, projects list and project page. In grayscale the hierarchy still reads: title, then next step, then the first card, and late or attention items keep their icon and text. Under blur the page title and the lead card are the first shapes the eye lands on.
