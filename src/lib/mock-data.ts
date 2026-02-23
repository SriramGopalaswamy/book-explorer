/**
 * Mock data for Developer Mode
 * Used when no authenticated user is present (Dev Mode bypass)
 */

import type { FinancialRecord, MonthlyData, CategoryData } from "@/hooks/useFinancialData";
import type { Invoice } from "@/hooks/useInvoices";
import type { Goal, GoalStats } from "@/hooks/useGoals";
import type { Memo, MemoStats } from "@/hooks/useMemos";
import type { PayrollRecord } from "@/hooks/usePayroll";
import type { AttendanceRecord, AttendanceStats } from "@/hooks/useAttendance";
import type { LeaveRequest, LeaveBalance, Holiday } from "@/hooks/useLeaves";
import type { BankAccount, BankTransaction } from "@/hooks/useBanking";
import type { ScheduledPayment } from "@/hooks/useCashFlow";
import type { Employee } from "@/hooks/useEmployees";

const MOCK_USER_ID = "dev-mode-user";

export const mockEmployees: Employee[] = [
  { id: "e1", user_id: MOCK_USER_ID, full_name: "Rajesh Kumar", email: "rajesh.kumar@grx10.com", avatar_url: null, job_title: "CEO & Founder", department: "Management", status: "active", join_date: "2023-01-01", phone: "+91-9988776655", manager_id: null, created_at: "2023-01-01", updated_at: "2026-02-17" },
  { id: "e2", user_id: "u2", full_name: "Amit Patel", email: "amit.patel@grx10.com", avatar_url: null, job_title: "Tech Lead", department: "Engineering", status: "active", join_date: "2023-06-15", phone: "+91-9876500001", manager_id: "e1", created_at: "2023-06-15", updated_at: "2026-02-17" },
  { id: "e3", user_id: "u3", full_name: "Neha Gupta", email: "neha.gupta@grx10.com", avatar_url: null, job_title: "Frontend Developer", department: "Engineering", status: "active", join_date: "2024-01-10", phone: "+91-9876500002", manager_id: "e2", created_at: "2024-01-10", updated_at: "2026-02-17" },
  { id: "e4", user_id: "u4", full_name: "Ananya Reddy", email: "ananya.reddy@grx10.com", avatar_url: null, job_title: "HR Manager", department: "HR", status: "active", join_date: "2023-02-01", phone: "+91-9876500004", manager_id: "e1", created_at: "2023-02-01", updated_at: "2026-02-17" },
  { id: "e5", user_id: "u5", full_name: "Suresh Iyer", email: "suresh.iyer@grx10.com", avatar_url: null, job_title: "Finance Manager", department: "Finance", status: "active", join_date: "2023-04-10", phone: "+91-9876500005", manager_id: "e1", created_at: "2023-04-10", updated_at: "2026-02-17" },
  { id: "e6", user_id: "u6", full_name: "Rahul Mehta", email: "rahul.mehta@grx10.com", avatar_url: null, job_title: "Sales Director", department: "Sales", status: "active", join_date: "2023-01-20", phone: "+91-9876500007", manager_id: "e1", created_at: "2023-01-20", updated_at: "2026-02-17" },
  { id: "e7", user_id: "u7", full_name: "Meera Krishnan", email: "meera.krishnan@grx10.com", avatar_url: null, job_title: "Product Manager", department: "Product", status: "active", join_date: "2023-08-05", phone: "+91-9876500010", manager_id: "e1", created_at: "2023-08-05", updated_at: "2026-02-17" },
  { id: "e8", user_id: "u8", full_name: "Vikram Singh", email: "vikram.singh@grx10.com", avatar_url: null, job_title: "Backend Developer", department: "Engineering", status: "active", join_date: "2024-03-20", phone: "+91-9876500003", manager_id: "e2", created_at: "2024-03-20", updated_at: "2026-02-17" },
  { id: "e9", user_id: "u9", full_name: "Pooja Sharma", email: "pooja.sharma@grx10.com", avatar_url: null, job_title: "Marketing Lead", department: "Marketing", status: "active", join_date: "2023-11-01", phone: "+91-9876500012", manager_id: "e1", created_at: "2023-11-01", updated_at: "2026-02-17" },
  { id: "e10", user_id: "u10", full_name: "Deepak Chauhan", email: "deepak.chauhan@grx10.com", avatar_url: null, job_title: "Mobile Developer", department: "Engineering", status: "on_leave", join_date: "2024-08-15", phone: "+91-9876500015", manager_id: "e2", created_at: "2024-08-15", updated_at: "2026-02-17" },
  { id: "e11", user_id: "u11", full_name: "Nikhil Desai", email: "nikhil.desai@grx10.com", avatar_url: null, job_title: "Data Engineer", department: "Engineering", status: "inactive", join_date: "2023-10-05", phone: "+91-9876500019", manager_id: "e2", created_at: "2023-10-05", updated_at: "2026-02-17" },
  { id: "e12", user_id: "u12", full_name: "Tanvi Bhatt", email: "tanvi.bhatt@grx10.com", avatar_url: null, job_title: "UX Designer", department: "Product", status: "active", join_date: "2024-01-25", phone: "+91-9876500020", manager_id: "e7", created_at: "2024-01-25", updated_at: "2026-02-17" },
];

