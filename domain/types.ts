/**
 * The Projects process from the ABAK flowchart (FigJam m8bOEgUWzcEmKuOINjyJ1X, sections 01–10
 * and MASTER), expressed as records, states and links. Section 11 of the board is the spec:
 * 11-A entities, 11-B state machines, 11-C permissions, 11-D events, 11-E settings, 11-F rules.
 *
 * This is a front-end prototype: every record lives in the browser. The engine in
 * domain/engine enforces the same transitions, permissions and rules the ERP backend will.
 */

export type ISO = string;
export type UserId = string;
export type DeptCode =
  | 'LIC' | 'ARC' | 'STR' | 'SUP' | 'FLS' | 'MEP' | 'MOD' | 'SUR' | 'PROP' | 'GEO' | 'TRF' | 'QTY' | 'EXP';

// ── People and access (11-C, X-02) ─────────────────────────────────────────────

export type RoleId =
  | 'ceo' | 'main_dept_manager' | 'dept_manager' | 'engineer' | 'accountant'
  | 'sales_rep' | 'sales_manager' | 'admin';

export type Perm =
  | 'project.read' | 'project.assign_manager' | 'project.staff' | 'project.prepare' | 'project.run'
  | 'project.request_change' | 'project.approve_change' | 'project.approve_closure'
  | 'project.review_settlement' | 'project.grant_exception' | 'project.register_existing'
  | 'activation.approve' | 'payment.verify_entitlement' | 'collection.confirm'
  | 'deliverable.prepare' | 'deliverable.review' | 'deliverable.deliver'
  | 'gov_transaction.prepare' | 'gov_transaction.assign' | 'gov_transaction.follow_up'
  | 'cost_request.create' | 'cost_request.approve' | 'cost_request.pay'
  | 'task.manage' | 'visit.manage' | 'visit.approve_report'
  | 'opportunity.work' | 'admin.settings';

export type Scope = 'own' | 'department' | 'all';

export interface Grant { perm: Perm; scope: Scope }

export interface User {
  id: UserId;
  name: string;
  title: string;
  email: string;
  /** The first role listed for the person; `extraRoles` holds the rest (e.g. «مدير القسم، مهندس»). */
  roleId: RoleId;
  extraRoles?: RoleId[];
  deptCode?: DeptCode;
  /** Further departments a manager also runs. */
  extraDepts?: DeptCode[];
  /** A deactivated account keeps its history but cannot act or be assigned. */
  deactivated?: boolean;
  /** Direct grants on top of the role (OD-01: licensing officer, transactions manager, expeditor). */
  grants: Grant[];
  /** The manager this person reports to (escalation level 2). */
  managerId?: UserId;
  initials: string;
}

// ── Sales and finance records the project starts from (X-01) ───────────────────

export interface Client {
  id: string; // CNT-YYYY-NNNN
  name: string;
  kind: 'company' | 'individual';
  contact: string;
  phone: string;
  email: string;
  city: string;
}

export interface Opportunity {
  id: string; // OPP-YYYY-NNNN
  clientId: string;
  title: string;
  ownerId: UserId; // مسؤول الفرصة — follows the client and collections after the win (D10)
  stage: 'won' | 'negotiation';
}

export interface QuoteLine {
  id: string;
  serviceCode: string;
  title: string;
  deptCode: DeptCode;
  amount: number;
  /** Execution site this line belongs to; undefined = shared across sites. */
  siteName?: string;
}

export type PaymentCondition =
  | 'advance' | 'completion' | 'delivery' | 'acceptance' | 'licence' | 'periodic' | 'date';

export interface QuotePayment {
  id: string;
  label: string;
  amount: number;
  condition: PaymentCondition;
  /** For date and periodic payments. */
  dueDate?: ISO;
  /** Payment the contract requires before a given delivery (DL-04). */
  beforeDeliveryOfLineId?: string;
  graceDays: number;
}

export interface Quotation {
  id: string; // Q-YYMMDD-SEQ
  opportunityId: string;
  revision: string; // Rev 00, Rev 01 …
  kind: 'original' | 'paid_addition';
  lines: QuoteLine[];
  payments: QuotePayment[];
  dayType: 'working' | 'calendar';
  kickoffRequired: boolean;
  responseDays?: number;
  deemedAcceptanceClause?: string;
  acceptedAt: ISO;
  durationDays: number;
}

export type ActivationStatus = 'pending_finance' | 'approved' | 'returned';

