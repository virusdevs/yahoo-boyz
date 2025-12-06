import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  loanApplicationSchema,
  contactFormSchema,
  savingsSchema,
  type User,
} from "@shared/schema";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET;

// API configuration
const EMAIL_API_URL =
  process.env.EMAIL_API_URL;
const SMS_API_URL =
  process.env.SMS_API_URL;
const SMS_API_TOKEN = process.env.SMS_API_TOKEN;
const SMS_SENDER_ID = process.env.SMS_SENDER_ID;
const MPESA_API_URL =
  process.env.MPESA_API_URL;

// JWT middleware
interface AuthRequest extends Request {
  user?: User;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    storage
      .getUserById(decoded.userId)
      .then((user) => {
        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }
        req.user = user;
        next();
      })
      .catch(() => {
        return res.status(401).json({ message: "Invalid token" });
      });
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (
    !req.user ||
    (req.user.role !== "admin" && req.user.role !== "superadmin")
  ) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function superAdminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user || req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
}

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via email
async function sendEmailOTP(
  email: string,
  code: string,
  type: string,
): Promise<boolean> {
  try {
    // Map types to the correct endpoints
    const endpointMap: Record<string, string> = {
      signup: `${EMAIL_API_URL}/api/sendSignupCode`,
      reset: `${EMAIL_API_URL}/api/sendResetCode`,
      resend: `${EMAIL_API_URL}/api/sendResendCode`,
    };

    const endpoint = endpointMap[type] || `${EMAIL_API_URL}/api/sendSignupCode`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        username: email.split("@")[0],
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Email API error (${response.status}):`, errorText);
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
}

// Send OTP via SMS
async function sendSmsOTP(phone: string, code: string): Promise<boolean> {
  if (!SMS_API_TOKEN) {
    console.error("SMS API token not configured");
    return false;
  }

  try {
    // Format phone number
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith("254")) {
      formattedPhone = "254" + formattedPhone;
    }

    const response = await fetch(SMS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SMS_API_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: formattedPhone,
        sender_id: SMS_SENDER_ID,
        type: "plain",
        message: `Your YAHOO-BOYZ verification code is: ${code}. Valid for 10 minutes.`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SMS API error (${response.status}):`, errorText);
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error("SMS send error:", error);
    return false;
  }
}

// Send OTP with fallback logic
async function sendOTPWithFallback(
  email: string,
  phone: string,
  code: string,
  preferredMethod: "email" | "sms",
  type: "signup" | "reset" | "resend",
): Promise<{
  success: boolean;
  usedMethod: "email" | "sms" | "none";
  error?: string;
}> {
  let success = false;
  let usedMethod: "email" | "sms" | "none" = "none";
  let error = "";

  // Try preferred method first
  if (preferredMethod === "sms") {
    success = await sendSmsOTP(phone, code);
    if (success) {
      usedMethod = "sms";
      return { success, usedMethod };
    }
    error = "SMS service failed, trying email...";
    console.log(error);

    // Fallback to email
    success = await sendEmailOTP(email, code, type);
    if (success) {
      usedMethod = "email";
      return { success, usedMethod };
    }
    error = "Both SMS and email services failed";
  } else {
    // Preferred method is email
    success = await sendEmailOTP(email, code, type);
    if (success) {
      usedMethod = "email";
      return { success, usedMethod };
    }
    error = "Email service failed, trying SMS...";
    console.log(error);

    // Fallback to SMS
    success = await sendSmsOTP(phone, code);
    if (success) {
      usedMethod = "sms";
      return { success, usedMethod };
    }
    error = "Both email and SMS services failed";
  }

  return { success: false, usedMethod: "none", error };
}

