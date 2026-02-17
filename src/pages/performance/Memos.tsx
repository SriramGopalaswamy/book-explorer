import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FileText, Plus, Search, Clock, CheckCircle, Eye, Edit, Send, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useMemos, 
  useMemoStats, 
  useCreateMemo, 
  usePublishMemo,
  useDeleteMemo,
  useIncrementMemoViews,
  type Memo,
} from "@/hooks/useMemos";

export default function Memos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("All");
  const [priority, setPriority] = useState<Memo["priority"]>("medium");
  const [recipients, setRecipients] = useState("");

  const { user } = useAuth();
  const { data: memos = [], isLoading } = useMemos(activeTab);
  const { data: stats } = useMemoStats();
  const createMemo = useCreateMemo();
  const publishMemo = usePublishMemo();
  const deleteMemo = useDeleteMemo();
  const incrementViews = useIncrementMemoViews();

  const filteredMemos = memos.filter((memo) =>
    !searchTerm || 
    memo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    memo.author_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateMemo = async (status: "draft" | "published") => {
    if (!title) return;
    
    const authorName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Unknown";
    const recipientList = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    
    await createMemo.mutateAsync({
      title,
      content,
      department,
      priority,
      status,
      author_name: authorName,
      recipients: recipientList,
    });
    
    setIsDialogOpen(false);
    setTitle("");
    setContent("");
    setDepartment("All");
    setPriority("medium");
    setRecipients("");
  };

  const handleViewMemo = (memo: Memo) => {
    setSelectedMemo(memo);
    setViewDialogOpen(true);
    if (memo.status === "published") {
      incrementViews.mutate(memo.id);
    }
  };

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
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">This year</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.published || 0}</div>
            <p className="text-xs text-muted-foreground">Active memos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <Edit className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.drafts || 0}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.pending || 0}</div>
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
              <Input 
                placeholder="Search memos..." 
                className="pl-9 w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
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
                    <Label>To (Recipients)</Label>
                    <Input 
                      placeholder="e.g. John Doe, jane@company.com (comma-separated)"
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Separate multiple recipients with commas</p>
                  </div>
                  <div className="grid gap-2">
                    <Label>Title</Label>
                    <Input 
                      placeholder="Enter memo title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Department</Label>
                      <Select value={department} onValueChange={setDepartment}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Departments</SelectItem>
                          <SelectItem value="Engineering">Engineering</SelectItem>
                          <SelectItem value="HR">HR</SelectItem>
                          <SelectItem value="Sales">Sales</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="Finance">Finance</SelectItem>
                          <SelectItem value="Leadership">Leadership</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={(v) => setPriority(v as Memo["priority"])}>
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
                    <Textarea 
                      placeholder="Write your memo content here..." 
                      className="min-h-[200px]"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => handleCreateMemo("draft")}
                    disabled={createMemo.isPending || !title}
                  >
                    Save Draft
                  </Button>
                  <Button 
                    onClick={() => handleCreateMemo("published")}
                    disabled={createMemo.isPending || !title}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {createMemo.isPending ? "Publishing..." : "Publish"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredMemos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No memos found
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMemos.map((memo) => (
                    <div key={memo.id} className="p-4 rounded-lg border hover:bg-secondary/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{memo.title}</h3>
                            {getStatusBadge(memo.status)}
                            {getPriorityBadge(memo.priority)}
                          </div>
                          {memo.excerpt && (
                            <p className="text-muted-foreground mb-2">{memo.excerpt}</p>
                          )}
                          {memo.recipients && memo.recipients.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-2 text-sm">
                              <span className="font-medium text-muted-foreground">To:</span>
                              <span className="text-foreground">{memo.recipients.join(", ")}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {memo.author_name.split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <span>{memo.author_name}</span>
                            </div>
                            <span>•</span>
                            <span>{memo.department}</span>
                            <span>•</span>
                            <span>{format(new Date(memo.created_at), "MMM d, yyyy")}</span>
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
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewMemo(memo)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {memo.status === "draft" && (
                            <Button 
                              size="sm"
                              onClick={() => publishMemo.mutate(memo.id)}
                              disabled={publishMemo.isPending}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Publish
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMemo.mutate(memo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Memo Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedMemo?.title}</DialogTitle>
            <DialogDescription>
              By {selectedMemo?.author_name} • {selectedMemo?.department} • {selectedMemo && format(new Date(selectedMemo.created_at), "MMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex gap-2 mb-4">
              {selectedMemo && getStatusBadge(selectedMemo.status)}
              {selectedMemo && getPriorityBadge(selectedMemo.priority)}
            </div>
            {selectedMemo?.recipients && selectedMemo.recipients.length > 0 && (
              <div className="flex items-center gap-2 mb-4 p-2 rounded-md bg-muted/50">
                <span className="font-semibold text-sm">To:</span>
                <span className="text-sm">{selectedMemo.recipients.join(", ")}</span>
              </div>
            )}
            <div className="prose prose-sm max-w-none">
              {selectedMemo?.content || "No content"}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}