export const mockFinancialRecords: FinancialRecord[] = [
  { id: "fr1", user_id: MOCK_USER_ID, type: "revenue", category: "Sales", amount: 52000, description: "Product sales", record_date: "2026-02-01", created_at: "2026-02-01", updated_at: "2026-02-01" },
  { id: "fr2", user_id: MOCK_USER_ID, type: "revenue", category: "Services", amount: 28000, description: "Consulting services", record_date: "2026-02-03", created_at: "2026-02-03", updated_at: "2026-02-03" },
  { id: "fr3", user_id: MOCK_USER_ID, type: "expense", category: "Salaries", amount: 15000, description: "Contractor payment", record_date: "2026-02-05", created_at: "2026-02-05", updated_at: "2026-02-05" },
  { id: "fr4", user_id: MOCK_USER_ID, type: "expense", category: "Software", amount: 4800, description: "SaaS subscriptions", record_date: "2026-02-02", created_at: "2026-02-02", updated_at: "2026-02-02" },
  { id: "fr5", user_id: MOCK_USER_ID, type: "revenue", category: "Sales", amount: 18500, description: "Retail sales", record_date: "2026-01-25", created_at: "2026-01-25", updated_at: "2026-01-25" },
  { id: "fr6", user_id: MOCK_USER_ID, type: "expense", category: "Marketing", amount: 8500, description: "Ad campaigns", record_date: "2026-01-22", created_at: "2026-01-22", updated_at: "2026-01-22" },
  { id: "fr7", user_id: MOCK_USER_ID, type: "revenue", category: "Services", amount: 32000, description: "Integration project", record_date: "2026-01-20", created_at: "2026-01-20", updated_at: "2026-01-20" },
  { id: "fr8", user_id: MOCK_USER_ID, type: "expense", category: "Utilities", amount: 3500, description: "Office utilities", record_date: "2026-01-28", created_at: "2026-01-28", updated_at: "2026-01-28" },
  { id: "fr9", user_id: MOCK_USER_ID, type: "expense", category: "Travel", amount: 6500, description: "Client visit travel", record_date: "2026-01-30", created_at: "2026-01-30", updated_at: "2026-01-30" },
  { id: "fr10", user_id: MOCK_USER_ID, type: "expense", category: "Salaries", amount: 12000, description: "Part-time staff", record_date: "2026-01-31", created_at: "2026-01-31", updated_at: "2026-01-31" },
];

