export type RiskLevel = 'Healthy' | 'Watch' | 'At Risk' | 'Critical'
export type AmcStatus = 'Active' | 'Expiring Soon' | 'Renewal Pending' | 'Renewed' | 'Expired'
export type ComplaintStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed'
export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue' | 'Partially Paid'
export type ServiceStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'
export type CustomerType = 'Individual' | 'Business'
export type PaymentMethod = 'UPI' | 'Net Banking' | 'Credit Card' | 'Debit Card' | 'Bank Transfer' | 'Cash' | 'Card' | 'Cheque'
export type RetentionStatus = 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Rejected'
export type NotificationType = 'Risk' | 'AMC' | 'Complaint' | 'Payment' | 'System' | 'Service'
export type PrimaryRisk = 'Service Quality' | 'Payment' | 'Price' | 'Communication' | 'Low Risk'
export type Role = 'admin' | 'customer' | 'technician'
export type AccountStatus = 'pending' | 'active' | 'rejected'

export interface Session {
  name: string
  email: string
  role: Role
  customerId?: string
  technicianId?: string
}

export interface AuthAccount {
  id: string
  authUid?: string
  name: string
  email: string
  password: string
  role: Exclude<Role, 'admin'>
  status: AccountStatus
  customerId?: string
  technicianId?: string
  company?: string
  serviceTypes?: ServiceTypeKey[]
  city?: string
  requestedAt: string
  approvedAt?: string
  note?: string
  /**
   * An example profile that exists only to demonstrate a feature.
   *
   * The dispatch board draws demo technicians as columns, but they are not
   * people: they cannot sign in and must never appear in a list of technicians
   * that a job can be assigned to. Every assignment picker filters on this.
   */
  isDemo?: boolean
}

export interface RiskFactor {
  label: string
  points: number
}

export interface CustomerHealth {
  score: number
  level: RiskLevel
  factors: RiskFactor[]
}

export interface Customer {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  city: string
  type: CustomerType
  serviceTypes: ServiceTypeKey[]
  joined: string
  health: CustomerHealth
  /**
   * GST registration number, when the customer has one. Optional because a
   * walk-in customer without a GSTIN is a perfectly valid B2C invoice, and
   * requiring it would mean declining to bill someone for a repair they had
   * done.
   */
  gstin?: string | null
  /** GST state code, e.g. '27'. Decides CGST/SGST versus IGST. */
  state?: string | null
}

export type AssetCategory = 'AC' | 'Chiller' | 'DG Set' | 'Electrical Panel' | 'Water Cooler' | 'UPS' | 'Other'
export type AssetStatus = 'Active' | 'Retired'

/**
 * A single machine on a customer's site. Contracts, visits and complaints all
 * point at one of these, so "which unit does this contract cover?" has an
 * answer instead of being guesswork.
 */
export interface EquipmentAsset {
  id: string
  customerId: string
  name: string
  category: AssetCategory
  model: string
  serialNo: string
  capacity: string
  installedOn: string | null
  warrantyUntil: string | null
  locationNote: string
  status: AssetStatus
  createdAt: string
}

export interface AMCContract {
  id: string
  customerId: string
  serviceType: ServiceTypeKey
  startDate: string
  endDate: string
  /** Day the renewal is planned/committed for; picked on a calendar. */
  renewalDate?: string | null
  amount: number
  status: AmcStatus
  renewalStatus: 'None' | 'Pending' | 'Started' | 'Done' | 'Declined'
  /** The machine this contract covers. Null for site-wide contracts. */
  assetId?: string | null
  /**
   * How many preventive visits the contract buys per year. Null means no
   * cadence was ever set, which is what keeps existing contracts from
   * suddenly generating visits.
   */
  visitsPerYear?: number | null
  /** The next visit the generator should create. Null when nothing is scheduled. */
  nextVisitOn?: string | null
}

