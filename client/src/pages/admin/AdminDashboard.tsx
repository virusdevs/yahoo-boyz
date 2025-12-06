import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users,
  TrendingUp,
  Banknote,
  AlertCircle,
  Wallet,
  PiggyBank,
  MessageSquare,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  RefreshCw,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Filter,
  Search,
} from "lucide-react";
import { toast } from "react-toastify";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

interface AdminStats {
  totalMembers: number;
  totalContributions: number;
  totalSavings: number;
  totalLoans: number;
  totalLoansCount: number;
  pendingLoans: number;
  overdueLoans: number;
  pendingMessages: number;
}

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "user" | "admin" | "superadmin";
  isVerified: boolean;
  totalContributions: string;
  totalSavings: string;
  totalLoans: string;
  createdAt: string;
}

interface Loan {
  id: number;
  userId: number;
  amount: string;
  interestRate: string;
  totalAmount: string;
  amountPaid: string;
  status: "pending" | "approved" | "rejected" | "paid" | "overdue";
  loanUsage: string;
  dueDate?: string;
  approvedAt?: string;
  approvedBy?: number;
  rejectionReason?: string;
  createdAt: string;
}

interface Contribution {
  id: number;
  userId: number;
  amount: string;
  status: "pending" | "completed" | "failed";
  mpesaReceiptNumber?: string;
  createdAt: string;
}

interface Saving {
  id: number;
  userId: number;
  amount: string;
  description?: string;
  status: "pending" | "completed" | "failed";
  mpesaReceiptNumber?: string;
  createdAt: string;
}

interface ContactMessage {
  id: number;
  userId: number;
  subject: string;
  message: string;
  adminReply?: string;
  repliedBy?: number;
  repliedAt?: string;
  isRead: boolean;
  createdAt: string;
}

interface RecentContribution {
  id: number;
  userId: number;
  amount: string;
  status: "pending" | "completed" | "failed";
  mpesaReceiptNumber?: string;
  createdAt: string;
  user?: {
    name?: string;
    email?: string;
  };
}

interface RecentSaving {
  id: number;
  userId: number;
  amount: string;
  description?: string;
  status: "pending" | "completed" | "failed";
  mpesaReceiptNumber?: string;
  createdAt: string;
  user?: {
    name?: string;
    email?: string;
  };
}

