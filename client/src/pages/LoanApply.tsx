import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  Calculator,
  Info,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { toast } from "react-toastify";
import { z } from "zod";
import { format, addMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { apiRequest } from "@/lib/queryClient";
import { loanApplicationSchema } from "@shared/schema";

// Define validation schema with min 100 and max 50000
const loanApplySchema = z.object({
  amount: z
    .number()
    .min(100, { message: "Minimum loan amount is Ksh 100" })
    .max(50000, { message: "Maximum loan amount is Ksh 50,000" }),
  duration: z.enum(["1", "2", "3"], {
    required_error: "Please select a loan duration",
  }),
  loanUsage: z
    .string()
    .min(10, { message: "Please provide a reason (at least 10 characters)" })
    .max(500, { message: "Reason is too long (maximum 500 characters)" }),
});

type LoanDuration = "1" | "2" | "3";

export default function LoanApply() {
  const [, setLocation] = useLocation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<z.infer<typeof loanApplySchema>>({
    resolver: zodResolver(loanApplySchema),
    defaultValues: {
      amount: 1000,
      duration: "1",
      loanUsage: "",
    },
  });

  const amount = form.watch("amount");
  const duration = form.watch("duration") as LoanDuration;
  const loanUsage = form.watch("loanUsage");
  const interest = amount * 0.1;
  const totalAmount = amount + interest;

  // Calculate due date based on selected duration
  const calculateDueDate = () => {
    const now = new Date();
    const months = parseInt(duration);
    const dueDate = addMonths(now, months);
    return format(dueDate, "MMMM d, yyyy");
  };

  const applyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof loanApplySchema>) => {
      return apiRequest("POST", "/api/loans/apply", data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast.success("Loan application submitted successfully!", {
        closeButton: true,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit loan application", {
        closeButton: true,
      });
    },
  });

  const onSubmit = (data: z.infer<typeof loanApplySchema>) => {
    applyMutation.mutate(data);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 py-8">
          <div className="container mx-auto px-4 max-w-md">
            <Card>
              <CardContent className="pt-8 text-center">
                <div className="flex justify-center mb-6">
                  <div className="p-4 rounded-full bg-primary/10">
                    <CheckCircle className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  Application Submitted!
                </h2>
                <p className="text-muted-foreground mb-6">
                  Your loan application for Ksh {amount.toLocaleString()} has
                  been submitted. Our admin team will review it and notify you
                  of the decision.
                </p>
                <div className="space-y-3">
                  <Link href="/loans">
                    <Button className="w-full" data-testid="button-view-loans">
                      View My Loans
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid="button-back-dashboard"
                    >
                      Back to Dashboard
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link
            href="/loans"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Loans
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Application Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-primary" />
                  Apply for Loan
                </CardTitle>
                <CardDescription>
                  Choose your loan amount and submit for approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loan Amount (Ksh)</FormLabel>
                          <FormControl>
                            <div className="space-y-4">
                              <Input
                                type="number"
                                min={100}
                                max={50000}
                                step={100}
                                {...field}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  if (value < 100) {
                                    field.onChange(100);
                                  } else if (value > 50000) {
                                    field.onChange(50000);
                                  } else {
                                    field.onChange(value);
                                  }
                                }}
                                onBlur={(e) => {
                                  const value = Number(e.target.value);
                                  if (value < 100) {
                                    field.onChange(100);
                                    toast.warning(
                                      "Minimum loan amount is Ksh 100",
                                      { closeButton: true },
                                    );
                                  } else if (value > 50000) {
                                    field.onChange(50000);
                                    toast.warning(
                                      "Maximum loan amount is Ksh 50,000",
                                      { closeButton: true },
                                    );
                                  }
                                }}
                                data-testid="input-loan-amount"
                              />
                              <Slider
                                min={100}
                                max={50000}
                                step={100}
                                value={[field.value]}
                                onValueChange={([value]) =>
                                  field.onChange(value)
                                }
                                className="py-4"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Ksh 100</span>
                                <span>Ksh 50,000</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Enter amount between Ksh 100 and Ksh 50,000
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loan Duration</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select duration" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1 Month</SelectItem>
                              <SelectItem value="2">2 Months</SelectItem>
                              <SelectItem value="3">3 Months</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select how long you need to repay the loan
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="loanUsage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>What will you use the loan for?</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Please describe what you plan to use the loan for..."
                              className="resize-none min-h-[100px]"
                              {...field}
                              data-testid="textarea-loan-usage"
                            />
                          </FormControl>
                          <FormDescription>
                            Provide a clear reason for your loan application
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Estimated Due Date:
                        </span>
                        <span className="font-medium">
                          {calculateDueDate()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Selected Amount
                        </span>
                        <span className="font-mono font-semibold">
                          Ksh {amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Interest (10%)
                        </span>
                        <span className="font-mono font-semibold text-chart-2">
                          Ksh {interest.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium pt-2 border-t">
                        <span>Total Repayment</span>
                        <span className="font-mono text-primary">
                          Ksh {totalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={applyMutation.isPending}
                      data-testid="button-submit-application"
                    >
                      {applyMutation.isPending
                        ? "Submitting..."
                        : "Submit Application"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Loan Calculator */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    Loan Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">
                      Principal Amount
                    </span>
                    <span className="font-mono font-semibold">
                      Ksh {amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Interest Rate</span>
                    <span className="font-semibold">10%</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">
                      Interest Amount
                    </span>
                    <span className="font-mono font-semibold text-chart-2">
                      Ksh {interest.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">
                      Repayment Period
                    </span>
                    <span className="font-semibold">
                      {duration === "1"
                        ? "1 Month"
                        : duration === "2"
                          ? "2 Months"
                          : "3 Months"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">
                      Estimated Due Date
                    </span>
                    <span className="font-semibold">{calculateDueDate()}</span>
                  </div>
                  <div className="flex justify-between py-3 bg-primary/5 rounded-lg px-3 -mx-3">
                    <span className="font-semibold">Total Repayment</span>
                    <span className="font-mono font-bold text-lg text-primary">
                      Ksh {totalAmount.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="h-4 w-4 text-primary" />
                    Loan Terms & Limits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        <strong>Minimum loan:</strong> Ksh 100
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        <strong>Maximum loan:</strong> Ksh 50,000
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>Fixed 10% interest rate on all loans</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        Loan duration options: 1, 2, or 3 months repayment
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>Loan approval subject to admin review</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>Repayment via M-Pesa</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        Provide clear reason for loan to improve approval
                        chances
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        Active contributions may improve approval chances
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                      <span>
                        Late payments incur additional penalties (5% per day)
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-3">
                      <Info className="h-3 w-3" />
                      Quick Tips
                    </div>
                    <p className="text-sm">
                      <strong>Tip:</strong> Start with a smaller amount for
                      faster approval. You can apply for larger loans once you
                      build a good repayment history.
                    </p>
                    <p className="text-sm mt-2">
                      <strong>Important:</strong> Be specific about your loan
                      purpose. Clear, legitimate reasons are more likely to be
                      approved.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