/** The finance activation (existing ERP step 15–16). Approval creates or links the project. */
export interface Activation {
  id: string; // ACT-…
  opportunityId: string;
  quotationId: string;
  status: ActivationStatus;
  requestedBy: UserId;
  requestedAt: ISO;
  decidedBy?: UserId;
  decidedAt?: ISO;
  note?: string;
  projectId?: string;
}

/** Pre-finance exception, CEO only (PJ-02, A2, F15). */
export interface CeoException {
  id: string; // EXC-…
  opportunityId: string;
  quotationId: string;
  requestedBy: UserId;
  requestedAt: ISO;
  reason: string;
  commitmentDoc: string;
  allowedScope: string;
  /** Quotation lines the work may cover before finance approval (F15); everything else waits. */
  allowedLineIds: string[];
  durationDays: number;
  costCap: number;
  status: 'requested' | 'granted' | 'rejected' | 'expired' | 'linked';
  decidedBy?: UserId;
  decidedAt?: ISO;
  decisionNote?: string;
  expiresAt?: ISO;
  projectId?: string;
  renewals: { at: ISO; by: UserId; days: number; extraCap: number; note: string }[];
  lastCeoAlertAt?: ISO;
}

// ── Project (11-B1) ─────────────────────────────────────────────────────────────

export type ProjectState =
  | 'awaiting_assignment' | 'preparing' | 'in_progress' | 'suspended' | 'technically_complete'
  | 'closure_review' | 'operationally_closed' | 'cancellation_review' | 'cancelled';

export type MemberCapacity =
  | 'project_manager' | 'dept_manager' | 'item_owner' | 'reviewer' | 'licensing_officer'
  | 'expeditor' | 'opportunity_owner' | 'member';

export interface Member { userId: UserId; capacity: MemberCapacity; deptCode?: DeptCode; since: ISO }

export interface DeptAssignment {
  deptCode: DeptCode;
  managerId: UserId;
  status: 'active' | 'joining';
  joinedAt: ISO;
  viaRequestId?: string;
}

export interface Site { id: string; name: string; city: string; suspended?: { reason: string; since: ISO } }

export interface ScopeItem {
  id: string;
  /** The quotation line it was moved from (F3: moved, never copied). */
  sourceLineId?: string;
  quotationId?: string;
  title: string;
  serviceCode?: string;
  deptCode: DeptCode;
  siteId?: string;
  trackId?: string;
  ownerId?: UserId;
  origin: 'contract' | 'paid_addition' | 'free_addition' | 'pre_system';
}

export interface PlanTask {
  id: string;
  name: string;
  scopeItemId?: string;
  ownerId?: UserId;
  duration: number;
  dependencies: string[];
  startDate?: ISO;
  endDate?: ISO;
  done: boolean;
}

export interface Phase { id: string; name: string; order: number; siteId?: string; tasks: PlanTask[] }

export interface Track { id: string; name: string; deptCodes: DeptCode[]; approvedBy: UserId; at: ISO; scopeItemIds: string[] }

export type ApprovalDecision = 'approved' | 'returned' | 'rejected';

export interface ChainStep {
  key: 'dept_managers' | 'director' | 'finance' | 'ceo';
  /** Who may decide this step; dept managers decide in parallel (AD-06). */
  approverIds: UserId[];
  decisions: { userId: UserId; decision: ApprovalDecision; note: string; at: ISO }[];
  status: 'waiting' | 'pending' | 'approved' | 'returned';
}

export interface ApprovalChain {
  kind: 'closure' | 'cancellation';
  requestedBy: UserId;
  requestedAt: ISO;
  reason: string;
  steps: ChainStep[];
  status: 'pending' | 'approved' | 'returned';
  /** State to return to on a returned request. */
  returnTo: ProjectState;
}

export type ChangeKind = 'add_department' | 'free_addition' | 'paid_addition' | 'exclusion' | 'track';

export interface ChangeRequest {
  id: string;
  kind: ChangeKind;
  requestedBy: UserId;
  requestedAt: ISO;
  reason: string;
  /** add_department */
  deptCode?: DeptCode;
  scope?: string;
  deliverableTitles?: string[];
  /** free_addition */
  title?: string;
  timeEffectDays?: number;
  costEffect?: number;
  /** exclusion */
  deliverableId?: string;
  clientAgreement?: string;
  /** track */
  scopeItemIds?: string[];
  trackName?: string;
  /** paid_addition: the linked sales opportunity / quotation */
  quotationId?: string;
  status: 'pending' | 'approved' | 'returned' | 'rejected' | 'with_sales' | 'linked';
  decidedBy?: UserId;
  decidedAt?: ISO;
  decisionNote?: string;
}