export const mockInvoices: Invoice[] = [
  { id: "inv1", user_id: MOCK_USER_ID, invoice_number: "INV-2026-001", client_name: "Tata Consultancy Services", client_email: "billing@tcs.com", amount: 250000, status: "paid", invoice_date: "2025-12-20", due_date: "2026-01-15", created_at: "2025-12-20", updated_at: "2026-01-15" },
  { id: "inv2", user_id: MOCK_USER_ID, invoice_number: "INV-2026-002", client_name: "Infosys Ltd", client_email: "accounts@infosys.com", amount: 180000, status: "paid", invoice_date: "2025-12-28", due_date: "2026-01-25", created_at: "2025-12-28", updated_at: "2026-01-25" },
  { id: "inv3", user_id: MOCK_USER_ID, invoice_number: "INV-2026-003", client_name: "Wipro Technologies", client_email: "finance@wipro.com", amount: 320000, status: "sent", invoice_date: "2026-01-10", due_date: "2026-02-20", created_at: "2026-01-10", updated_at: "2026-01-10" },
  { id: "inv4", user_id: MOCK_USER_ID, invoice_number: "INV-2026-004", client_name: "HCL Technologies", client_email: "pay@hcl.com", amount: 145000, status: "sent", invoice_date: "2026-01-15", due_date: "2026-02-28", created_at: "2026-01-15", updated_at: "2026-01-15" },
  { id: "inv5", user_id: MOCK_USER_ID, invoice_number: "INV-2026-005", client_name: "Reliance Industries", client_email: "vendor@ril.com", amount: 475000, status: "draft", invoice_date: "2026-02-01", due_date: "2026-03-10", created_at: "2026-02-01", updated_at: "2026-02-01" },
  { id: "inv6", user_id: MOCK_USER_ID, invoice_number: "INV-2026-006", client_name: "Mahindra & Mahindra", client_email: "procurement@mahindra.com", amount: 92000, status: "overdue", invoice_date: "2025-12-10", due_date: "2026-01-05", created_at: "2025-12-10", updated_at: "2025-12-10" },
  { id: "inv7", user_id: MOCK_USER_ID, invoice_number: "INV-2026-007", client_name: "Bajaj Auto", client_email: "finance@bajaj.com", amount: 210000, status: "paid", invoice_date: "2026-01-05", due_date: "2026-02-01", created_at: "2026-01-05", updated_at: "2026-02-01" },
  { id: "inv8", user_id: MOCK_USER_ID, invoice_number: "INV-2026-008", client_name: "Larsen & Toubro", client_email: "ap@lt.com", amount: 560000, status: "sent", invoice_date: "2026-02-10", due_date: "2026-03-15", created_at: "2026-02-10", updated_at: "2026-02-10" },
];

export const mockGoals: Goal[] = [
  { id: "g1", user_id: MOCK_USER_ID, title: "Launch Mobile App v2.0", description: "Complete mobile app redesign", progress: 65, status: "on_track", category: "product", owner: "Rajesh Kumar", due_date: "2026-04-30", created_at: "2026-01-01", updated_at: "2026-02-17" },
  { id: "g2", user_id: MOCK_USER_ID, title: "Reduce Customer Churn by 15%", description: "Implement retention strategies", progress: 30, status: "at_risk", category: "customer", owner: "Priya Sharma", due_date: "2026-06-30", created_at: "2026-01-01", updated_at: "2026-02-17" },
  { id: "g3", user_id: MOCK_USER_ID, title: "Achieve ₹10Cr ARR", description: "Hit annual recurring revenue milestone", progress: 72, status: "on_track", category: "revenue", owner: "Rajesh Kumar", due_date: "2026-12-31", created_at: "2026-01-01", updated_at: "2026-02-17" },
  { id: "g4", user_id: MOCK_USER_ID, title: "Complete SOC 2 Audit", description: "Pass SOC 2 Type II compliance audit", progress: 100, status: "completed", category: "compliance", owner: "Amit Patel", due_date: "2026-01-31", created_at: "2025-10-01", updated_at: "2026-01-31" },
  { id: "g5", user_id: MOCK_USER_ID, title: "Hire 25 Engineers", description: "Scale engineering team", progress: 20, status: "at_risk", category: "hiring", owner: "HR Team", due_date: "2026-06-30", created_at: "2026-01-01", updated_at: "2026-02-17" },
  { id: "g6", user_id: MOCK_USER_ID, title: "ISO 27001 Certification", description: "Achieve information security certification", progress: 50, status: "on_track", category: "compliance", owner: "Amit Patel", due_date: "2026-09-30", created_at: "2026-01-01", updated_at: "2026-02-17" },
  { id: "g7", user_id: MOCK_USER_ID, title: "Expand to 3 New Markets", description: "Enter Pune, Hyderabad, and Chennai", progress: 40, status: "on_track", category: "growth", owner: "Rajesh Kumar", due_date: "2026-12-31", created_at: "2026-01-01", updated_at: "2026-02-17" },
];

