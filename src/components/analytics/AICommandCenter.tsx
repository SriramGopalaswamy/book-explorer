import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Shield,
  RefreshCw,
  Send,
  Loader2,
  Bot,
  User,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfitLoss, useBalanceSheet } from "@/hooks/useAnalytics";
import { useHRAnalytics, usePayrollSummary } from "@/hooks/useCrossModuleAnalytics";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface AIInsight {
  id: string;
  category: "anomaly" | "forecast" | "compliance" | "optimization";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  recommendation: string;
  module: string;
  confidence: number;
}

// ── Local heuristic insights (Insights tab) ───────────────────────────────

function generateLocalInsights(
  pl: ReturnType<typeof useProfitLoss>,
  bs: ReturnType<typeof useBalanceSheet>,
  hr?: { activeEmployees: number; onLeave: number; newHiresLast90Days: number } | null,
  payroll?: { totalPayrollCost: number } | null
): AIInsight[] {
  const insights: AIInsight[] = [];

  if (pl.grossMargin < 10 && pl.totalRevenue > 0) {
    insights.push({
      id: "low-margin", category: "anomaly", severity: "critical",
      title: "Critically Low Profit Margin",
      description: `Net margin is ${pl.grossMargin.toFixed(1)}%, significantly below healthy thresholds.`,
      recommendation: "Review expense categories and identify cost reduction opportunities.",
      module: "Finance", confidence: 95,
    });
  } else if (pl.grossMargin > 0 && pl.grossMargin < 20) {
    insights.push({
      id: "moderate-margin", category: "optimization", severity: "warning",
      title: "Margin Below Target",
      description: `Net margin at ${pl.grossMargin.toFixed(1)}%. Industry benchmark suggests 20–30%.`,
      recommendation: "Analyse expense-to-revenue ratios by category.",
      module: "Finance", confidence: 80,
    });
  }

  if (pl.totalExpenses > pl.totalRevenue && pl.totalRevenue > 0) {
    insights.push({
      id: "negative-income", category: "anomaly", severity: "critical",
      title: "Operating at a Loss",
      description: `Expenses (₹${(pl.totalExpenses / 100000).toFixed(1)}L) exceed revenue (₹${(pl.totalRevenue / 100000).toFixed(1)}L).`,
      recommendation: "Immediately review discretionary spending.",
      module: "Finance", confidence: 100,
    });
  }

  if (bs.totalAssets > 0 && bs.totalLiabilities > bs.totalAssets * 0.7) {
    insights.push({
      id: "high-leverage", category: "compliance", severity: "warning",
      title: "High Debt-to-Asset Ratio",
      description: `Liabilities represent ${((bs.totalLiabilities / bs.totalAssets) * 100).toFixed(0)}% of total assets.`,
      recommendation: "Consider debt restructuring or accelerating receivables collection.",
      module: "Finance", confidence: 85,
    });
  }

  if (hr) {
    if (hr.onLeave > hr.activeEmployees * 0.2 && hr.activeEmployees > 5) {
      insights.push({
        id: "high-absenteeism", category: "anomaly", severity: "warning",
        title: "Elevated Absenteeism",
        description: `${Math.round((hr.onLeave / hr.activeEmployees) * 100)}% of workforce currently on leave.`,
        recommendation: "Review leave patterns by department.",
        module: "HR", confidence: 75,
      });
    }
    if (hr.newHiresLast90Days > hr.activeEmployees * 0.3 && hr.activeEmployees > 3) {
      insights.push({
        id: "rapid-growth", category: "forecast", severity: "info",
        title: "Rapid Headcount Growth",
        description: `${hr.newHiresLast90Days} new hires in 90 days (${Math.round((hr.newHiresLast90Days / hr.activeEmployees) * 100)}% growth).`,
        recommendation: "Ensure onboarding processes scale.",
        module: "HR", confidence: 90,
      });
    }
  }

  if (payroll && pl.totalRevenue > 0) {
    const ratio = (payroll.totalPayrollCost / pl.totalRevenue) * 100;
    if (ratio > 60) {
      insights.push({
        id: "high-payroll", category: "optimization", severity: "warning",
        title: "Payroll-to-Revenue Ratio High",
        description: `Payroll costs represent ${ratio.toFixed(0)}% of total revenue.`,
        recommendation: "Evaluate workforce productivity metrics.",
        module: "Payroll", confidence: 85,
      });
    }
  }

  if (insights.length === 0 && pl.totalRevenue > 0) {
    insights.push({
      id: "healthy", category: "compliance", severity: "info",
      title: "Operations Running Smoothly",
      description: "No anomalies or compliance issues detected.",
      recommendation: "Continue monitoring. Set up automated alerts for key threshold breaches.",
      module: "System", confidence: 100,
    });
  }

  return insights;
}

const categoryIcons: Record<string, React.ReactNode> = {
  anomaly: <AlertTriangle className="h-4 w-4" />,
  forecast: <TrendingUp className="h-4 w-4" />,
  compliance: <Shield className="h-4 w-4" />,
  optimization: <Sparkles className="h-4 w-4" />,
};