export interface ServiceRecord {
  id: string
  customerId: string
  /**
   * The AMC this visit is the preventive visit for. Null on ad-hoc and
   * on-demand jobs, which is what distinguishes a scheduled maintenance slot
   * from a breakdown call after the fact.
   */
  amcId?: string | null
  serviceType: ServiceTypeKey
  date: string
  technician: string
  /**
   * The resolved profile this visit belongs to, from `profiles.technician_id`.
   *
   * Null is normal and is not a bug to be hidden: `technician` above is free
   * text that predates accounts, and a name that matches no profile is a
   * question for a human. Guessing a technician from a spelling variant would be
   * worse than admitting the visit is unattributed, so the id stays null and the
   * UI groups those under "Unresolved" rather than quietly dropping them.
   */
  technicianId?: string | null
  /**
   * Scheduled start, in minutes from local midnight. Null means no start time
   * was recorded, which is distinct from midnight and is rendered blank: a visit
   * with no start time is not a job at 12:00 am.
   */
  startMinute?: number | null
  /**
   * Planned length in minutes. Null means "not estimated", in which case the
   * board falls back to the historical average for this customer and service
   * type, and if there is no history either it says the duration is unknown
   * rather than assuming one and reporting overlaps that are only artefacts of
   * that assumption.
   */
  durationMinutes?: number | null
  status: ServiceStatus
  rating: number | null
  notes: string
  checkInAt?: string | null
  checkOutAt?: string | null
  arrivedLat?: number | null
  arrivedLng?: number | null
  customerLat?: number | null
  customerLng?: number | null
  locationSharedAt?: string | null
  /** The machine that was worked on, when the visit was for a specific unit. */
  assetId?: string | null
}

export type AttachmentKind = 'photo' | 'signature'

/**
 * One piece of evidence attached to a visit. The image itself lives in
 * Supabase Storage; this is the index row pointing at it, which keeps large
 * binaries out of the services table and lets one query list a visit's
 * evidence.
 */
export interface JobAttachment {
  id: string
  serviceId: string
  kind: AttachmentKind
  /** Object name in the `job-evidence` bucket, not a URL. */
  storagePath: string
  /**
   * Time-limited URL that actually renders the object, minted at load time.
   *
   * The bucket is private, so a raw object name is not readable on its own and
   * there is no permanent public URL to hand around. Empty until loadEvidence
   * has signed it, and stale after `SIGNED_URL_TTL`, which is why the panel
   * re-signs on an image error rather than trusting this indefinitely.
   */
  url: string
  caption: string
  /** Who captured it. A claim about provenance, not a verified fact. */
  takenBy: string
  createdAt: string
}

/**
 * A part consumed on a visit. Prices are recorded as charged rather than
 * derived from a catalogue, because the price on the invoice has to still add
 * up years later, and the price charged is often not the list price.
 */
export interface JobPart {
  id: string
  serviceId: string
  name: string
  quantity: number
  /** What the customer was charged, per unit. */
  unitPrice: number
  /** What we paid. Never shown to a customer. */
  costPrice: number
  serialNo: string
  createdAt: string
}

/**
 * A customer signing off a completed visit on the technician's screen.
 *
 * This is a sign-off record, not a cryptographic signature, and the field
 * names do not pretend otherwise: the image is a PNG drawn on a canvas and
 * `signedBy` is whatever the technician typed.
 */
export interface JobSignature {
  id: string
  serviceId: string
  storagePath: string
  /** Time-limited display URL, signed at load time. See JobAttachment.url. */
  url: string
  signedBy: string
  roleNote: string
  createdAt: string
}

/**
 * A GST invoice.
 *
 * Every amount is paise held as an integer, and the tax already included in
 * `totalPaise` — so the figure on screen is the figure that gets filed. The
 * states are recorded on the document rather than resolved at print time,
 * because an invoice pulled up in three years has to show the rates and place
 * of supply that applied when it was issued.
 */
export interface Invoice {
  id: string
  /** The legal sequential number, e.g. INV-000042. Unique. */
  number: string
  paymentId: string | null
  customerId: string
  amcId: string | null
  serviceId: string | null
  issuedOn: string
  dueOn: string | null
  supplierState: string | null
  placeOfSupply: string | null
  interState: boolean
  taxRate: number
  subtotalPaise: number
  discountPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
  amountPaidPaise: number
  notes: string
  createdAt: string
  lines: InvoiceLine[]
}

export interface InvoiceLine {
  id: string
  invoiceId: string
  position: number
  description: string
  /** HSN/SAC. A service invoice is not valid for GST without it. */
  hsnSac: string
  quantity: number
  unitPricePaise: number
  taxRate: number
  lineTotalPaise: number
}