export const mockGoalStats: GoalStats = {
  total: 7, completed: 1, onTrack: 4, atRisk: 2, delayed: 0,
};

export const mockMemos: Memo[] = [
  { id: "m1", user_id: MOCK_USER_ID, author_name: "Rajesh Kumar", title: "Q1 2026 Company Town Hall", subject: "Q1 Town Hall Announcement", content: "We are pleased to announce our Q1 town hall meeting scheduled for March 15th.", excerpt: "Q1 town hall meeting on March 15th.", department: "All", priority: "high", status: "published", views: 45, recipients: ["All Departments"], attachment_url: null, reviewer_notes: null, published_at: "2026-02-15", created_at: "2026-02-14", updated_at: "2026-02-15" },
  { id: "m2", user_id: MOCK_USER_ID, author_name: "Rajesh Kumar", title: "Updated Leave Policy 2026", subject: "Leave Policy Update", content: "Casual leave increased to 12 days per year, work-from-home days increased to 8 per month.", excerpt: "Leave policy updates for 2026.", department: "HR", priority: "medium", status: "published", views: 89, recipients: ["HR", "All Employees"], attachment_url: null, reviewer_notes: null, published_at: "2026-01-10", created_at: "2026-01-09", updated_at: "2026-01-10" },
  { id: "m3", user_id: MOCK_USER_ID, author_name: "Rajesh Kumar", title: "Security Advisory: Phishing Alert", subject: "Security Alert", content: "Multiple phishing attempts detected. Report suspicious emails to security@grx10.com.", excerpt: "Phishing alert: avoid suspicious links.", department: "IT", priority: "high", status: "published", views: 120, recipients: ["All Departments"], attachment_url: null, reviewer_notes: null, published_at: "2026-02-12", created_at: "2026-02-11", updated_at: "2026-02-12" },
  { id: "m4", user_id: MOCK_USER_ID, author_name: "Rajesh Kumar", title: "New Client Onboarding Process", subject: "Client Onboarding", content: "Implementing a new 5-step process starting March 1st.", excerpt: "New 5-step client onboarding launching March 1st.", department: "Sales", priority: "medium", status: "draft", views: 0, recipients: ["Sales", "Operations"], attachment_url: null, reviewer_notes: null, published_at: null, created_at: "2026-02-10", updated_at: "2026-02-10" },
  { id: "m5", user_id: MOCK_USER_ID, author_name: "Rajesh Kumar", title: "Sprint Planning Update - February 2026", subject: "Sprint Planning", content: "All team members expected to complete tasks by February 28th. Daily standups at 10 AM IST.", excerpt: "February sprint updates.", department: "Engineering", priority: "medium", status: "published", views: 34, recipients: ["Engineering Team", "Amit Patel", "Neha Gupta"], attachment_url: null, reviewer_notes: null, published_at: "2026-02-16", created_at: "2026-02-15", updated_at: "2026-02-16" },
];

export const mockMemoStats: MemoStats = { total: 5, published: 4, drafts: 1, pending: 0 };