// M-Pesa STK Push (keep as is)
async function initiateMpesaPayment(
  phone: string,
  amount: number,
  reference: string,
): Promise<{ success: boolean; checkoutRequestId?: string }> {
  try {
    // Format phone number
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith("254")) {
      formattedPhone = "254" + formattedPhone;
    }

    const response = await fetch(`${EMAIL_API_URL}/api/payVirusiMbayaV2.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumber: formattedPhone,
        amount: Math.round(amount),
        reference,
      }),
    });

    const data = await response.json();
    if (data.CheckoutRequestID) {
      return { success: true, checkoutRequestId: data.CheckoutRequestID };
    }
    return { success: false };
  } catch (error) {
    console.error("M-Pesa initiation failed:", error);
    return { success: false };
  }
}

// Function to check and update overdue loans
async function checkAndUpdateOverdueLoans() {
  try {
    const overdueLoans = await storage.getOverdueLoans();
    const now = new Date();

    for (const loan of overdueLoans) {
      if (loan.dueDate) {
        const dueDate = new Date(loan.dueDate);
        const daysOverdue = Math.floor(
          (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysOverdue > 0) {
          const remainingAmount =
            Number(loan.totalAmount) - Number(loan.amountPaid);
          const dailyPenaltyRate = 0.05; // 5% per day
          const penaltyAmount =
            remainingAmount * dailyPenaltyRate * daysOverdue;
          const newTotalAmount = Number(loan.totalAmount) + penaltyAmount;

          await storage.updateLoan(loan.id, {
            isOverdue: true,
            overdueDays: daysOverdue,
            overduePenalty: String(penaltyAmount),
            totalAmount: String(newTotalAmount),
            status: "overdue",
            updatedAt: new Date(),
          });
        }
      }
    }
  } catch (error) {
    console.error("Error updating overdue loans:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Check for overdue loans on server start
  setTimeout(() => {
    checkAndUpdateOverdueLoans();
    // Check every hour for overdue loans
    setInterval(checkAndUpdateOverdueLoans, 60 * 60 * 1000);
  }, 5000);

  // ========== AUTH ROUTES ==========

  // Signup
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const validatedData = signupSchema.parse(req.body);

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      // Check if this is the first user (make them superadmin)
      const userCount = await storage.getUserCount();
      const role = userCount === 0 ? "superadmin" : "user";

      // Create user
      const user = await storage.createUser({
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name,
        phone: validatedData.phone,
        otpPreference: validatedData.otpPreference,
        role,
        isVerified: false,
        totalContributions: "0.00",
        totalSavings: "0.00",
        totalLoans: "0.00",
      });

      // Generate OTP
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Send OTP with fallback
      const otpResult = await sendOTPWithFallback(
        validatedData.email,
        validatedData.phone,
        otpCode,
        validatedData.otpPreference,
        "signup",
      );

      if (!otpResult.success) {
        await storage.deleteUser(user.id);
        return res.status(500).json({
          message: "Failed to send verification code. Please try again later.",
        });
      }

      // Only save OTP to database after successful sending
      await storage.deleteOtpCodes(validatedData.email, "signup");
      await storage.createOtpCode({
        email: validatedData.email,
        code: otpCode,
        type: "signup",
        expiresAt,
      });

      res.status(201).json({
        message: "Account created. Please verify with the code sent to you.",
        methodUsed: otpResult.usedMethod,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(400).json({ message: error.message || "Signup failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(
        validatedData.password,
        user.password,
      );
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isVerified) {
        // Resend OTP
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Send OTP with fallback
        const otpResult = await sendOTPWithFallback(
          user.email,
          user.phone,
          otpCode,
          user.otpPreference as "email" | "sms",
          "resend",
        );

        if (!otpResult.success) {
          return res.status(500).json({
            message:
              "Failed to resend verification code. Please try again later.",
          });
        }

        // Only save OTP after successful sending
        await storage.deleteOtpCodes(user.email, "signup");
        await storage.createOtpCode({
          email: user.email,
          code: otpCode,
          type: "signup",
          expiresAt,
        });

        return res.json({
          requiresVerification: true,
          message: "Please verify your account",
          methodUsed: otpResult.usedMethod,
        });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "5d",
      });
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  // Verify OTP
  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const { email, code } = verifyOtpSchema.parse(req.body);

      const otpRecord = await storage.getOtpCode(email, code, "signup");
      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      if (new Date() > otpRecord.expiresAt) {
        return res
          .status(400)
          .json({ message: "Code has expired. Please request a new one." });
      }

      // Update user as verified
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.updateUser(user.id, { isVerified: true });
      await storage.deleteOtpCodes(email, "signup");

      res.json({ message: "Account verified successfully" });
    } catch (error: any) {
      console.error("Verify error:", error);
      res.status(400).json({ message: error.message || "Verification failed" });
    }
  });

  // Resend code
  app.post("/api/auth/resend-code", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Send OTP with fallback
      const otpResult = await sendOTPWithFallback(
        user.email,
        user.phone,
        otpCode,
        user.otpPreference as "email" | "sms",
        "resend",
      );

      if (!otpResult.success) {
        return res.status(500).json({
          message:
            "Failed to resend verification code. Please try again later.",
        });
      }

      // Only save OTP after successful sending
      await storage.deleteOtpCodes(email, "signup");
      await storage.createOtpCode({
        email,
        code: otpCode,
        type: "signup",
        expiresAt,
      });

      res.json({
        message: "Code resent successfully",
        methodUsed: otpResult.usedMethod,
      });
    } catch (error: any) {
      res
        .status(400)
        .json({ message: error.message || "Failed to resend code" });
    }
  });

  // Forgot password - Default to SMS first, with email fallback
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return res.json({
          message: "If the email exists, a reset code has been sent",
        });
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Send OTP with fallback - Default to SMS first for forgot password
      const otpResult = await sendOTPWithFallback(
        user.email,
        user.phone,
        otpCode,
        "sms", // Default to SMS for forgot password
        "reset",
      );

      if (!otpResult.success) {
        return res.status(500).json({
          message: "Failed to send reset code. Please try again later.",
        });
      }

      // Only save OTP after successful sending
      await storage.deleteOtpCodes(email, "reset");
      await storage.createOtpCode({
        email,
        code: otpCode,
        type: "reset",
        expiresAt,
      });

      res.json({
        message: "Reset code sent",
        methodUsed: otpResult.usedMethod,
      });
    } catch (error: any) {
      res
        .status(400)
        .json({ message: error.message || "Failed to send reset code" });
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = resetPasswordSchema.parse(req.body);

      const otpRecord = await storage.getOtpCode(email, code, "reset");
      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid reset code" });
      }

      if (new Date() > otpRecord.expiresAt) {
        return res
          .status(400)
          .json({ message: "Code has expired. Please request a new one." });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });
      await storage.deleteOtpCodes(email, "reset");

      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      res
        .status(400)
        .json({ message: error.message || "Failed to reset password" });
    }
  });

  // ========== USER ROUTES ==========

  // Get current user
  app.get("/api/user/me", authMiddleware, (req: AuthRequest, res: Response) => {
    const { password, ...userWithoutPassword } = req.user!;
    res.json(userWithoutPassword);
  });

  // Update profile
  app.patch(
    "/api/user/profile",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { name, phone } = req.body;
        const updatedUser = await storage.updateUser(req.user!.id, {
          name,
          phone,
        });
        const { password, ...userWithoutPassword } = updatedUser;
        res.json({ user: userWithoutPassword });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update profile" });
      }
    },
  );

  // Update password
  app.patch(
    "/api/user/password",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { currentPassword, newPassword } = req.body;

        const isValidPassword = await bcrypt.compare(
          currentPassword,
          req.user!.password,
        );
        if (!isValidPassword) {
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(req.user!.id, { password: hashedPassword });
        res.json({ message: "Password updated successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update password" });
      }
    },
  );

  // Update profile picture
  app.patch(
    "/api/user/picture",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { picture } = req.body;
        const updatedUser = await storage.updateUser(req.user!.id, {
          profilePicture: picture,
        });
        const { password, ...userWithoutPassword } = updatedUser;
        res.json({ user: userWithoutPassword });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update picture" });
      }
    },
  );

  // ========== DASHBOARD ROUTES ==========
  /*
  app.get(
    "/api/dashboard/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const userTotal = await storage.getUserTotalContributions(userId);
        const userTotalSavings = await storage.getUserTotalSavings(userId);
        const userTotalLoans = await storage.getUserTotalLoans(userId);
        const groupTotal = await storage.getTotalContributions();
        const groupTotalSavings = await storage.getTotalSavings();
        const groupTotalLoans = await storage.getTotalLoansAmount();
        const loans = await storage.getLoansByUserId(userId);
        const activeLoans = loans.filter((l) => l.status === "approved").length;
        const missedContributions =
          await storage.getUnpaidMissedContributions(userId);

        res.json({
          userTotal,
          userTotalSavings,
          userTotalLoans,
          groupTotal,
          groupTotalSavings,
          groupTotalLoans,
          activeLoans,
          pendingContributions: 0,
          missedContributions,
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get stats" });
      }
    },
  );*/
  // In your routes.ts, ensure proper number conversion:
  app.get(
    "/api/dashboard/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const userTotal = await storage.getUserTotalContributions(userId);
        const userTotalSavings = await storage.getUserTotalSavings(userId);
        const userTotalLoans = await storage.getUserTotalLoans(userId);
        const groupTotal = await storage.getTotalContributions();
        const groupTotalSavings = await storage.getTotalSavings();
        const groupTotalLoans = await storage.getTotalLoansAmount();
        const loans = await storage.getLoansByUserId(userId);
        const activeLoans = loans.filter((l) => l.status === "approved").length;
        const missedContributions =
          await storage.getUnpaidMissedContributions(userId);

        // Ensure all values are numbers
        res.json({
          userTotal: Number(userTotal) || 0,
          userTotalSavings: Number(userTotalSavings) || 0,
          userTotalLoans: Number(userTotalLoans) || 0,
          groupTotal: Number(groupTotal) || 0,
          groupTotalSavings: Number(groupTotalSavings) || 0,
          groupTotalLoans: Number(groupTotalLoans) || 0,
          activeLoans,
          pendingContributions: 0,
          missedContributions,
        });
      } catch (error: any) {
        console.error("Dashboard stats error:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to get stats" });
      }
    },
  );

  // ========== SAVINGS ROUTES ==========

  // Get user savings with pagination
  app.get(
    "/api/savings/user",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 15;
        const offset = (page - 1) * limit;

        const savings = await storage.getSavingsByUserId(
          req.user!.id,
          limit,
          offset,
        );
        const total = await storage.getTotalSavingsCount(req.user!.id);

        res.json({
          savings,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get savings" });
      }
    },
  );

  // Get savings stats
  app.get(
    "/api/savings/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const userTotal = await storage.getUserTotalSavings(userId);
        const groupTotal = await storage.getTotalSavings();
        const recentSavings = await storage.getRecentSavings(userId, 5);

        res.json({
          userTotal,
          groupTotal,
          recentSavings,
          totalCount: await storage.getTotalSavingsCount(userId),
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get savings stats" });
      }
    },
  );

  // Make savings
  app.post(
    "/api/savings/make",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount, description, phone } = req.body;
        const phoneNumber = phone || req.user!.phone;

        if (!phoneNumber) {
          return res.status(400).json({
            message: "Phone number is required",
            success: false,
          });
        }

        if (!amount || amount <= 0) {
          return res.status(400).json({
            message: "Valid amount is required",
            success: false,
          });
        }

        // Create pending saving
        const saving = await storage.createSaving({
          userId: req.user!.id,
          amount: String(amount),
          description,
          status: "pending",
        });

        // Format phone number
        let formattedPhone = String(phoneNumber).trim();
        formattedPhone = formattedPhone.replace(/[^\d+]/g, "");
        formattedPhone = formattedPhone.replace(/\+/g, "");

        if (formattedPhone.startsWith("0")) {
          formattedPhone = "254" + formattedPhone.substring(1);
        } else if (
          formattedPhone.startsWith("7") &&
          formattedPhone.length === 9
        ) {
          formattedPhone = "254" + formattedPhone;
        } else if (!formattedPhone.startsWith("254")) {
          formattedPhone = "254" + formattedPhone;
        }

        const amountNum = parseFloat(String(amount));
        const roundedAmount = Math.ceil(amountNum);

        // Call M-Pesa API
        const mpesaResponse = await fetch(
          `${MPESA_API_URL}/api/payVirusiMbayaV2.php`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              phoneNumber: formattedPhone,
              amount: roundedAmount.toString(),
              reference: `SAVE-${saving.id}`,
            }),
          },
        );

        const resultText = await mpesaResponse.text();
        let result;
        try {
          result = JSON.parse(resultText);
        } catch (parseError) {
          console.error("Failed to parse M-Pesa response:", parseError);
          await storage.updateSaving(saving.id, {
            status: "failed",
          });
          return res.status(502).json({
            success: false,
            message: "Invalid response from M-Pesa API",
          });
        }

        if (result.success && result.CheckoutRequestID) {
          await storage.updateSaving(saving.id, {
            mpesaCheckoutId: result.CheckoutRequestID,
          });

          // Start polling for payment status
          setTimeout(() => {
            checkSavingsPaymentStatus(result.CheckoutRequestID, saving.id);
          }, 10000);

          return res.json({
            success: true,
            checkoutRequestId: result.CheckoutRequestID,
            savingId: saving.id,
            message:
              "Savings initiated successfully. Check your phone for M-Pesa prompt.",
          });
        } else {
          await storage.updateSaving(saving.id, {
            status: "failed",
          });
          return res.json({
            success: false,
            message: result.message || "Failed to initiate M-Pesa payment",
          });
        }
      } catch (error: any) {
        console.error("Savings initiation error:", error);
        res.status(500).json({
          success: false,
          message: error.message || "Failed to initiate savings",
        });
      }
    },
  );

  // Update savings
  app.patch(
    "/api/savings/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const savingId = parseInt(req.params.id);
        const { amount, description } = req.body;

        const saving = await storage.getSavingById(savingId);
        if (!saving || saving.userId !== req.user!.id) {
          return res.status(404).json({ message: "Savings not found" });
        }

        if (saving.status !== "completed") {
          return res
            .status(400)
            .json({ message: "Only completed savings can be edited" });
        }

        const oldAmount = Number(saving.amount);
        const newAmount = amount ? Number(amount) : oldAmount;

        // Update saving
        await storage.updateSaving(savingId, {
          amount: String(newAmount),
          description,
          updatedAt: new Date(),
        });

        // Update user's total savings
        const user = await storage.getUserById(req.user!.id);
        if (user) {
          const newTotalSavings =
            Number(user.totalSavings) - oldAmount + newAmount;
          await storage.updateUser(req.user!.id, {
            totalSavings: String(newTotalSavings),
          });
        }

        res.json({ message: "Savings updated successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update savings" });
      }
    },
  );

  // Delete savings
  app.delete(
    "/api/savings/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const savingId = parseInt(req.params.id);

        const saving = await storage.getSavingById(savingId);
        if (!saving || saving.userId !== req.user!.id) {
          return res.status(404).json({ message: "Savings not found" });
        }

        if (saving.status !== "completed") {
          return res
            .status(400)
            .json({ message: "Only completed savings can be deleted" });
        }

        // Update user's total savings
        const user = await storage.getUserById(req.user!.id);
        if (user) {
          const newTotalSavings =
            Number(user.totalSavings) - Number(saving.amount);
          await storage.updateUser(req.user!.id, {
            totalSavings: String(Math.max(0, newTotalSavings)),
          });
        }

        // Delete saving
        await storage.deleteSaving(savingId);

        res.json({ message: "Savings deleted successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to delete savings" });
      }
    },
  );

  // Function to check savings payment status
  async function checkSavingsPaymentStatus(
    checkoutRequestId: string,
    savingId: number,
  ) {
    try {
      const response = await fetch(
        `${MPESA_API_URL}/api/verify-transaction.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutRequestId,
          }),
        },
      );

      const mpesaResult = await response.json();

      if (mpesaResult.success === true && mpesaResult.status === "completed") {
        const mpesaData = mpesaResult.data;

        if (mpesaData?.ResultCode === 0 && mpesaData?.MpesaReceiptNumber) {
          await storage.updateSaving(savingId, {
            status: "completed",
            mpesaReceiptNumber: mpesaData.MpesaReceiptNumber,
          });

          // Update user's total savings
          const saving = await storage.getSavingById(savingId);
          if (saving) {
            const user = await storage.getUserById(saving.userId);
            if (user) {
              const newTotalSavings =
                Number(user.totalSavings) + Number(saving.amount);
              await storage.updateUser(saving.userId, {
                totalSavings: String(newTotalSavings),
              });
            }
          }
        }
      } else if (
        mpesaResult.success === false &&
        mpesaResult.status === "pending"
      ) {
        // Payment still pending, check again in 10 seconds
        setTimeout(() => {
          checkSavingsPaymentStatus(checkoutRequestId, savingId);
        }, 10000);
      } else {
        await storage.updateSaving(savingId, {
          status: "failed",
        });
      }
    } catch (error) {
      console.error("Savings payment status check error:", error);
      setTimeout(() => {
        checkSavingsPaymentStatus(checkoutRequestId, savingId);
      }, 10000);
    }
  }

  // ========== CONTRIBUTION ROUTES ==========

  // Get user contributions with pagination
  app.get(
    "/api/contributions/user",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 15;
        const offset = (page - 1) * limit;

        const contributions = await storage.getContributionsByUserId(
          req.user!.id,
          limit,
          offset,
        );
        const total = await storage.getTotalContributionsCount(req.user!.id);

        res.json({
          contributions,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get contributions" });
      }
    },
  );

  app.get(
    "/api/contributions/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const userTotal = await storage.getUserTotalContributions(userId);
        const groupTotal = await storage.getTotalContributions();
        const contributions = await storage.getContributionsByUserId(userId);

        // Calculate this month's contributions
        const now = new Date();
        const thisMonth = contributions.filter((c) => {
          const date = new Date(c.createdAt);
          return (
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear() &&
            c.status === "completed"
          );
        });
        const thisMonthTotal = thisMonth.reduce(
          (sum, c) => sum + Number(c.amount),
          0,
        );

        const missedContributions =
          await storage.getUnpaidMissedContributions(userId);

        res.json({
          userTotal,
          groupTotal,
          thisMonth: thisMonthTotal,
          missedCount: missedContributions.length,
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get stats" });
      }
    },
  );

  app.get(
    "/api/contributions/missed",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const missed = await storage.getMissedContributionsByUserId(
          req.user!.id,
        );
        res.json(missed);
      } catch (error: any) {
        res.status(400).json({
          message: error.message || "Failed to get missed contributions",
        });
      }
    },
  );

  // ========== M-PESA CONFIGURATION ==========

  // M-Pesa STK Push with verification polling
  app.post(
    "/api/contributions/initiate",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount, phone } = req.body;
        const phoneNumber = phone || req.user!.phone;

        if (!phoneNumber) {
          return res.status(400).json({
            message: "Phone number is required",
            success: false,
          });
        }

        // Check if user can contribute (24 hours have passed)
        const lastContribution = await storage.getLastContribution(
          req.user!.id,
        );
        if (lastContribution?.nextContributionTime) {
          const nextTime = new Date(lastContribution.nextContributionTime);
          if (nextTime > new Date()) {
            return res.status(400).json({
              message: "You can only contribute once every 24 hours",
              success: false,
            });
          }
        }

        // Create pending contribution with next contribution time
        const nextContributionTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const contribution = await storage.createContribution({
          userId: req.user!.id,
          amount: String(amount || 20),
          date: new Date(),
          status: "pending",
          nextContributionTime,
        });

        console.log("Created contribution:", contribution.id);

        // Format phone number
        let formattedPhone = String(phoneNumber).trim();

        // Remove any non-digit characters first (except plus sign for now)
        formattedPhone = formattedPhone.replace(/[^\d+]/g, "");

        // Remove plus sign if present
        formattedPhone = formattedPhone.replace(/\+/g, "");

        // If phone starts with 0, convert to 254
        if (formattedPhone.startsWith("0")) {
          formattedPhone = "254" + formattedPhone.substring(1);
        }
        // If phone starts with 7 (Kenyan number without country code), add 254
        else if (
          formattedPhone.startsWith("7") &&
          formattedPhone.length === 9
        ) {
          formattedPhone = "254" + formattedPhone;
        }
        // Ensure it starts with 254
        else if (!formattedPhone.startsWith("254")) {
          formattedPhone = "254" + formattedPhone;
        }

        // Parse and validate amount
        const amountNum = parseFloat(String(amount || 20));
        if (isNaN(amountNum) || amountNum <= 0) {
          await storage.updateContribution(contribution.id, {
            status: "failed",
            errorMessage: "Invalid amount",
          });
          return res.status(400).json({
            message: "Invalid amount",
            success: false,
          });
        }

        // Round up to nearest whole number
        const roundedAmount = Math.ceil(amountNum);

        console.log("Calling M-Pesa API with:", {
          phoneNumber: formattedPhone,
          amount: roundedAmount,
          reference: `CONT-${contribution.id}`,
        });

        // Call M-Pesa API (using your preferred endpoint)
        const mpesaResponse = await fetch(
          `${MPESA_API_URL}/api/payVirusiMbayaV2.php`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              phoneNumber: formattedPhone,
              amount: roundedAmount.toString(),
              reference: `CONT-${contribution.id}`,
            }),
          },
        );

        console.log("M-Pesa API response status:", mpesaResponse.status);

        const resultText = await mpesaResponse.text();
        console.log("M-Pesa API raw response:", resultText);

        let result;
        try {
          result = JSON.parse(resultText);
        } catch (parseError) {
          console.error("Failed to parse M-Pesa response:", parseError);
          await storage.updateContribution(contribution.id, {
            status: "failed",
            errorMessage: "Invalid response from M-Pesa API",
          });
          return res.status(502).json({
            success: false,
            message: "Invalid response from M-Pesa API",
            rawResponse: resultText,
          });
        }

        console.log("M-Pesa API parsed response:", result);

        if (result.success && result.CheckoutRequestID) {
          await storage.updateContribution(contribution.id, {
            mpesaCheckoutId: result.CheckoutRequestID,
          });
          console.log(
            "Updated contribution with CheckoutRequestID:",
            result.CheckoutRequestID,
          );

          // Start polling for payment status
          setTimeout(() => {
            checkPaymentStatus(result.CheckoutRequestID);
          }, 10000); // First check after 10 seconds

          return res.json({
            success: true,
            checkoutRequestId: result.CheckoutRequestID,
            contributionId: contribution.id,
            message:
              "Payment initiated successfully. Check your phone for M-Pesa prompt.",
          });
        } else {
          await storage.updateContribution(contribution.id, {
            status: "failed",
            errorMessage: result.message || "Failed to initiate payment",
          });
          return res.json({
            success: false,
            message: result.message || "Failed to initiate M-Pesa payment",
          });
        }
      } catch (error: any) {
        console.error("M-Pesa initiation error:", error);
        res.status(500).json({
          success: false,
          message: error.message || "Failed to initiate contribution",
        });
      }
    },
  );

  // Function to check payment status (polling)
  async function checkPaymentStatus(checkoutRequestId: string) {
    try {
      console.log("Checking payment status for:", checkoutRequestId);

      const response = await fetch(
        `${MPESA_API_URL}/api/verify-transaction.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutRequestId,
          }),
        },
      );

      const mpesaResult = await response.json();
      console.log(
        "M-Pesa verification response:",
        JSON.stringify(mpesaResult, null, 2),
      );

      // Find contribution with this checkout ID
      const contribution =
        await storage.getContributionByCheckoutId(checkoutRequestId);
      if (!contribution) {
        console.log(
          "No contribution found for checkout ID:",
          checkoutRequestId,
        );
        return;
      }

      // Check if payment is successful
      if (mpesaResult.success === true && mpesaResult.status === "completed") {
        const mpesaData = mpesaResult.data;

        if (mpesaData?.ResultCode === 0 && mpesaData?.MpesaReceiptNumber) {
          await storage.updateContribution(contribution.id, {
            status: "completed",
            mpesaReceiptNumber: mpesaData.MpesaReceiptNumber,
          });
          console.log(
            `Contribution ${contribution.id} completed. Receipt: ${mpesaData.MpesaReceiptNumber}`,
          );

          // Update user's total contributions
          const user = await storage.getUserById(contribution.userId);
          if (user) {
            const newTotalContributions =
              Number(user.totalContributions) + Number(contribution.amount);
            await storage.updateUser(contribution.userId, {
              totalContributions: String(newTotalContributions),
            });
          }

          // Check for missed contributions to update
          const missedContributions =
            await storage.getMissedContributionsByUserId(contribution.userId);
          const latestMissed = missedContributions.find((m) => !m.isPaid);
          if (latestMissed) {
            await storage.updateMissedContribution(latestMissed.id, {
              isPaid: true,
            });
          }
        }
      } else if (
        mpesaResult.success === false &&
        mpesaResult.status === "pending"
      ) {
        // Payment still pending, check again in 2 seconds
        console.log(
          `Payment still pending for ${checkoutRequestId}, checking again in 10s...`,
        );
        setTimeout(() => checkPaymentStatus(checkoutRequestId), 2000);
      } else {
        // Payment failed
        await storage.updateContribution(contribution.id, {
          status: "failed",
          errorMessage: mpesaResult.data?.ResultDesc || "Payment failed",
        });
        console.log(`Contribution ${contribution.id} failed.`);
      }
    } catch (error) {
      console.error("Payment status check error:", error);
      // Try again in 2 seconds
      setTimeout(() => checkPaymentStatus(checkoutRequestId), 2000);
    }
  }

  // M-Pesa callback endpoint (for direct notifications from M-Pesa)
  app.post("/api/mpesa/callback", async (req: Request, res: Response) => {
    try {
      console.log(
        "M-Pesa callback received:",
        JSON.stringify(req.body, null, 2),
      );

      const { Body } = req.body;
      if (!Body?.stkCallback) {
        console.log("No stkCallback in request body");
        return res.status(200).json({ message: "OK" });
      }

      const callback = Body.stkCallback;
      const checkoutId = callback.CheckoutRequestID;
      const resultCode = callback.ResultCode;
      const resultDesc = callback.ResultDesc;

      console.log(
        `Processing callback for ${checkoutId}: ${resultCode} - ${resultDesc}`,
      );

      // Find contribution with this checkout ID
      const contribution =
        await storage.getContributionByCheckoutId(checkoutId);
      if (contribution) {
        if (resultCode === 0) {
          // Extract receipt number from callback metadata
          let receiptNumber = "";
          if (callback.CallbackMetadata?.Item) {
            const receiptItem = callback.CallbackMetadata.Item.find(
              (i: any) => i.Name === "MpesaReceiptNumber",
            );
            receiptNumber = receiptItem?.Value || "";
          }

          await storage.updateContribution(contribution.id, {
            status: "completed",
            mpesaReceiptNumber: receiptNumber,
          });

          // Update user's total contributions
          const user = await storage.getUserById(contribution.userId);
          if (user) {
            const newTotalContributions =
              Number(user.totalContributions) + Number(contribution.amount);
            await storage.updateUser(contribution.userId, {
              totalContributions: String(newTotalContributions),
            });
          }

          console.log(
            `Contribution ${contribution.id} completed via callback. Receipt: ${receiptNumber}`,
          );
        } else {
          await storage.updateContribution(contribution.id, {
            status: "failed",
            errorMessage: resultDesc,
          });
          console.log(
            `Contribution ${contribution.id} failed via callback: ${resultDesc}`,
          );
        }
      }

      // Check for savings
      const saving = await storage.getSavingByCheckoutId(checkoutId);
      if (saving) {
        if (resultCode === 0) {
          let receiptNumber = "";
          if (callback.CallbackMetadata?.Item) {
            const receiptItem = callback.CallbackMetadata.Item.find(
              (i: any) => i.Name === "MpesaReceiptNumber",
            );
            receiptNumber = receiptItem?.Value || "";
          }

          await storage.updateSaving(saving.id, {
            status: "completed",
            mpesaReceiptNumber: receiptNumber,
          });

          // Update user's total savings
          const user = await storage.getUserById(saving.userId);
          if (user) {
            const newTotalSavings =
              Number(user.totalSavings) + Number(saving.amount);
            await storage.updateUser(saving.userId, {
              totalSavings: String(newTotalSavings),
            });
          }
        } else {
          await storage.updateSaving(saving.id, {
            status: "failed",
            errorMessage: resultDesc,
          });
        }
      }

      // Check for loan repayment
      const repayment = await storage.getLoanRepaymentByCheckoutId(checkoutId);
      if (repayment) {
        if (resultCode === 0) {
          let receiptNumber = "";
          if (callback.CallbackMetadata?.Item) {
            const receiptItem = callback.CallbackMetadata.Item.find(
              (i: any) => i.Name === "MpesaReceiptNumber",
            );
            receiptNumber = receiptItem?.Value || "";
          }

          await storage.updateLoanRepayment(repayment.id, {
            status: "completed",
            mpesaReceiptNumber: receiptNumber,
          });

          // Update loan amount paid
          const loan = await storage.getLoanById(repayment.loanId);
          if (loan) {
            const newAmountPaid =
              Number(loan.amountPaid) + Number(repayment.amount);
            const status =
              newAmountPaid >= Number(loan.totalAmount) ? "paid" : "approved";
            await storage.updateLoan(loan.id, {
              amountPaid: String(newAmountPaid),
              status,
            });
          }
        } else {
          await storage.updateLoanRepayment(repayment.id, {
            status: "failed",
            errorMessage: resultDesc,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: "Callback processed successfully",
      });
    } catch (error) {
      console.error("M-Pesa callback error:", error);
      res.status(200).json({
        success: false,
        message: "Callback error",
        error: error.message,
      });
    }
  });

  // Endpoint for frontend to check payment status
  app.post(
    "/api/contributions/verify",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { checkoutRequestId } = req.body;

        console.log("Frontend verifying payment for:", checkoutRequestId);

        if (!checkoutRequestId) {
          return res.status(400).json({
            success: false,
            message: "Checkout request ID is required",
          });
        }

        const response = await fetch(
          `${MPESA_API_URL}/api/verify-transaction.php`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              checkoutRequestId,
            }),
          },
        );

        const mpesaResult = await response.json();
        console.log("Frontend verification response:", mpesaResult);

        // Find contribution with this checkout ID
        const contribution =
          await storage.getContributionByCheckoutId(checkoutRequestId);

        if (!contribution) {
          return res.json({
            success: false,
            status: "not_found",
            message: "Contribution not found",
          });
        }

        // If payment completed via callback, update response
        if (
          contribution.status === "completed" &&
          contribution.mpesaReceiptNumber
        ) {
          return res.json({
            success: true,
            status: "completed",
            data: {
              ResultCode: 0,
              ResultDesc: "The service request is processed successfully.",
              MpesaReceiptNumber: contribution.mpesaReceiptNumber,
            },
          });
        }

        // Return M-Pesa result as-is to frontend
        // Frontend will check mpesaResult.success and mpesaResult.status
        res.json(mpesaResult);
      } catch (error: any) {
        console.error("Payment verification error:", error);
        res.status(500).json({
          success: false,
          status: "error",
          data: {
            message: "Failed to verify payment",
            error: error.message,
          },
        });
      }
    },
  );

  // Also update the pay-penalty endpoint to use the same pattern
  app.post(
    "/api/contributions/pay-penalty",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { missedId, phone } = req.body;
        const missed = await storage.getMissedContributionsByUserId(
          req.user!.id,
        );
        const penalty = missed.find((m) => m.id === missedId);

        if (!penalty || penalty.isPaid) {
          return res.status(400).json({
            success: false,
            message: "Penalty not found or already paid",
          });
        }

        const phoneNumber = phone || req.user!.phone;

        if (!phoneNumber) {
          return res.status(400).json({
            success: false,
            message: "Phone number is required",
          });
        }

        // Format phone number (same as above)
        let formattedPhone = String(phoneNumber).trim();
        formattedPhone = formattedPhone.replace(/[^\d+]/g, "");
        formattedPhone = formattedPhone.replace(/\+/g, "");

        if (formattedPhone.startsWith("0")) {
          formattedPhone = "254" + formattedPhone.substring(1);
        } else if (
          formattedPhone.startsWith("7") &&
          formattedPhone.length === 9
        ) {
          formattedPhone = "254" + formattedPhone;
        } else if (!formattedPhone.startsWith("254")) {
          formattedPhone = "254" + formattedPhone;
        }

        const amountNum = Number(penalty.penaltyAmount);
        const roundedAmount = Math.ceil(amountNum);

        console.log("Calling M-Pesa API for penalty:", {
          phoneNumber: formattedPhone,
          amount: roundedAmount,
          reference: `PEN-${penalty.id}`,
        });

        const mpesaResponse = await fetch(
          `${MPESA_API_URL}/api/payVirusiMbayaV2.php`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              phoneNumber: formattedPhone,
              amount: roundedAmount.toString(),
              reference: `PEN-${penalty.id}`,
            }),
          },
        );

        const resultText = await mpesaResponse.text();
        let result;
        try {
          result = JSON.parse(resultText);
        } catch (parseError) {
          console.error("Failed to parse M-Pesa response:", parseError);
          return res.status(502).json({
            success: false,
            message: "Invalid response from M-Pesa API",
            rawResponse: resultText,
          });
        }

        if (result.success && result.CheckoutRequestID) {
          // Start polling for penalty payment
          setTimeout(() => {
            checkPenaltyPaymentStatus(result.CheckoutRequestID, penalty.id);
          }, 10000);

          res.json({
            success: true,
            checkoutRequestId: result.CheckoutRequestID,
            message:
              "Penalty payment initiated successfully. Check your phone for M-Pesa prompt.",
          });
        } else {
          res.json({
            success: false,
            message: result.message || "Failed to initiate M-Pesa payment",
          });
        }
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: error.message || "Failed to initiate penalty payment",
        });
      }
    },
  );

  // Function to check penalty payment status
  async function checkPenaltyPaymentStatus(
    checkoutRequestId: string,
    penaltyId: number,
  ) {
    try {
      console.log("Checking penalty payment status for:", checkoutRequestId);

      const response = await fetch(
        `${MPESA_API_URL}/api/verify-transaction.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutRequestId,
          }),
        },
      );

      const mpesaResult = await response.json();

      if (mpesaResult.success === true && mpesaResult.status === "completed") {
        const mpesaData = mpesaResult.data;

        if (mpesaData?.ResultCode === 0 && mpesaData?.MpesaReceiptNumber) {
          await storage.updateMissedContribution(penaltyId, {
            isPaid: true,
          });
          console.log(
            `Penalty ${penaltyId} paid successfully. Receipt: ${mpesaData.MpesaReceiptNumber}`,
          );
        }
      } else if (
        mpesaResult.success === false &&
        mpesaResult.status === "pending"
      ) {
        // Payment still pending, check again in 10 seconds
        console.log(`Penalty payment still pending, checking again in 10s...`);
        setTimeout(
          () => checkPenaltyPaymentStatus(checkoutRequestId, penaltyId),
          10000,
        );
      } else {
        console.log(`Penalty ${penaltyId} payment failed.`);
      }
    } catch (error) {
      console.error("Penalty payment status check error:", error);
      // Try again in 10 seconds
      setTimeout(
        () => checkPenaltyPaymentStatus(checkoutRequestId, penaltyId),
        10000,
      );
    }
  }

  // ========== LOAN ROUTES ==========

  app.get(
    "/api/loans/user",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loans = await storage.getLoansByUserId(req.user!.id);
        res.json(loans);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get loans" });
      }
    },
  );

  app.post(
    "/api/loans/apply",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const validatedData = loanApplicationSchema.parse(req.body);
        const { amount, loanUsage } = validatedData;

        // Check for existing pending loan
        const existingLoans = await storage.getLoansByUserId(req.user!.id);
        const hasPendingLoan = existingLoans.some(
          (l) => l.status === "pending",
        );
        if (hasPendingLoan) {
          return res
            .status(400)
            .json({ message: "You already have a pending loan application" });
        }

        // Calculate total with 10% interest
        const totalAmount = amount * 1.1;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days due date

        const loan = await storage.createLoan({
          userId: req.user!.id,
          amount: String(amount),
          interestRate: "10.00",
          totalAmount: String(totalAmount),
          status: "pending",
          dueDate,
          loanUsage,
        });

        res.json({ message: "Loan application submitted", loan });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to apply for loan" });
      }
    },
  );

  app.post(
    "/api/loans/repay",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { loanId, amount, phone } = req.body;

        const loan = await storage.getLoanById(loanId);
        if (!loan || loan.userId !== req.user!.id) {
          return res.status(404).json({ message: "Loan not found" });
        }

        if (loan.status !== "approved" && loan.status !== "overdue") {
          return res.status(400).json({ message: "Loan is not active" });
        }

        const remaining = Number(loan.totalAmount) - Number(loan.amountPaid);
        if (amount > remaining) {
          return res
            .status(400)
            .json({ message: `Maximum repayment amount is Ksh ${remaining}` });
        }

        // Create repayment record
        const repayment = await storage.createLoanRepayment({
          loanId,
          userId: req.user!.id,
          amount: String(amount),
          status: "pending",
        });

        // Initiate M-Pesa payment
        const phoneNumber = phone || req.user!.phone;

        // Format phone number
        let formattedPhone = String(phoneNumber).trim();
        formattedPhone = formattedPhone.replace(/[^\d+]/g, "");
        formattedPhone = formattedPhone.replace(/\+/g, "");

        if (formattedPhone.startsWith("0")) {
          formattedPhone = "254" + formattedPhone.substring(1);
        } else if (
          formattedPhone.startsWith("7") &&
          formattedPhone.length === 9
        ) {
          formattedPhone = "254" + formattedPhone;
        } else if (!formattedPhone.startsWith("254")) {
          formattedPhone = "254" + formattedPhone;
        }

        const amountNum = parseFloat(String(amount));
        const roundedAmount = Math.ceil(amountNum);

        // Call M-Pesa API
        const mpesaResponse = await fetch(
          `${MPESA_API_URL}/api/payVirusiMbayaV2.php`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              phoneNumber: formattedPhone,
              amount: roundedAmount.toString(),
              reference: `LOAN-${repayment.id}`,
            }),
          },
        );

        const resultText = await mpesaResponse.text();
        let result;
        try {
          result = JSON.parse(resultText);
        } catch (parseError) {
          console.error("Failed to parse M-Pesa response:", parseError);
          await storage.updateLoanRepayment(repayment.id, { status: "failed" });
          return res.status(502).json({
            success: false,
            message: "Invalid response from M-Pesa API",
          });
        }

        if (result.success && result.CheckoutRequestID) {
          await storage.updateLoanRepayment(repayment.id, {
            mpesaCheckoutId: result.CheckoutRequestID,
          });

          // Start polling for loan repayment status
          setTimeout(() => {
            checkLoanRepaymentStatus(
              result.CheckoutRequestID,
              repayment.id,
              loanId,
              amount,
            );
          }, 10000);

          res.json({
            success: true,
            checkoutRequestId: result.CheckoutRequestID,
            message: "Payment initiated. Check your phone for M-Pesa prompt.",
          });
        } else {
          await storage.updateLoanRepayment(repayment.id, { status: "failed" });
          res.json({
            success: false,
            message: result.message || "Failed to initiate M-Pesa payment",
          });
        }
      } catch (error: any) {
        console.error("Loan repayment error:", error);
        res
          .status(400)
          .json({ message: error.message || "Failed to initiate repayment" });
      }
    },
  );

  // Function to check loan repayment status
  async function checkLoanRepaymentStatus(
    checkoutRequestId: string,
    repaymentId: number,
    loanId: number,
    amount: number,
  ) {
    try {
      console.log("Checking loan repayment status for:", checkoutRequestId);

      const response = await fetch(
        `${MPESA_API_URL}/api/verify-transaction.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutRequestId,
          }),
        },
      );

      const mpesaResult = await response.json();

      if (mpesaResult.success === true && mpesaResult.status === "completed") {
        const mpesaData = mpesaResult.data;

        if (mpesaData?.ResultCode === 0 && mpesaData?.MpesaReceiptNumber) {
          // Update repayment status
          await storage.updateLoanRepayment(repaymentId, {
            status: "completed",
            mpesaReceiptNumber: mpesaData.MpesaReceiptNumber,
          });

          // Update loan amount paid
          const loan = await storage.getLoanById(loanId);
          if (loan) {
            const newAmountPaid = Number(loan.amountPaid) + amount;
            let status = loan.status;

            // Check if loan is fully paid
            if (newAmountPaid >= Number(loan.totalAmount)) {
              status = "paid";
            }

            await storage.updateLoan(loanId, {
              amountPaid: String(newAmountPaid),
              status,
            });
          }

          console.log(
            `Loan repayment ${repaymentId} completed. Receipt: ${mpesaData.MpesaReceiptNumber}`,
          );
        }
      } else if (
        mpesaResult.success === false &&
        mpesaResult.status === "pending"
      ) {
        // Payment still pending, check again in 10 seconds
        console.log(`Loan repayment still pending, checking again in 10s...`);
        setTimeout(
          () =>
            checkLoanRepaymentStatus(
              checkoutRequestId,
              repaymentId,
              loanId,
              amount,
            ),
          10000,
        );
      } else {
        await storage.updateLoanRepayment(repaymentId, {
          status: "failed",
        });
        console.log(`Loan repayment ${repaymentId} failed.`);
      }
    } catch (error) {
      console.error("Loan repayment status check error:", error);
      setTimeout(
        () =>
          checkLoanRepaymentStatus(
            checkoutRequestId,
            repaymentId,
            loanId,
            amount,
          ),
        10000,
      );
    }
  }

  // ========== CONTACT MESSAGE ROUTES ==========

  app.get(
    "/api/contact/messages",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const messages = await storage.getContactMessagesByUserId(req.user!.id);
        res.json(messages);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get messages" });
      }
    },
  );

  app.post(
    "/api/contact/messages",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { subject, message } = contactFormSchema.parse(req.body);

        const contactMessage = await storage.createContactMessage({
          userId: req.user!.id,
          subject,
          message,
        });

        res.json({ message: "Message sent successfully", contactMessage });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to send message" });
      }
    },
  );

  // ========== ADMIN ROUTES ==========

  // Admin dashboard stats
  app.get(
    "/api/admin/stats",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const users = await storage.getAllUsers();
        const totalContributions = await storage.getTotalContributions();
        const totalSavings = await storage.getTotalSavings();
        const totalLoans = await storage.getTotalLoansAmount();
        const allLoans = await storage.getAllLoans();
        const pendingLoans = await storage.getPendingLoans();
        const overdueLoans = await storage.getOverdueLoans();
        const messages = await storage.getAllContactMessages();
        const pendingMessages = messages.filter((m) => !m.adminReply).length;

        res.json({
          totalMembers: users.length,
          totalContributions,
          totalSavings,
          totalLoans,
          totalLoansCount: allLoans.length,
          pendingLoans: pendingLoans.length,
          overdueLoans: overdueLoans.length,
          pendingMessages,
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get admin stats" });
      }
    },
  );

  app.get(
    "/api/admin/users",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const users = await storage.getAllUsers();
        const usersWithoutPasswords = users.map(
          ({ password, ...user }) => user,
        );
        res.json(usersWithoutPasswords);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get users" });
      }
    },
  );

  // Update user details including totals
  // Update user details including totals
  app.patch(
    "/api/admin/users/:id",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = parseInt(req.params.id);
        const {
          name,
          email,
          phone,
          role,
          totalContributions,
          totalSavings,
          totalLoans,
        } = req.body;

        const user = await storage.getUserById(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Superadmin can't modify other superadmins unless they are superadmin
        if (user.role === "superadmin" && req.user!.role !== "superadmin") {
          return res.status(403).json({ message: "Cannot modify superadmin" });
        }

        // Calculate the differences if totals are being updated
        let contributionsDifference = 0;
        let savingsDifference = 0;
        let loansDifference = 0;

        if (totalContributions !== undefined) {
          contributionsDifference =
            parseFloat(totalContributions) -
            parseFloat(user.totalContributions);
        }

        if (totalSavings !== undefined) {
          savingsDifference =
            parseFloat(totalSavings) - parseFloat(user.totalSavings);
        }

        if (totalLoans !== undefined) {
          loansDifference =
            parseFloat(totalLoans) - parseFloat(user.totalLoans);
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined && req.user!.role === "superadmin")
          updateData.role = role;
        if (totalContributions !== undefined)
          updateData.totalContributions = String(totalContributions);
        if (totalSavings !== undefined)
          updateData.totalSavings = String(totalSavings);
        if (totalLoans !== undefined)
          updateData.totalLoans = String(totalLoans);

        // Update the user
        await storage.updateUser(userId, updateData);

        // Update group totals by recalculating them
        if (
          contributionsDifference !== 0 ||
          savingsDifference !== 0 ||
          loansDifference !== 0
        ) {
          // Recalculate group totals by summing all user totals
          const allUsers = await storage.getAllUsers();

          // Calculate new group totals
          let groupTotalContributions = 0;
          let groupTotalSavings = 0;
          let groupTotalLoans = 0;

          for (const u of allUsers) {
            groupTotalContributions += parseFloat(u.totalContributions);
            groupTotalSavings += parseFloat(u.totalSavings);
            groupTotalLoans += parseFloat(u.totalLoans);
          }

          // Note: Group totals are calculated on the fly in getTotalContributions(),
          // getTotalSavings(), and getTotalLoansAmount() methods, so we don't need to store them.
          // But we need to update any relevant aggregates in the database if they exist.

          // Update contribution and savings records if needed to match user totals
          if (contributionsDifference !== 0) {
            // This ensures consistency between user totals and actual contribution records
            // In a real system, you might want to add a system contribution record to adjust
            console.log(
              `Adjusted contributions for user ${userId}: ${contributionsDifference}`,
            );
          }

          if (savingsDifference !== 0) {
            // This ensures consistency between user totals and actual savings records
            console.log(
              `Adjusted savings for user ${userId}: ${savingsDifference}`,
            );
          }

          if (loansDifference !== 0) {
            console.log(
              `Adjusted loans for user ${userId}: ${loansDifference}`,
            );
          }
        }

        res.json({
          message: "User updated successfully",
          updatedTotals: {
            contributions:
              totalContributions !== undefined
                ? totalContributions
                : user.totalContributions,
            savings:
              totalSavings !== undefined ? totalSavings : user.totalSavings,
            loans: totalLoans !== undefined ? totalLoans : user.totalLoans,
          },
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update user" });
      }
    },
  );

  app.patch(
    "/api/admin/users/:id/role",
    authMiddleware,
    superAdminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = parseInt(req.params.id);
        const { role } = req.body;

        if (!["user", "admin"].includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }

        const user = await storage.getUserById(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (user.role === "superadmin") {
          return res
            .status(400)
            .json({ message: "Cannot change superadmin role" });
        }

        await storage.updateUser(userId, { role });
        res.json({ message: "User role updated" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update user role" });
      }
    },
  );

  app.delete(
    "/api/admin/users/:id",
    authMiddleware,
    superAdminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = parseInt(req.params.id);

        const user = await storage.getUserById(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (user.role === "superadmin") {
          return res.status(400).json({ message: "Cannot delete superadmin" });
        }

        await storage.deleteUser(userId);
        res.json({ message: "User deleted" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to delete user" });
      }
    },
  );

  app.get(
    "/api/admin/loans",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loans = await storage.getAllLoans();
        res.json(loans);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get loans" });
      }
    },
  );

  app.get(
    "/api/admin/loans/pending",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loans = await storage.getPendingLoans();
        res.json(loans);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get pending loans" });
      }
    },
  );

  // Update loan status (admin can change loan status anytime)
  app.patch(
    "/api/admin/loans/:id/status",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loanId = parseInt(req.params.id);
        const { status, rejectionReason } = req.body;

        const loan = await storage.getLoanById(loanId);
        if (!loan) {
          return res.status(404).json({ message: "Loan not found" });
        }

        const updateData: any = {
          status,
          updatedAt: new Date(),
        };

        if (status === "approved") {
          updateData.approvedBy = req.user!.id;
          updateData.approvedAt = new Date();
          // Set due date to 30 days from approval
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          updateData.dueDate = dueDate;
        } else if (status === "rejected") {
          updateData.rejectionReason =
            rejectionReason || "Loan rejected by admin";
        }

        await storage.updateLoan(loanId, updateData);
        res.json({ message: "Loan status updated successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to update loan status" });
      }
    },
  );

  app.post(
    "/api/admin/loans/:id/approve",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loanId = parseInt(req.params.id);
        const loan = await storage.getLoanById(loanId);

        if (!loan) {
          return res.status(404).json({ message: "Loan not found" });
        }

        if (loan.status !== "pending") {
          return res.status(400).json({ message: "Loan is not pending" });
        }

        // Set due date to 30 days from now
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        await storage.updateLoan(loanId, {
          status: "approved",
          approvedBy: req.user!.id,
          approvedAt: new Date(),
          dueDate,
        });

        res.json({ message: "Loan approved successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to approve loan" });
      }
    },
  );

  app.post(
    "/api/admin/loans/:id/reject",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const loanId = parseInt(req.params.id);
        const { reason } = req.body;
        const loan = await storage.getLoanById(loanId);

        if (!loan) {
          return res.status(404).json({ message: "Loan not found" });
        }

        if (loan.status !== "pending") {
          return res.status(400).json({ message: "Loan is not pending" });
        }

        await storage.updateLoan(loanId, {
          status: "rejected",
          rejectionReason: reason,
        });

        res.json({ message: "Loan rejected" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to reject loan" });
      }
    },
  );

  app.get(
    "/api/admin/contributions",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const contributions = await storage.getAllContributions();
        res.json(contributions);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get contributions" });
      }
    },
  );

  // Get recent contributions with user info (admin)
  app.get(
    "/api/admin/recent-contributions",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const contributions = await storage.getRecentContributionsWithUsers(10);
        res.json(contributions);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get contributions" });
      }
    },
  );

  // Get recent savings with user info (admin)
  app.get(
    "/api/admin/recent-savings",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const savings = await storage.getRecentSavingsWithUsers(10);
        res.json(savings);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get savings" });
      }
    },
  );

  app.get(
    "/api/admin/savings",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const savings = await storage.getAllSavings();
        res.json(savings);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get savings" });
      }
    },
  );

  app.get(
    "/api/admin/messages",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const messages = await storage.getAllContactMessages();
        res.json(messages);
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to get messages" });
      }
    },
  );

  app.post(
    "/api/admin/messages/:id/reply",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const messageId = parseInt(req.params.id);
        const { reply } = req.body;

        const message = await storage.getContactMessageById(messageId);
        if (!message) {
          return res.status(404).json({ message: "Message not found" });
        }

        await storage.updateContactMessage(messageId, {
          adminReply: reply,
          repliedBy: req.user!.id,
          repliedAt: new Date(),
          isRead: true,
        });

        res.json({ message: "Reply sent successfully" });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to send reply" });
      }
    },
  );

  // Recalculate all group totals (admin only)
  app.post(
    "/api/admin/recalculate-totals",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const allUsers = await storage.getAllUsers();

        // Calculate group totals from user totals
        let groupTotalContributions = 0;
        let groupTotalSavings = 0;
        let groupTotalLoans = 0;

        for (const user of allUsers) {
          groupTotalContributions += parseFloat(user.totalContributions);
          groupTotalSavings += parseFloat(user.totalSavings);
          groupTotalLoans += parseFloat(user.totalLoans);
        }

        // Also calculate from actual transaction records for verification
        const actualTotalContributions = await storage.getTotalContributions();
        const actualTotalSavings = await storage.getTotalSavings();
        const actualTotalLoans = await storage.getTotalLoansAmount();

        res.json({
          message: "Totals recalculated",
          totalsFromUserData: {
            contributions: groupTotalContributions,
            savings: groupTotalSavings,
            loans: groupTotalLoans,
          },
          totalsFromTransactions: {
            contributions: actualTotalContributions,
            savings: actualTotalSavings,
            loans: actualTotalLoans,
          },
          discrepancies: {
            contributions: Math.abs(
              groupTotalContributions - actualTotalContributions,
            ),
            savings: Math.abs(groupTotalSavings - actualTotalSavings),
            loans: Math.abs(groupTotalLoans - actualTotalLoans),
          },
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to recalculate totals" });
      }
    },
  );

  // Add manual adjustment to group totals
  app.post(
    "/api/admin/adjust-group-totals",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { contributionsAdjustment, savingsAdjustment, loansAdjustment } =
          req.body;

        // Get current totals
        const currentContributions = await storage.getTotalContributions();
        const currentSavings = await storage.getTotalSavings();
        const currentLoans = await storage.getTotalLoansAmount();

        res.json({
          message: "Group totals adjusted (simulated)",
          oldTotals: {
            contributions: currentContributions,
            savings: currentSavings,
            loans: currentLoans,
          },
          adjustments: {
            contributions: contributionsAdjustment || 0,
            savings: savingsAdjustment || 0,
            loans: loansAdjustment || 0,
          },
          newTotals: {
            contributions:
              currentContributions + (parseFloat(contributionsAdjustment) || 0),
            savings: currentSavings + (parseFloat(savingsAdjustment) || 0),
            loans: currentLoans + (parseFloat(loansAdjustment) || 0),
          },
        });
      } catch (error: any) {
        res
          .status(400)
          .json({ message: error.message || "Failed to adjust group totals" });
      }
    },
  );

  return httpServer;
}