const severityColors: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  critical: "border-destructive/30 bg-destructive/5",
};

const severityBadge: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
};

const SUGGESTED_PROMPTS = [
  "How is the business doing this month?",
  "Which invoices are overdue?",
  "What's the payroll-to-revenue ratio?",
  "Summarize the balance sheet health",
  "Summarize pending leave requests",
];

// ── Main component ────────────────────────────────────────────────────────

export function AICommandCenter() {
  const { session } = useAuth();

  // Insights tab
  const pl = useProfitLoss();
  const bs = useBalanceSheet();
  const { data: hr } = useHRAnalytics();
  const { data: payroll } = usePayrollSummary();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    if (!session?.access_token) {
      setError("Not authenticated. Please refresh the page.");
      return;
    }

    setError(null);
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", isStreaming: true }]);
    setIsLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              accumulated += parsed.delta.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: accumulated, isStreaming: true };
                return next;
              });
            }
          } catch { /* skip non-JSON SSE events */ }
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: accumulated, isStreaming: false };
        return next;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => {
        const next = [...prev];
        if (next[next.length - 1]?.isStreaming) next.pop();
        return next;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [messages, isLoading, session]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => {
      const next = [...prev];
      if (next[next.length - 1]?.isStreaming) next[next.length - 1] = { ...next[next.length - 1], isStreaming: false };
      return next;
    });
  };

  // Insights tab data
  const insights = generateLocalInsights(pl, bs, hr, payroll);
  const anomalies = insights.filter((i) => i.category === "anomaly");
  const forecasts = insights.filter((i) => i.category === "forecast");
  const compliance = insights.filter((i) => i.category === "compliance");
  const optimizations = insights.filter((i) => i.category === "optimization");
  const overallScore = insights.length === 0 ? 100 : Math.max(
    0,
    100 - insights.filter((i) => i.severity === "critical").length * 25
      - insights.filter((i) => i.severity === "warning").length * 10
  );

  return (
    <Tabs defaultValue="insights" className="space-y-4">
      <TabsList>
        <TabsTrigger value="insights" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Insights
        </TabsTrigger>
        <TabsTrigger value="chat" className="gap-2">
          <Bot className="h-4 w-4" /> AI Chat
        </TabsTrigger>
      </TabsList>

      {/* ── Chat tab ─────────────────────────────────────────────────── */}
      <TabsContent value="chat" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Ask about your business
              <Badge variant="outline" className="text-xs ml-auto font-mono">claude-opus-4-6</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Messages */}
            <div className="h-80 overflow-y-auto space-y-3 pr-1">
              {messages.length === 0 && (
                <div className="text-center py-6 space-y-3">
                  <Bot className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Ask anything about your finances, inventory, HR, or operations.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}>
                    {!msg.content && msg.isStreaming ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                      </span>
                    ) : (
                      <>
                        {msg.content}
                        {msg.isStreaming && <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle" />}
                      </>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-muted flex items-center justify-center mt-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Input */}
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
                className="min-h-[60px] max-h-32 resize-none text-sm"
                disabled={isLoading}
              />
              {isLoading ? (
                <Button size="sm" variant="outline" onClick={handleStop} className="h-10 w-10 p-0 flex-shrink-0" title="Stop">
                  <span className="h-3 w-3 rounded-sm bg-foreground" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => sendMessage(input)} disabled={!input.trim()} className="h-10 w-10 p-0 flex-shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>

            {messages.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => { setMessages([]); setError(null); }}>
                <RefreshCw className="h-3 w-3 mr-1" /> Clear conversation
              </Button>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Insights tab ─────────────────────────────────────────────── */}
      <TabsContent value="insights" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="lg:col-span-1">
            <CardContent className="pt-6 text-center">
              <Brain className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className={`text-3xl font-bold ${overallScore >= 70 ? "text-green-500" : overallScore >= 40 ? "text-yellow-500" : "text-destructive"}`}>
                {overallScore}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Health Score</p>
            </CardContent>
          </Card>
          {[
            { count: anomalies.length, label: "Anomalies", Icon: AlertTriangle },
            { count: forecasts.length, label: "Forecasts", Icon: TrendingUp },
            { count: compliance.length, label: "Compliance", Icon: Shield },
            { count: optimizations.length, label: "Optimizations", Icon: Sparkles },
          ].map(({ count, label, Icon }) => (
            <Card key={label}>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                  <Icon className="h-3 w-3" /> {label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Automated Insights
              <Badge variant="outline" className="text-xs">local heuristics</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Add financial records and employee data to enable automated insights.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {insights.map((insight) => (
                  <div key={insight.id} className={`rounded-lg border p-4 ${severityColors[insight.severity]}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{categoryIcons[insight.category]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-foreground">{insight.title}</h4>
                          <Badge variant="outline" className={`text-xs ${severityBadge[insight.severity]}`}>{insight.severity}</Badge>
                          <Badge variant="outline" className="text-xs">{insight.module}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">{insight.confidence}%</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                        <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50">
                          <p className="text-xs text-foreground">
                            <span className="font-medium">Recommendation:</span> {insight.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