export const mockPayrollRecords: PayrollRecord[] = [
  { id: "pr1", user_id: MOCK_USER_ID, profile_id: "e2", pay_period: "2026-01", basic_salary: 75000, hra: 30000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 9000, tax_deduction: 8000, other_deductions: 1500, net_pay: 96500, status: "processed", processed_at: "2026-02-01", notes: null, created_at: "2026-02-01", updated_at: "2026-02-01", profiles: { full_name: "Amit Patel", email: "amit.patel@grx10.com", department: "Engineering", job_title: "Tech Lead" } },
  { id: "pr2", user_id: MOCK_USER_ID, profile_id: "e3", pay_period: "2026-01", basic_salary: 65000, hra: 26000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 7800, tax_deduction: 6500, other_deductions: 1200, net_pay: 85500, status: "processed", processed_at: "2026-02-01", notes: null, created_at: "2026-02-01", updated_at: "2026-02-01", profiles: { full_name: "Neha Gupta", email: "neha.gupta@grx10.com", department: "Engineering", job_title: "Frontend Developer" } },
  { id: "pr3", user_id: MOCK_USER_ID, profile_id: "e4", pay_period: "2026-01", basic_salary: 60000, hra: 24000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 7200, tax_deduction: 6000, other_deductions: 1000, net_pay: 79800, status: "processed", processed_at: "2026-02-01", notes: null, created_at: "2026-02-01", updated_at: "2026-02-01", profiles: { full_name: "Ananya Reddy", email: "ananya.reddy@grx10.com", department: "HR", job_title: "HR Manager" } },
  { id: "pr4", user_id: MOCK_USER_ID, profile_id: "e5", pay_period: "2026-01", basic_salary: 65000, hra: 26000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 7800, tax_deduction: 6500, other_deductions: 1200, net_pay: 85500, status: "processed", processed_at: "2026-02-01", notes: null, created_at: "2026-02-01", updated_at: "2026-02-01", profiles: { full_name: "Suresh Iyer", email: "suresh.iyer@grx10.com", department: "Finance", job_title: "Finance Manager" } },
  { id: "pr5", user_id: MOCK_USER_ID, profile_id: "e6", pay_period: "2026-01", basic_salary: 70000, hra: 28000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 8400, tax_deduction: 7000, other_deductions: 1300, net_pay: 91300, status: "processed", processed_at: "2026-02-01", notes: null, created_at: "2026-02-01", updated_at: "2026-02-01", profiles: { full_name: "Rahul Mehta", email: "rahul.mehta@grx10.com", department: "Sales", job_title: "Sales Director" } },
  { id: "pr6", user_id: MOCK_USER_ID, profile_id: "e2", pay_period: "2026-02", basic_salary: 75000, hra: 30000, transport_allowance: 5000, other_allowances: 5000, pf_deduction: 9000, tax_deduction: 8000, other_deductions: 1500, net_pay: 96500, status: "draft", processed_at: null, notes: null, created_at: "2026-02-15", updated_at: "2026-02-15", profiles: { full_name: "Amit Patel", email: "amit.patel@grx10.com", department: "Engineering", job_title: "Tech Lead" } },
];