export default function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(
    null,
  );
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editLoanDialogOpen, setEditLoanDialogOpen] = useState(false);

  // Admin stats
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000,
  });

  // Users list
  const {
    data: users = [],
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  // Loans list
  const {
    data: loans = [],
    isLoading: loansLoading,
    refetch: refetchLoans,
  } = useQuery<Loan[]>({
    queryKey: ["/api/admin/loans"],
  });

  // Pending loans
  const { data: pendingLoans = [], isLoading: pendingLoansLoading } = useQuery<
    Loan[]
  >({
    queryKey: ["/api/admin/loans/pending"],
  });

  // Recent contributions - with safe default
  const {
    data: recentContributions = [],
    isLoading: recentContributionsLoading,
  } = useQuery<RecentContribution[]>({
    queryKey: ["/api/admin/recent-contributions"],
  });

  // Recent savings - with safe default
  const { data: recentSavings = [], isLoading: recentSavingsLoading } =
    useQuery<RecentSaving[]>({
      queryKey: ["/api/admin/recent-savings"],
    });

  // Messages
  const {
    data: messages = [],
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useQuery<ContactMessage[]>({
    queryKey: ["/api/admin/messages"],
  });

  // Mutations
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: number;
      role: "user" | "admin";
    }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      toast.success("User role updated");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update user role");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const updateLoanStatusMutation = useMutation({
    mutationFn: async ({
      loanId,
      status,
      rejectionReason,
    }: {
      loanId: number;
      status: string;
      rejectionReason?: string;
    }) => {
      return apiRequest("PATCH", `/api/admin/loans/${loanId}/status`, {
        status,
        rejectionReason,
      });
    },
    onSuccess: () => {
      toast.success("Loan status updated");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update loan status");
    },
  });

  const replyMessageMutation = useMutation({
    mutationFn: async ({
      messageId,
      reply,
    }: {
      messageId: number;
      reply: string;
    }) => {
      return apiRequest("POST", `/api/admin/messages/${messageId}/reply`, {
        reply,
      });
    },
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyDialogOpen(false);
      setReplyText("");
      setSelectedMessage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send reply");
    },
  });

  const recalculateTotalsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/recalculate-totals", {});
    },
    onSuccess: (data) => {
      toast.success("Totals recalculated");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      console.log("Recalculation result:", data);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to recalculate totals");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: number;
      data: Partial<User>;
    }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, data);
    },
    onSuccess: () => {
      toast.success("User updated successfully");
      setEditUserDialogOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update user");
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchUsers();
    refetchLoans();
    refetchMessages();
    toast.success("Refreshing admin data...");
  };

  const handleReplyMessage = () => {
    if (!selectedMessage || !replyText.trim()) return;
    replyMessageMutation.mutate({
      messageId: selectedMessage.id,
      reply: replyText,
    });
  };

  const handleUpdateUserRole = (userId: number, role: "user" | "admin") => {
    if (confirm(`Change user role to ${role}?`)) {
      updateUserRoleMutation.mutate({ userId, role });
    }
  };

  const handleDeleteUser = (userId: number, userName: string) => {
    if (confirm(`Are you sure you want to delete ${userName}?`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleApproveLoan = (loanId: number) => {
    if (confirm("Approve this loan application?")) {
      updateLoanStatusMutation.mutate({ loanId, status: "approved" });
    }
  };

  const handleRejectLoan = (loanId: number, loanAmount: string) => {
    const reason = prompt(
      `Enter rejection reason for loan of Ksh ${loanAmount}:`,
      "Loan rejected by admin",
    );
    if (reason !== null) {
      updateLoanStatusMutation.mutate({
        loanId,
        status: "rejected",
        rejectionReason: reason,
      });
    }
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;

    const formData = new FormData(
      document.getElementById("edit-user-form") as HTMLFormElement,
    );
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const totalContributions =
      parseFloat(formData.get("totalContributions") as string) || 0;
    const totalSavings =
      parseFloat(formData.get("totalSavings") as string) || 0;
    const totalLoans = parseFloat(formData.get("totalLoans") as string) || 0;

    updateUserMutation.mutate({
      userId: selectedUser.id,
      data: {
        name,
        email,
        phone,
        totalContributions: totalContributions.toString(),
        totalSavings: totalSavings.toString(),
        totalLoans: totalLoans.toString(),
      },
    });
  };

  // Format numbers
  const formatNumber = (num: number | undefined) => {
    return (
      num?.toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) || "0.00"
    );
  };

  // Filter users based on search
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone.includes(searchQuery),
  );

  // Filter pending messages
  const pendingMessages = messages.filter((m) => !m.adminReply);

  // Safe getter for user name
  const getUserName = (
    userId: number,
    userData?: { name?: string; email?: string },
  ) => {
    if (userData?.name) return userData.name;
    if (userData?.email) return userData.email;
    return `User #${userId}`;
  };

  // Safe getter for user email
  const getUserEmail = (userId: number, userData?: { email?: string }) => {
    if (userData?.email) return userData.email;
    return `user-${userId}@example.com`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground">
                Welcome back, {user?.name}. Manage all system activities here.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => recalculateTotalsMutation.mutate()}
                disabled={recalculateTotalsMutation.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${recalculateTotalsMutation.isPending ? "animate-spin" : ""}`}
                />
                Recalculate Totals
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={
                  statsLoading ||
                  usersLoading ||
                  loansLoading ||
                  messagesLoading
                }
              >
                <RefreshCw
                  className={`h-4 w-4 ${statsLoading || usersLoading || loansLoading || messagesLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Members
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <p className="text-2xl font-bold">
                        {stats?.totalMembers || 0}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-500/10">
                    <Wallet className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Contributions
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold font-mono">
                        Ksh {formatNumber(stats?.totalContributions)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <PiggyBank className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Savings
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold font-mono">
                        Ksh {formatNumber(stats?.totalSavings)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/10">
                    <Banknote className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Loans</p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className="text-2xl font-bold font-mono">
                        Ksh {formatNumber(stats?.totalLoans)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-chart-2/10">
                    <Clock className="h-6 w-6 text-chart-2" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pending Loans
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold">
                          {stats?.pendingLoans || 0}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setActiveTab("loans")}
                        >
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-destructive/10">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Overdue Loans
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold">
                          {stats?.overdueLoans || 0}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setActiveTab("loans")}
                        >
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/10">
                    <MessageSquare className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pending Messages
                    </p>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold">
                          {stats?.pendingMessages || 0}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setActiveTab("messages")}
                        >
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
            <TabsList className="grid grid-cols-5 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="loans">Loans</TabsTrigger>
              <TabsTrigger value="contributions">Transactions</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Recent Contributions */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Contributions</CardTitle>
                  <CardDescription>
                    Latest contributions from all users
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentContributionsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : recentContributions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentContributions.slice(0, 5).map((contribution) => (
                          <TableRow key={contribution.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {getUserName(
                                    contribution.userId,
                                    contribution.user,
                                  )}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {getUserEmail(
                                    contribution.userId,
                                    contribution.user,
                                  )}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono">
                              Ksh {Number(contribution.amount).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  contribution.status === "completed"
                                    ? "default"
                                    : contribution.status === "pending"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {contribution.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(
                                new Date(contribution.createdAt),
                                "MMM d, yyyy",
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        No contributions yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Savings */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Savings</CardTitle>
                  <CardDescription>
                    Latest savings from all users
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentSavingsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : recentSavings.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentSavings.slice(0, 5).map((saving) => (
                          <TableRow key={saving.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {getUserName(saving.userId, saving.user)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {getUserEmail(saving.userId, saving.user)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono">
                              Ksh {Number(saving.amount).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {saving.description || "Savings"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  saving.status === "completed"
                                    ? "default"
                                    : saving.status === "pending"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {saving.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(
                                new Date(saving.createdAt),
                                "MMM d, yyyy",
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <PiggyBank className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No savings yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Users Management</CardTitle>
                      <CardDescription>Manage all system users</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users..."
                          className="pl-9 w-[250px]"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <Button variant="outline" size="icon">
                        <Filter className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {usersLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Totals</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="font-medium">{user.name}</div>
                                {!user.isVerified && (
                                  <Badge variant="outline" className="text-xs">
                                    Unverified
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.phone}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  user.role === "superadmin"
                                    ? "default"
                                    : user.role === "admin"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs space-y-1">
                                <div className="flex justify-between">
                                  <span>Contributions:</span>
                                  <span className="font-mono">
                                    Ksh{" "}
                                    {Number(
                                      user.totalContributions,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Savings:</span>
                                  <span className="font-mono">
                                    Ksh{" "}
                                    {Number(user.totalSavings).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Loans:</span>
                                  <span className="font-mono">
                                    Ksh{" "}
                                    {Number(user.totalLoans).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {format(new Date(user.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setEditUserDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Details
                                  </DropdownMenuItem>
                                  {user.role !== "superadmin" && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {user.role === "user" && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleUpdateUserRole(
                                              user.id,
                                              "admin",
                                            )
                                          }
                                        >
                                          Promote to Admin
                                        </DropdownMenuItem>
                                      )}
                                      {user.role === "admin" &&
                                        user.role !== "superadmin" && (
                                          <DropdownMenuItem
                                            onClick={() =>
                                              handleUpdateUserRole(
                                                user.id,
                                                "user",
                                              )
                                            }
                                          >
                                            Demote to User
                                          </DropdownMenuItem>
                                        )}
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleDeleteUser(user.id, user.name)
                                        }
                                        className="text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete User
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Loans Tab */}
            <TabsContent value="loans">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Loans Management</CardTitle>
                      <CardDescription>
                        Approve, reject, or manage loans
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchLoans()}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="pending" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="pending">
                        Pending ({pendingLoans.length})
                      </TabsTrigger>
                      <TabsTrigger value="all">
                        All Loans ({loans.length})
                      </TabsTrigger>
                      <TabsTrigger value="overdue">
                        Overdue ({stats?.overdueLoans || 0})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pending">
                      {pendingLoansLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                          ))}
                        </div>
                      ) : pendingLoans.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User ID</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Total with Interest</TableHead>
                              <TableHead>Purpose</TableHead>
                              <TableHead>Applied On</TableHead>
                              <TableHead className="text-right">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingLoans.map((loan) => (
                              <TableRow key={loan.id}>
                                <TableCell className="font-mono">
                                  #{loan.userId}
                                </TableCell>
                                <TableCell className="font-mono">
                                  Ksh {Number(loan.amount).toLocaleString()}
                                </TableCell>
                                <TableCell className="font-mono">
                                  Ksh{" "}
                                  {Number(loan.totalAmount).toLocaleString()}
                                </TableCell>
                                <TableCell>{loan.loanUsage}</TableCell>
                                <TableCell>
                                  {format(
                                    new Date(loan.createdAt),
                                    "MMM d, yyyy",
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveLoan(loan.id)}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() =>
                                        handleRejectLoan(loan.id, loan.amount)
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">
                            No pending loans
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="all">
                      {loansLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                          ))}
                        </div>
                      ) : loans.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User ID</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Progress</TableHead>
                              <TableHead>Due Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {loans.map((loan) => (
                              <TableRow key={loan.id}>
                                <TableCell className="font-mono">
                                  #{loan.userId}
                                </TableCell>
                                <TableCell className="font-mono">
                                  Ksh {Number(loan.amount).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      loan.status === "approved"
                                        ? "default"
                                        : loan.status === "pending"
                                          ? "secondary"
                                          : loan.status === "paid"
                                            ? "outline"
                                            : "destructive"
                                    }
                                  >
                                    {loan.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono">
                                  Ksh {Number(loan.amountPaid).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress
                                      value={
                                        (Number(loan.amountPaid) /
                                          Number(loan.totalAmount)) *
                                        100
                                      }
                                      className="h-2"
                                    />
                                    <span className="text-xs">
                                      {Math.round(
                                        (Number(loan.amountPaid) /
                                          Number(loan.totalAmount)) *
                                          100,
                                      )}
                                      %
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {loan.dueDate
                                    ? format(
                                        new Date(loan.dueDate),
                                        "MMM d, yyyy",
                                      )
                                    : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-8">
                          <Banknote className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">
                            No loans found
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Contributions Tab */}
            <TabsContent value="contributions">
              <Card>
                <CardHeader>
                  <CardTitle>All Transactions</CardTitle>
                  <CardDescription>
                    View all contributions and savings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="contributions" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="contributions">
                        Contributions
                      </TabsTrigger>
                      <TabsTrigger value="savings">Savings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="contributions">
                      <p className="text-sm text-muted-foreground mb-4">
                        Showing all contributions. Use the filters to search.
                      </p>
                      <div className="border rounded-lg">
                        <div className="p-4 border-b">
                          <div className="flex items-center gap-4">
                            <Input
                              placeholder="Search by user or receipt..."
                              className="max-w-sm"
                            />
                            <Button variant="outline" size="sm">
                              <Filter className="h-4 w-4 mr-2" />
                              Filter
                            </Button>
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <p className="text-muted-foreground">
                            Full contributions list would be displayed here
                          </p>
                          <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => {
                              // In a real app, you would fetch all contributions here
                              toast.info("Loading all contributions...");
                            }}
                          >
                            Load All Contributions
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="savings">
                      <p className="text-sm text-muted-foreground mb-4">
                        Showing all savings. Use the filters to search.
                      </p>
                      <div className="border rounded-lg">
                        <div className="p-4 border-b">
                          <div className="flex items-center gap-4">
                            <Input
                              placeholder="Search by user or description..."
                              className="max-w-sm"
                            />
                            <Button variant="outline" size="sm">
                              <Filter className="h-4 w-4 mr-2" />
                              Filter
                            </Button>
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <p className="text-muted-foreground">
                            Full savings list would be displayed here
                          </p>
                          <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => {
                              toast.info("Loading all savings...");
                            }}
                          >
                            Load All Savings
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Contact Messages</CardTitle>
                      <CardDescription>Reply to user inquiries</CardDescription>
                    </div>
                    <Badge
                      variant={
                        pendingMessages.length > 0 ? "destructive" : "outline"
                      }
                    >
                      {pendingMessages.length} pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {messagesLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <Card
                          key={message.id}
                          className={message.adminReply ? "opacity-75" : ""}
                        >
                          <CardContent className="pt-6">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-start gap-3">
                                  <div className="p-2 rounded-lg bg-primary/10">
                                    <MessageSquare className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-semibold">
                                        {message.subject}
                                      </h4>
                                      {!message.adminReply && (
                                        <Badge variant="destructive">New</Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">
                                      From User #{message.userId} •{" "}
                                      {format(
                                        new Date(message.createdAt),
                                        "MMM d, yyyy 'at' h:mm a",
                                      )}
                                    </p>
                                    <p className="mb-3">{message.message}</p>
                                    {message.adminReply && (
                                      <div className="mt-4 p-3 bg-muted rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                          <p className="text-sm font-medium">
                                            Admin Reply
                                          </p>
                                          <span className="text-xs text-muted-foreground">
                                            {message.repliedAt &&
                                              format(
                                                new Date(message.repliedAt),
                                                "MMM d, yyyy",
                                              )}
                                          </span>
                                        </div>
                                        <p className="text-sm">
                                          {message.adminReply}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {!message.adminReply && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMessage(message);
                                    setReplyDialogOpen(true);
                                  }}
                                >
                                  Reply
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No messages yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to Message</DialogTitle>
            <DialogDescription>
              Send a reply to the user's inquiry
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <p className="text-sm font-medium mb-1">Original Message:</p>
              <p className="text-sm text-muted-foreground">
                {selectedMessage?.message}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Your Reply</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full mt-1.5 p-2 border rounded-md min-h-[120px]"
                  placeholder="Type your reply here..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReplyMessage}
              disabled={!replyText.trim() || replyMessageMutation.isPending}
            >
              {replyMessageMutation.isPending ? "Sending..." : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User Details</DialogTitle>
            <DialogDescription>
              Update user information and totals
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <form id="edit-user-form">
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    name="name"
                    defaultValue={selectedUser.name}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    name="email"
                    defaultValue={selectedUser.email}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    name="phone"
                    defaultValue={selectedUser.phone}
                    className="mt-1.5"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">Contributions</label>
                    <Input
                      name="totalContributions"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(selectedUser.totalContributions)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Savings</label>
                    <Input
                      name="totalSavings"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(selectedUser.totalSavings)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Loans</label>
                    <Input
                      name="totalLoans"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(selectedUser.totalLoans)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditUserDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUpdateUser}
                  disabled={updateUserMutation.isPending}
                >
                  {updateUserMutation.isPending ? "Updating..." : "Update User"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