export interface Kickoff {
  required: boolean;
  status: 'not_held' | 'held';
  heldAt?: ISO;
  minutes?: string;
  attendees?: UserId[];
}

export interface PaymentMapping {
  status: 'draft' | 'submitted' | 'returned' | 'confirmed';
  submittedAt?: ISO;
  decidedBy?: UserId;
  decidedAt?: ISO;
  note?: string;
}

export interface Suspension {
  type: 'client' | 'authority' | 'payment' | 'internal';
  reason: string;
  since: ISO;
  until?: ISO;
  by: UserId;
}

export interface DateChange { from: ISO; to: ISO; reason: string; at: ISO; by: UserId }

export interface NextcloudSpace {
  status: 'not_created' | 'created' | 'acl_pending' | 'open';
  path?: string;
  folderId?: string;
  lastSyncAt?: ISO;
}

export interface Project {
  id: string; // PRJ-YYYY-NNNN
  title: string;
  clientId: string;
  opportunityId?: string;
  /** Project ↔ contract 1:N (A3): original quotation + paid additions. */
  contracts: { quotationId: string; kind: 'original' | 'paid_addition'; linkedAt: ISO }[];
  activationIds: string[];
  exceptionId?: string;
  createdFrom: 'activation' | 'exception' | 'pre_system';
  createdAt: ISO;
  status: ProjectState;
  financialState: 'open' | 'settled';
  multiDept: boolean;
  leadDept?: DeptCode;
  receivedAt?: ISO;
  receivedBy?: UserId;
  departments: DeptAssignment[];
  pmNomination?: { nomineeId: UserId; nominatedBy: UserId; at: ISO; status: 'pending' | 'approved' | 'returned'; note?: string };
  pmId?: UserId;
  followUpOwnerId?: UserId; // client follow-up owner when there is no opportunity (AD-08)
  members: Member[];
  sites: Site[];
  scopeItems: ScopeItem[];
  phases: Phase[];
  tracks: Track[];
  dayType: 'working' | 'calendar';
  kickoff: Kickoff;
  paymentMapping: PaymentMapping;
  suspension?: Suspension;
  suspensions: Suspension[];
  contractStart?: ISO;
  contractEndDate?: ISO; // original, never moved
  expectedEndDate?: ISO;
  dateChanges: DateChange[];
  startedAt?: ISO;
  technicallyCompleteAt?: ISO;
  closedAt?: ISO;
  cancelledAt?: ISO;
  closure?: ApprovalChain;
  cancellation?: ApprovalChain;
  changeRequests: ChangeRequest[];
  nextcloud: NextcloudSpace;
  preSystem?: { currentPhase: string; remainingWork: string; documents: string; financeReviewed: boolean; financeNote?: string };
  responseDays: number;
  deemedAcceptanceClause?: string;
}

// ── Deliverables (11-B2, NX-04) ─────────────────────────────────────────────────

export type DeliverableState =
  | 'not_started' | 'in_preparation' | 'internal_review' | 'ready_for_delivery' | 'blocked_pending_payment'
  | 'awaiting_client' | 'deemed_acceptance_review' | 'client_approved' | 'excluded';

export interface FileRef { name: string; fileId: string; checksum: string; size: string }

export interface Revision {
  rev: number;
  files: FileRef[];
  createdAt: ISO;
  createdBy: UserId;
  reason: 'initial' | 'internal_return' | 'client_comments';
  reviewRounds: { submittedAt: ISO; reviewerId?: UserId; decision?: 'accepted' | 'returned'; note?: string; at?: ISO }[];
  approvedInternallyAt?: ISO;
  issued?: { at: ISO; by: UserId; channel: string; recipient: string; reference: string };
  clientResponse?: { kind: 'comments' | 'accepted' | 'deemed'; at: ISO; note: string; proof?: string; by: UserId };
}

export interface Deliverable {
  id: string;
  projectId: string;
  title: string;
  scopeItemIds: string[];
  deptCode: DeptCode;
  siteId?: string;
  technical: boolean;
  /** A government procedure is needed to complete it (GT-01). */
  requiresGov: boolean;
  status: DeliverableState;
  revisions: Revision[];
  responseDueAt?: ISO;
  nextFollowUpAt?: ISO;
  deemedRequest?: { clause: string; evidence: string; by: UserId; at: ISO; decidedBy?: UserId; decision?: 'approved' | 'returned'; note?: string };
  exclusion?: { reason: string; clientAgreement: string; approvedBy: UserId; at: ISO };
  ceoRelease?: { by: UserId; at: ISO; reason: string };
  govTransactionId?: string;
  origin: 'contract' | 'paid_addition' | 'free_addition' | 'pre_system';
}