export interface Complaint {
  id: string
  customerId: string
  category: ComplaintCategory
  description: string
  severity: Severity
  status: ComplaintStatus
  created: string
  assignedTo: string
  serviceType?: ServiceTypeKey
  resolution?: string
  analysis?: AIComplaintAnalysis
  satisfaction?: number
  feedback?: string
  latitude?: number | null
  longitude?: number | null
  locationAddress?: string | null
  locationSharedAt?: string | null
  assignedAt?: string | null
  /** When a technician was put on the job. Null until someone is assigned. */
  respondedAt?: string | null
  /**
   * Deadlines derived from the severity matrix in utils/sla.ts. Null on
   * complaints raised before SLA tracking existed — no deadline is invented for
   * them, so the app reports "no SLA" rather than implying they were on time.
   */
  slaRespondBy?: string | null
  slaResolveBy?: string | null
  /** Latches true once a deadline passes, and stays true after resolution. */
  slaBreached?: boolean
  arrivedAt?: string | null
  arrivalLat?: number | null
  arrivalLng?: number | null
  workStartedAt?: string | null
  workCompletedAt?: string | null
  resolvedAt?: string | null
  /** The machine the complaint is about, when it concerns a specific unit. */
  assetId?: string | null
  /**
   * The visit that addressed this complaint, when one is known.
   *
   * This is the only thing that makes a first-time-fix figure a measurement
   * rather than a guess, so it is a plain text id rather than a foreign key: a
   * visit can be deleted without the complaint that referenced it being wrong,
   * and a dangling pointer is better than a cascade that erases the evidence.
   */
  serviceId?: string | null
  /** The resolved profile this complaint is assigned to, when one is known. */
  assignedToId?: string | null
}

export type ComplaintCategory = 'Service Quality' | 'Billing' | 'Technician' | 'Product' | 'Other'

export interface Payment {
  id: string
  invoice: string
  customerId: string
  amcId: string
  amount: number
  dueDate: string
  paidDate: string | null
  status: PaymentStatus
  method: PaymentMethod
  referenceId?: string
}

export type EmailType = 'critical-assignment' | 'assignment' | 'escalation' | 'resolution' | 'reminder' | 'system' | 'payment-reminder'

export interface EmailRecord {
  id: string
  to: string
  toEmail: string
  subject: string
  body: string
  type: EmailType
  sentAt: string
  read: boolean
  status?: 'queued' | 'sent'
  /** Migration 004, backfilled by matching the recipient address against the
   *  customer. Null for an address no customer owns, and null on a database
   *  where the column does not exist yet. */
  customerId?: string | null
}

export type CallStatus = 'queued' | 'ringing' | 'answered' | 'missed'

export interface CallRecord {
  id: string
  toName: string
  complaintId?: string
  type: 'assignment'
  message: string
  status: CallStatus
  createdAt: string
  read: boolean
  /** Migration 004. Added as a column but deliberately left null by the
   *  backfill: a call row only holds a display name, which several technicians
   *  share, so there is nothing in the data that identifies the customer. */
  customerId?: string | null
}

export interface RetentionAction {
  id: string
  customerId: string
  primaryRisk: PrimaryRisk
  recommendedAction: string
  steps: string[]
  reason: string
  priority: number
  status: RetentionStatus
  owner: string
  revenueAtRisk: number
  requiresApproval: boolean
  renewalOffer?: RenewalOffer
}

export interface RenewalOffer {
  title: string
  discountPercent: number
  benefits: string[]
  status: 'Approved' | 'Declined'
}

export interface Notification {
  id: string
  title: string
  description: string
  time: string
  type: NotificationType
  read: boolean
  customerId?: string
  link?: string
}

export type MessageSenderRole = 'customer' | 'admin' | 'technician'

export interface ComplaintMessage {
  id: string
  complaintId: string
  senderRole: MessageSenderRole
  senderName: string
  body: string
  createdAt: string
}

export interface AIComplaintAnalysis {
  category: ComplaintCategory
  severity: Severity
  sentiment: 'Positive' | 'Neutral' | 'Negative'
  repeatedIssue: boolean
  frustration: 'Low' | 'Medium' | 'High'
  recommendation: string
}

export interface RenewalEmail {
  subject: string
  body: string
}

/**
 * A period-over-period comparison shown under a KPI. `direction` is `none`
 * when there is not enough history to compare, so the card can stay neutral
 * instead of claiming growth that never happened.
 */
export interface KpiTrend {
  label: string
  direction: 'up' | 'down' | 'flat' | 'none'
}

export interface DashboardKpis {
  totalCustomers: number
  customerGrowth: KpiTrend
  activeAmcs: number
  amcGrowth: KpiTrend
  expiringSoon: number
  highRisk: number
  outstandingPayments: number
  overdueAccounts: number
  renewalRate: number
  renewalRateDelta: KpiTrend
  atRiskRevenue: number
}

export interface HealthDistribution {
  Healthy: number
  Watch: number
  'At Risk': number
  Critical: number
}

export interface ActivityEvent {
  id: string
  type: 'complaint' | 'payment' | 'amc' | 'customer' | 'service' | 'risk'
  title: string
  detail: string
  date: string
  customerId?: string
}

export type ServiceTypeKey =
  | 'AC Service'
  | 'Refrigeration'
  | 'HVAC'
  | 'Elevator'
  | 'Generator'
  | 'Water Purification'