export const mockAttendanceRecords: AttendanceRecord[] = [
  { id: "a1", user_id: MOCK_USER_ID, profile_id: "e2", date: "2026-02-17", check_in: "2026-02-17T09:00:00", check_out: null, status: "present", notes: "Currently working", created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Amit Patel", department: "Engineering" } },
  { id: "a2", user_id: MOCK_USER_ID, profile_id: "e3", date: "2026-02-17", check_in: "2026-02-17T08:45:00", check_out: null, status: "present", notes: null, created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Neha Gupta", department: "Engineering" } },
  { id: "a3", user_id: MOCK_USER_ID, profile_id: "e4", date: "2026-02-17", check_in: "2026-02-17T09:10:00", check_out: null, status: "present", notes: null, created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Ananya Reddy", department: "HR" } },
  { id: "a4", user_id: MOCK_USER_ID, profile_id: "e5", date: "2026-02-17", check_in: "2026-02-17T10:30:00", check_out: null, status: "late", notes: "Traffic delay", created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Suresh Iyer", department: "Finance" } },
  { id: "a5", user_id: MOCK_USER_ID, profile_id: "e6", date: "2026-02-17", check_in: null, check_out: null, status: "absent", notes: "Personal leave", created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Rahul Mehta", department: "Sales" } },
  { id: "a6", user_id: MOCK_USER_ID, profile_id: "e7", date: "2026-02-17", check_in: "2026-02-17T09:05:00", check_out: null, status: "present", notes: null, created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Meera Krishnan", department: "Product" } },
  { id: "a7", user_id: MOCK_USER_ID, profile_id: "e8", date: "2026-02-17", check_in: "2026-02-17T08:50:00", check_out: null, status: "present", notes: null, created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Vikram Singh", department: "Engineering" } },
  { id: "a8", user_id: MOCK_USER_ID, profile_id: "e9", date: "2026-02-17", check_in: "2026-02-17T09:15:00", check_out: null, status: "present", notes: null, created_at: "2026-02-17", updated_at: "2026-02-17", profiles: { full_name: "Pooja Sharma", department: "Marketing" } },
];

export const mockAttendanceStats: AttendanceStats = { present: 6, absent: 1, late: 1, leave: 0, total: 8 };

export const mockLeaveRequests: LeaveRequest[] = [
  { id: "lr1", user_id: MOCK_USER_ID, profile_id: "e2", leave_type: "casual", from_date: "2026-02-20", to_date: "2026-02-21", days: 2, reason: "Family event", status: "pending", reviewed_by: null, reviewed_at: null, created_at: "2026-02-14", updated_at: "2026-02-14", profiles: { full_name: "Amit Patel", department: "Engineering" } },
  { id: "lr2", user_id: MOCK_USER_ID, profile_id: "e3", leave_type: "sick", from_date: "2026-02-10", to_date: "2026-02-11", days: 2, reason: "Fever", status: "approved", reviewed_by: "e4", reviewed_at: "2026-02-10", created_at: "2026-02-09", updated_at: "2026-02-10", profiles: { full_name: "Neha Gupta", department: "Engineering" } },
  { id: "lr3", user_id: MOCK_USER_ID, profile_id: "e5", leave_type: "earned", from_date: "2026-03-01", to_date: "2026-03-05", days: 5, reason: "Vacation", status: "pending", reviewed_by: null, reviewed_at: null, created_at: "2026-02-12", updated_at: "2026-02-12", profiles: { full_name: "Suresh Iyer", department: "Finance" } },
  { id: "lr4", user_id: MOCK_USER_ID, profile_id: "e6", leave_type: "casual", from_date: "2026-02-14", to_date: "2026-02-14", days: 1, reason: "Personal work", status: "approved", reviewed_by: "e4", reviewed_at: "2026-02-13", created_at: "2026-02-12", updated_at: "2026-02-13", profiles: { full_name: "Rahul Mehta", department: "Sales" } },
  { id: "lr5", user_id: MOCK_USER_ID, profile_id: "e9", leave_type: "earned", from_date: "2026-03-15", to_date: "2026-03-20", days: 6, reason: "Travel plans", status: "pending", reviewed_by: null, reviewed_at: null, created_at: "2026-02-15", updated_at: "2026-02-15", profiles: { full_name: "Pooja Sharma", department: "Marketing" } },
];

export const mockLeaveBalances: LeaveBalance[] = [
  { id: "lb1", user_id: MOCK_USER_ID, profile_id: "e1", leave_type: "casual", total_days: 12, used_days: 3, year: 2026 },
  { id: "lb2", user_id: MOCK_USER_ID, profile_id: "e1", leave_type: "sick", total_days: 10, used_days: 2, year: 2026 },
  { id: "lb3", user_id: MOCK_USER_ID, profile_id: "e1", leave_type: "earned", total_days: 15, used_days: 6, year: 2026 },
];

export const mockHolidays: Holiday[] = [
  { id: "h1", name: "Republic Day", date: "2026-01-26", year: 2026 },
  { id: "h2", name: "Holi", date: "2026-03-17", year: 2026 },
  { id: "h3", name: "Good Friday", date: "2026-04-03", year: 2026 },
  { id: "h4", name: "Independence Day", date: "2026-08-15", year: 2026 },
  { id: "h5", name: "Gandhi Jayanti", date: "2026-10-02", year: 2026 },
  { id: "h6", name: "Diwali", date: "2026-10-20", year: 2026 },
  { id: "h7", name: "Christmas", date: "2026-12-25", year: 2026 },
];

export const mockBankAccounts: BankAccount[] = [
  { id: "ba1", user_id: MOCK_USER_ID, name: "Operating Account", account_type: "Current", account_number: "XXXX-4521", balance: 485000, bank_name: "HDFC Bank", status: "Active", created_at: "2023-01-01", updated_at: "2026-02-17" },
  { id: "ba2", user_id: MOCK_USER_ID, name: "Business Savings", account_type: "Savings", account_number: "XXXX-7832", balance: 250000, bank_name: "ICICI Bank", status: "Active", created_at: "2023-01-01", updated_at: "2026-02-17" },
  { id: "ba3", user_id: MOCK_USER_ID, name: "Fixed Deposit", account_type: "FD", account_number: "XXXX-9901", balance: 500000, bank_name: "SBI", status: "Active", created_at: "2023-06-01", updated_at: "2026-02-17" },
  { id: "ba4", user_id: MOCK_USER_ID, name: "Payroll Account", account_type: "Current", account_number: "XXXX-3345", balance: 45200, bank_name: "HDFC Bank", status: "Active", created_at: "2023-01-01", updated_at: "2026-02-17" },
  { id: "ba5", user_id: MOCK_USER_ID, name: "Business Credit Line", account_type: "Credit", account_number: "XXXX-6678", balance: -15000, bank_name: "Axis Bank", status: "Active", created_at: "2024-01-01", updated_at: "2026-02-17" },
];

export const mockBankTransactions: BankTransaction[] = [
  { id: "bt1", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "credit", amount: 250000, description: "TCS Invoice Payment", category: "Revenue", transaction_date: "2026-02-15", reference: "INV-001", created_at: "2026-02-15" },
  { id: "bt2", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "debit", amount: 85000, description: "Office Rent Payment", category: "Rent", transaction_date: "2026-02-01", reference: "RENT-FEB", created_at: "2026-02-01" },
  { id: "bt3", user_id: MOCK_USER_ID, account_id: "ba4", transaction_type: "debit", amount: 450000, description: "January Payroll", category: "Salaries", transaction_date: "2026-02-01", reference: "PAY-JAN", created_at: "2026-02-01" },
  { id: "bt4", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "credit", amount: 180000, description: "Infosys Payment", category: "Revenue", transaction_date: "2026-01-28", reference: "INV-002", created_at: "2026-01-28" },
  { id: "bt5", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "debit", amount: 25000, description: "AWS Cloud Services", category: "Software", transaction_date: "2026-01-25", reference: "AWS-JAN", created_at: "2026-01-25" },
  { id: "bt6", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "credit", amount: 320000, description: "Wipro Project Payment", category: "Revenue", transaction_date: "2026-01-20", reference: "INV-003", created_at: "2026-01-20" },
  { id: "bt7", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "debit", amount: 12000, description: "Internet & Phone Bills", category: "Utilities", transaction_date: "2026-01-18", reference: "UTIL-JAN", created_at: "2026-01-18" },
  { id: "bt8", user_id: MOCK_USER_ID, account_id: "ba1", transaction_type: "debit", amount: 35000, description: "Marketing Campaign", category: "Marketing", transaction_date: "2026-01-15", reference: "MKT-JAN", created_at: "2026-01-15" },
];

export const mockScheduledPayments: ScheduledPayment[] = [
  { id: "sp1", user_id: MOCK_USER_ID, name: "Office Rent", amount: 85000, due_date: "2026-03-01", payment_type: "outflow", status: "scheduled", category: "Rent", recurring: true, recurrence_interval: "monthly", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "sp2", user_id: MOCK_USER_ID, name: "AWS Subscription", amount: 25000, due_date: "2026-02-25", payment_type: "outflow", status: "scheduled", category: "Software", recurring: true, recurrence_interval: "monthly", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "sp3", user_id: MOCK_USER_ID, name: "Wipro Milestone 2", amount: 320000, due_date: "2026-03-15", payment_type: "inflow", status: "scheduled", category: "Revenue", recurring: false, recurrence_interval: null, created_at: "2026-02-10", updated_at: "2026-02-10" },
  { id: "sp4", user_id: MOCK_USER_ID, name: "Insurance Premium", amount: 45000, due_date: "2026-03-20", payment_type: "outflow", status: "scheduled", category: "Insurance", recurring: true, recurrence_interval: "quarterly", created_at: "2026-01-01", updated_at: "2026-01-01" },
  { id: "sp5", user_id: MOCK_USER_ID, name: "HCL Invoice Payment", amount: 145000, due_date: "2026-02-28", payment_type: "inflow", status: "pending", category: "Revenue", recurring: false, recurrence_interval: null, created_at: "2026-01-15", updated_at: "2026-01-15" },
];
