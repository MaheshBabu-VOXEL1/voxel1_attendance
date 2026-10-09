
export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type WorkType = 'OFFICE' | 'FIELD';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  displayOrder: number;
  isActive: boolean;
  created?: string;
}


export interface AppTheme {
  id: string;
  name: string;
  colors: {
    primary: string;
    hover: string;
    light: string;
  };
}

export interface Organization {
  id: string;
  name: string;
  address?: string;
  logo?: string;
  country?: string;
  subscriptionStatus?: SubscriptionStatus;
  created?: string;
  updated?: string;
  // Computed fields
  userCount?: number;
  adminEmail?: string;
  adminVerified?: boolean;
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  isSuperAdmin: boolean;
  isReadOnly: boolean;  // true for EXPIRED
  isBlocked: boolean;   // true for SUSPENDED
  isDemo: boolean;      // true for demo organization
}

export interface PlatformStats {
  totalOrganizations: number;
  totalUsers: number;
  activeOrganizations: number;
  expiredOrganizations: number;
  recentRegistrations: number;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  department?: string;
  organizationId?: string;
}

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  designation: string;
  avatar?: string;
  username?: string;
  teamId?: string;
  shiftId?: string;
  organizationId?: string;
  verified?: boolean;
}

export interface Employee extends User {
  /** Manager-board dot colour chosen for this person; otherwise it follows the discipline. */
  dotColour?: 'blue' | 'green' | 'grey';
  joiningDate: string;
  mobile: string;
  emergencyContact: string;
  salary: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  employmentType: 'PERMANENT' | 'CONTRACT' | 'TEMPORARY';
  location: string;
  nid?: string;
  password?: string;
  lineManagerId?: string;
  workType: WorkType;
  /** When the account was created (ISO); used when no joining date is set. */
  created?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'EARLY_OUT' | 'HALF_DAY';
  location?: { lat: number; lng: number; address?: string };
  /** Where the employee was when checking out; the database checks it against the office radius. */
  checkOutLocation?: { lat: number; lng: number };
  remarks?: string;
  /** Legacy: attendance no longer takes a selfie. Old photos are purged by cron-selfie-storage-cleanup. */
  selfie?: string;
  dutyType?: 'OFFICE';
  organizationId?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  lineManagerId?: string;
  type: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: 'PENDING_MANAGER' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';
  appliedDate: string;
  approverRemarks?: string;
  managerRemarks?: string;
  /** Last change (ISO) — for a decided request, when the manager decided it. */
  updated?: string;
  organizationId?: string;
}

export interface LeaveBalance {
  employeeId: string;
  [key: string]: string | number;
}

export interface LeavePolicy {
  defaults: Record<string, number>;
  overrides: Record<string, Record<string, number>>;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  isGovernment: boolean;
  type: 'FESTIVAL' | 'ISLAMIC' | 'NATIONAL';
}

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  provider: string;
}

export interface RelayConfig {
  username: string;
  fromName: string;
  isActive: boolean;
  relayUrl: string;
  resendApiKey?: string;
  useDirectResend?: boolean;
}

export interface OfficeLocation {
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  status: 'DRAFT' | 'PUBLISHED';
  authorId: string;
  authorName: string;
  category: string;
  publishedAt: string;
  created: string;
  updated: string;
  readingTime: number;
}

export interface Tutorial {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  status: 'DRAFT' | 'PUBLISHED';
  authorName: string;
  displayOrder: number;
  parentId: string;
  category: string;
  publishedAt: string;
  created: string;
  updated: string;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  lateGracePeriod: number;
  earlyOutGracePeriod: number;
  earliestCheckIn: string;
  autoSessionCloseTime: string;
  workingDays: string[];
  isDefault: boolean;
}

export interface ShiftOverride {
  id: string;
  employeeId: string;
  shiftId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface AppConfig {
  companyName: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  workingDays: string[];
  officeStartTime: string;
  officeEndTime: string;
  lateGracePeriod: number;
  earlyOutGracePeriod: number;
  earliestCheckIn?: string; // HH:mm - Earliest allowed punch-in
  autoSessionCloseTime?: string; // HH:mm - Auto check-out time
  defaultReportRecipient?: string;
  smtp?: RelayConfig;
  overtimeEnabled?: boolean;
  autoAbsentEnabled?: boolean;
  autoAbsentTime?: string; // HH:mm
  officeLocations?: OfficeLocation[];
  dutyLabel1?: string; // Label for the check-in button (default "Mark Present")
}

export interface RegistrationData {
  orgName: string;
  adminName: string;
  email: string;
  password: string;
  country: string;
  address?: string;
  logo?: File | null;
}

// Announcement Types
export type AnnouncementPriority = 'NORMAL' | 'URGENT';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  priority: AnnouncementPriority;
  targetRoles: Role[];
  expiresAt?: string;
  organizationId: string;
  created: string;
  updated: string;
}

// Notification Types
export type NotificationType = 'ANNOUNCEMENT' | 'LEAVE' | 'ATTENDANCE' | 'REVIEW' | 'SYSTEM' | 'NEW_REGISTRATION';
export type NotificationPriority = 'NORMAL' | 'URGENT';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  isRead: boolean;
  priority: NotificationPriority;
  referenceId?: string;
  referenceType?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  organizationId: string;
  created: string;
  updated: string;
}

// Notification Config Types
export type EmailDigestFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'OFF';

export interface OrgNotificationConfig {
  enabledTypes: NotificationType[];
  emailDigestFrequency: EmailDigestFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;   // HH:mm
  quietHoursEnd: string;     // HH:mm
}

export interface UserNotificationPreferences {
  mutedTypes: NotificationType[];
  emailDigestFrequency: EmailDigestFrequency;
}



// Per-employee summary row for the Employee Summary Report
export interface CustomLeaveType {
  id: string;
  name: string;
  color: string;
  hasBalance: boolean;
}

export interface EmployeeAttendanceSummary {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  halfDays: number;
  attendancePercentage: number;
}


