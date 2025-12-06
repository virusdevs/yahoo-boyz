import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  decimal,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table - Update OTP preference default to "sms"
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  role: text("role").notNull().default("user"), // user, admin, superadmin
  profilePicture: text("profile_picture"),
  otpPreference: text("otp_preference").notNull().default("sms"), // email or sms, default to sms
  isVerified: boolean("is_verified").notNull().default(false),
  totalContributions: decimal("total_contributions", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0.00"),
  totalSavings: decimal("total_savings", { precision: 15, scale: 2 })
    .notNull()
    .default("0.00"),
  totalLoans: decimal("total_loans", { precision: 15, scale: 2 })
    .notNull()
    .default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// OTP codes table
export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // signup, reset, resend
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Contributions table
export const contributions = pgTable("contributions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
  mpesaReceiptNumber: text("mpesa_receipt_number"),
  mpesaCheckoutId: text("mpesa_checkout_id"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
  nextContributionTime: timestamp("next_contribution_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Savings table (NEW)
export const savings = pgTable("savings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  mpesaReceiptNumber: text("mpesa_receipt_number"),
  mpesaCheckoutId: text("mpesa_checkout_id"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Missed contributions / Penalties table
export const missedContributions = pgTable("missed_contributions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  missedDate: timestamp("missed_date").notNull(),
  penaltyAmount: decimal("penalty_amount", {
    precision: 10,
    scale: 2,
  }).notNull(),
  consecutiveMisses: integer("consecutive_misses").notNull().default(1),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Loans table
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("10.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected, paid, overdue
  rejectionReason: text("rejection_reason"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  dueDate: timestamp("due_date"),
  loanUsage: text("loan_usage"), // New field for loan usage reason
  isOverdue: boolean("is_overdue").default(false),
  overdueDays: integer("overdue_days").default(0),
  overduePenalty: decimal("overdue_penalty", {
    precision: 10,
    scale: 2,
  }).default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Loan repayments table
export const loanRepayments = pgTable("loan_repayments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id")
    .notNull()
    .references(() => loans.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  mpesaReceiptNumber: text("mpesa_receipt_number"),
  mpesaCheckoutId: text("mpesa_checkout_id"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Contact messages table
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  adminReply: text("admin_reply"),
  repliedBy: integer("replied_by").references(() => users.id),
  repliedAt: timestamp("replied_at"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  contributions: many(contributions),
  savings: many(savings),
  loans: many(loans),
  loanRepayments: many(loanRepayments),
  contactMessages: many(contactMessages),
  missedContributions: many(missedContributions),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  user: one(users, {
    fields: [contributions.userId],
    references: [users.id],
  }),
}));

export const savingsRelations = relations(savings, ({ one }) => ({
  user: one(users, {
    fields: [savings.userId],
    references: [users.id],
  }),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  user: one(users, {
    fields: [loans.userId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [loans.approvedBy],
    references: [users.id],
  }),
  repayments: many(loanRepayments),
}));

export const loanRepaymentsRelations = relations(loanRepayments, ({ one }) => ({
  loan: one(loans, {
    fields: [loanRepayments.loanId],
    references: [loans.id],
  }),
  user: one(users, {
    fields: [loanRepayments.userId],
    references: [users.id],
  }),
}));

export const contactMessagesRelations = relations(
  contactMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [contactMessages.userId],
      references: [users.id],
    }),
    replier: one(users, {
      fields: [contactMessages.repliedBy],
      references: [users.id],
    }),
  }),
);

export const missedContributionsRelations = relations(
  missedContributions,
  ({ one }) => ({
    user: one(users, {
      fields: [missedContributions.userId],
      references: [users.id],
    }),
  }),
);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertOtpCodeSchema = createInsertSchema(otpCodes).omit({
  id: true,
  createdAt: true,
});

export const insertContributionSchema = createInsertSchema(contributions).omit({
  id: true,
  createdAt: true,
});

export const insertSavingsSchema = createInsertSchema(savings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMissedContributionSchema = createInsertSchema(
  missedContributions,
).omit({
  id: true,
  createdAt: true,
});

export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  approvedBy: true,
  rejectionReason: true,
  amountPaid: true,
  isOverdue: true,
  overdueDays: true,
  overduePenalty: true,
});

export const insertLoanRepaymentSchema = createInsertSchema(
  loanRepayments,
).omit({
  id: true,
  createdAt: true,
});

export const insertContactMessageSchema = createInsertSchema(
  contactMessages,
).omit({
  id: true,
  createdAt: true,
  adminReply: true,
  repliedBy: true,
  repliedAt: true,
  isRead: true,
});

// Validation schemas for frontend
export const signupSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  otpPreference: z.enum(["email", "sms"]).default("sms"),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be 6 digits"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export const loanApplicationSchema = z.object({
  amount: z
    .number()
    .min(100, "Minimum loan amount is Ksh 100")
    .max(100000, "Maximum loan amount is Ksh 100,000"),
  loanUsage: z.string().min(5, "Please specify the loan usage reason"),
});

export const savingsSchema = z.object({
  amount: z.number().min(1, "Amount must be at least Ksh 1"),
  description: z.string().optional(),
});

export const contactFormSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type Contribution = typeof contributions.$inferSelect;
export type InsertContribution = z.infer<typeof insertContributionSchema>;
export type Saving = typeof savings.$inferSelect;
export type InsertSaving = z.infer<typeof insertSavingsSchema>;
export type MissedContribution = typeof missedContributions.$inferSelect;
export type InsertMissedContribution = z.infer<
  typeof insertMissedContributionSchema
>;
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanRepayment = typeof loanRepayments.$inferSelect;
export type InsertLoanRepayment = z.infer<typeof insertLoanRepaymentSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