// ── Payments: three separate dimensions (11-B3, A5) ─────────────────────────────

export type Entitlement = 'not_due' | 'due' | 'overdue';
export type Invoicing = 'not_invoiced' | 'invoiced';
export type Collection = 'unpaid' | 'partially_collected' | 'fully_collected';

export interface PaymentItem {
  id: string; // FPS-…-n
  projectId: string;
  quotationId: string;
  label: string;
  amount: number;
  condition: PaymentCondition;
  /** Link to deliverables, items or a phase (PJ-07). Time-based payments have no deliverable link. */
  link: { kind: 'deliverables' | 'items' | 'phase' | 'none'; ids: string[] };
  scheduledDate?: ISO;
  graceDays: number;
  beforeDeliveryOf?: string[]; // deliverable ids that may not be delivered before this is collected
  entitlement: Entitlement;
  dueAt?: ISO;
  graceUntil?: ISO;
  overdueAt?: ISO;
  evidence: { deliverableId?: string; rev?: number; kind: string; at: ISO; note: string }[];
  evidenceCheck: 'none' | 'pending' | 'accepted' | 'objected';
  invoicing: Invoicing;
  invoiceRef?: string;
  invoicedAt?: ISO;
  collection: Collection;
  collected: number;
  receipts: { amount: number; at: ISO; by: UserId; ref: string }[];
  transferClaim?: { at: ISO; by: UserId; proof: string };
  followUps: { at: ISO; by: UserId; response: string; promise?: string; expectedDate?: ISO; nextFollowUp?: ISO }[];
  escalatedAt?: ISO;
  escalation?: 'auto' | 'early';
  visitIds?: string[];
}

// ── Government transactions (11-B4) ─────────────────────────────────────────────

export type GovState =
  | 'preparing' | 'awaiting_client' | 'submitted' | 'awaiting_fees' | 'at_authority'
  | 'comments_processing' | 'final_rejection_decision' | 'issued' | 'closed_not_issued';

export interface GovRound {
  n: number;
  submittedAt: ISO;
  requestNo: string;
  authorityStart?: ISO;
  authorityEnd?: ISO;
  officeStart?: ISO;
  officeEnd?: ISO;
  outcome?: 'comments' | 'docs_request' | 'rejected' | 'issued';
  outcomeNote?: string;
  commentsTaskId?: string;
}

export interface GovTransaction {
  id: string; // GOV-YYYY-NNNN
  projectId: string;
  deliverableId?: string;
  serviceCode: string;
  title: string;
  authority: string;
  platform: string;
  procedureType: string;
  requiredDocs: { name: string; received: boolean }[];
  status: GovState;
  licensingOfficerId: UserId;
  expeditorId?: UserId;
  rounds: GovRound[];
  fees?: { amount: number; payer: 'client' | 'abak'; status: 'pending' | 'paid'; costRequestId?: string; recordedBy?: UserId };
  feeInvoiceChecked: boolean;
  followUps: { at: ISO; by: UserId; outcome: string; platformStatus: string; nextRequirement: string; visitId?: string }[];
  lastUpdateAt?: ISO;
  lastMissingAlertAt?: ISO;
  result?: { docNo: string; issuedAt: ISO; expiresAt?: ISO };
  closedReason?: string;
  createdAt: ISO;
  clientDocsRequestedAt?: ISO;
  expiryReminderAt?: ISO;
}

// ── Shared tasks (11-B5) and visits (11-B6) ─────────────────────────────────────

export type TaskState = 'new' | 'in_progress' | 'blocked' | 'in_review' | 'completed' | 'cancelled';

export type RecordType = 'project' | 'deliverable' | 'gov' | 'visit' | 'payment' | 'opportunity' | 'cost_request' | 'none';

export interface RecordLink { type: RecordType; id: string; label: string; projectId?: string }

export interface Task {
  id: string; // TSK-…
  title: string;
  ownerId: UserId;
  creatorId: UserId;
  dueDate: ISO;
  priority: 'low' | 'medium' | 'high';
  status: TaskState;
  link?: RecordLink;
  reviewerId?: UserId;
  contributors: UserId[];
  comments: { by: UserId; at: ISO; text: string }[];
  attachments: { name: string; fileId: string; size: string; by: UserId; at: ISO }[];
  blockReason?: { type: 'client' | 'authority' | 'task' | 'payment' | 'other'; note: string; since: ISO };
  result?: string;
  reviewNote?: string;
  cancelReason?: string;
  reassignLog: { from: UserId; to: UserId; reason: string; at: ISO; by: UserId }[];
  /** (source, id, purpose) — generated tasks never duplicate (F11, TK-11). */
  dedupeKey?: string;
  source: 'manual' | 'kickoff' | 'gov_comments' | 'collection' | 'visit_followup';
  escalations: { level: 1 | 2; at: ISO; to: UserId }[];
  reminderSentAt?: ISO;
  createdAt: ISO;
  completedAt?: ISO;
}

