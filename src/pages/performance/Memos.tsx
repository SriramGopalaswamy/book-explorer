import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, Search, Clock, CheckCircle, Eye, Edit, Send, Users, AlertCircle } from "lucide-react";

const memos = [
  { 
    id: 1, 
    title: "Q1 2024 Company Update", 
    author: "Sriram G.", 
    department: "Leadership", 
    date: "Jan 15, 2024", 
    status: "published",
    priority: "high",
    views: 45,
    excerpt: "Key updates on company performance, new initiatives, and Q1 goals..."
  },
  { 
    id: 2, 
    title: "New Remote Work Policy", 
    author: "Sneha Reddy", 
    department: "HR", 
    date: "Jan 12, 2024", 
    status: "published",
    priority: "medium",
    views: 38,
    excerpt: "Updated guidelines for remote work arrangements and expectations..."
  },
  { 
    id: 3, 
    title: "IT Security Guidelines", 
    author: "Vikram Singh", 
    department: "IT", 
    date: "Jan 10, 2024", 
    status: "draft",
    priority: "high",
    views: 0,
    excerpt: "Important security protocols all employees must follow..."
  },
  { 
    id: 4, 
    title: "Holiday Calendar 2024", 
    author: "Sneha Reddy", 
    department: "HR", 
    date: "Jan 8, 2024", 
    status: "published",
    priority: "low",
    views: 52,
    excerpt: "Complete list of company holidays and observances for 2024..."
  },
  { 
    id: 5, 
    title: "Product Roadmap Q1", 
    author: "Rahul Sharma", 
    department: "Engineering", 
    date: "Jan 5, 2024", 
    status: "pending",
    priority: "medium",
    views: 0,
    excerpt: "Technical roadmap and sprint planning for Q1 deliverables..."
  },
];

const memoStats = {
  total: 24,
  published: 18,
  drafts: 4,
  pending: 2,
};

export default function Memos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { class: string; icon: typeof CheckCircle }> = {
      published: { class: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      draft: { class: "bg-gray-100 text-gray-700 border-gray-200", icon: Edit },
      pending: { class: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;
    return (
      <Badge variant="outline" className={style.class}>
        <Icon className="h-3 w-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      high: "bg-red-100 text-red-700 border-red-200",
      medium: "bg-blue-100 text-blue-700 border-blue-200",
      low: "bg-gray-100 text-gray-600 border-gray-200",
    };
    return (
      <Badge variant="outline" className={styles[priority] || styles.low}>
        {priority}
      </Badge>
    );
  };

  return (
    <MainLayout title="Memos" subtitle="Internal communications and announcements">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Memos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoStats.total}</div>
            <p className="text-xs text-muted-foreground">This year</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{memoStats.published}</div>
            <p className="text-xs text-muted-foreground">Active memos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <Edit className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoStats.drafts}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{memoStats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Memos List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>All Memos</CardTitle>
            <CardDescription>Company-wide communications and announcements</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search memos..." className="pl-9 w-64" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Memo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Memo</DialogTitle>
                  <DialogDescription>Write and publish a new memo to your team</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Title</Label>
                    <Input placeholder="Enter memo title" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Department</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Departments</SelectItem>
                          <SelectItem value="engineering">Engineering</SelectItem>
                          <SelectItem value="hr">HR</SelectItem>
                          <SelectItem value="sales">Sales</SelectItem>
                          <SelectItem value="marketing">Marketing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Priority</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Content</Label>
                    <Textarea placeholder="Write your memo content here..." className="min-h-[200px]" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Save Draft</Button>
                  <Button onClick={() => setIsDialogOpen(false)}>
                    <Send className="h-4 w-4 mr-2" />
                    Publish
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <div className="space-y-4">
                {memos.map((memo) => (
                  <div key={memo.id} className="p-4 rounded-lg border hover:bg-secondary/30 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{memo.title}</h3>
                          {getStatusBadge(memo.status)}
                          {getPriorityBadge(memo.priority)}
                        </div>
                        <p className="text-muted-foreground mb-3">{memo.excerpt}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">{memo.author.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                            </Avatar>
                            <span>{memo.author}</span>
                          </div>
                          <span>•</span>
                          <span>{memo.department}</span>
                          <span>•</span>
                          <span>{memo.date}</span>
                          {memo.status === "published" && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {memo.views} views
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