export type VisitType = 'introduction' | 'inspection' | 'pricing' | 'project_start' | 'supervision' | 'handover' | 'expeditor';
export type VisitState = 'proposed' | 'confirmed' | 'executed' | 'inaccessible' | 'report_pending' | 'report_approved' | 'cancelled';
export type VisitBilling = 'included' | 'free' | 'billable' | 'na';

export interface Visit {
  id: string; // VST-…
  type: VisitType;
  purpose: string;
  expectedResult: string;
  location: string;
  contact: string;
  link?: RecordLink;
  ownerId: UserId;
  participants: UserId[];
  plannedStart: ISO;
  plannedEnd: ISO;
  status: VisitState;
  history: { at: ISO; by: UserId; change: string; note?: string }[];
  actualStart?: ISO;
  actualEnd?: ISO;
  result?: { summary: string; nextStep?: string; notes?: string; photos?: number; documents?: string; nextRequirement?: string };
  report?: { file: string; submittedAt: ISO; approverId: UserId; decision?: 'approved' | 'returned'; note?: string; at?: ISO };
  inaccessible?: { reason: string; proof: string };
  cancelReason?: string;
  billing: VisitBilling;
  claimId?: string;
  createdBy: UserId;
  createdAt: ISO;
}

/** Manual finance claim covering one or several billable visits (VS-08). */
export interface VisitClaim { id: string; projectId?: string; visitIds: string[]; amount: number; at: ISO; by: UserId; ref: string }

// ── Cost requests (11-B7) ───────────────────────────────────────────────────────

export type CostState = 'submitted' | 'returned' | 'rejected' | 'approved' | 'partially_paid' | 'paid' | 'service_received';

export interface CostRequest {
  id: string; // CR-…
  projectId: string;
  scopeItemId?: string;
  govTransactionId?: string;
  service: string;
  reason: string;
  kind: 'planned' | 'unplanned' | 'over_estimate';
  justification?: string;
  amount: number;
  plannedEstimate?: number;
  vendor: string;
  quoteRef: string;
  paymentTerms: string;
  bearer: 'abak' | 'client';
  payer: 'abak' | 'client';
  requestedBy: UserId;
  requestedAt: ISO;
  status: CostState;
  decisions: { by: UserId; decision: ApprovalDecision | 'resubmitted'; note: string; at: ISO }[];
  paid: number;
  payments: { amount: number; at: ISO; by: UserId; proof: string }[];
  serviceReceivedAt?: ISO;
}

// ── Platform: events, notifications, settings ───────────────────────────────────

export interface EventRecord {
  id: string;
  at: ISO;
  actorId: UserId | 'system';
  type: string;
  entity: { type: string; id: string };
  projectId?: string;
  summary: string;
}

export interface Notification {
  id: string;
  userId: UserId;
  at: ISO;
  title: string;
  body?: string;
  link?: string;
  eventType: string;
  read: boolean;
}

export interface Settings {
  clientResponseDays: number;       // 6008:1270 (OD-15)
  deliveryFollowUpDays: number;     // 6008:1278
  collectionEscalationDays: number; // 6008:1462, D10
  defaultGraceDays: number;         // A5 (OD-05)
  expeditorUpdateDays: number;      // 6012:1738
  ceoExceptionAlertDays: number;    // 6007:970
  taskReminderDays: number;         // 6013:1845
  intakeSlaWorkingDays: number;     // proposed SLA
  expiryReminderDays: number;       // GT-11
  workWeek: number[];               // 0 = Sunday … 6 = Saturday
  holidays: { date: string; name: string }[];
}

export interface AppState {
  version: number;
  now: ISO;
  users: User[];
  clients: Client[];
  opportunities: Opportunity[];
  quotations: Quotation[];
  activations: Activation[];
  exceptions: CeoException[];
  projects: Project[];
  deliverables: Deliverable[];
  payments: PaymentItem[];
  gov: GovTransaction[];
  tasks: Task[];
  visits: Visit[];
  visitClaims: VisitClaim[];
  costs: CostRequest[];
  events: EventRecord[];
  notifications: Notification[];
  settings: Settings;
  seq: Record<string, number>;
}
