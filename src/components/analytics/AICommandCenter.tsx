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
import ReactMarkdown from "react-markdown";

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
  "Are any inventory items low on stock?",
  "Summarize pending leave requests",
];

// ── Main component ────────────────────────────────────────────────────────

export function AICommandCenter() {
  const { session } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: insights, isLoading, error } = useQuery<AIInsight[]>({
    queryKey: ["ai-command-center-insights", refreshKey],
    queryFn: async () => {
      if (!session?.access_token) return [];

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Analyze our organization's data across Finance, HR, and Payroll. Use the generate_ai_insights tool first to gather data, then provide structured insights.

For each finding, categorize it as one of: anomaly, forecast, compliance, optimization.
Rate severity as: critical, warning, or info.
Assign a confidence percentage.

Return your analysis as a JSON array (wrapped in a markdown code block with \`\`\`json) with objects containing: category, severity, title, description, recommendation, module, confidence.

Be specific with numbers and percentages. Do not fabricate data.`,
          }],
          stream: false,
        }),
      });

      if (!resp.ok) {
        console.error("AI insights fetch failed:", resp.status);
        return [];
      }

      const result = await resp.json();
      const content = result.content || "";

      // Parse JSON from markdown code block
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          return (Array.isArray(parsed) ? parsed : []).map((item: Partial<AIInsight>, i: number) => ({
            id: `ai-${i}-${Date.now()}`,
            category: item.category || "optimization",
            severity: item.severity || "info",
            title: item.title || "Insight",
            description: item.description || "",
            recommendation: item.recommendation || "",
            module: item.module || "System",
            confidence: item.confidence || 70,
          }));
        } catch {
          console.warn("Failed to parse AI insights JSON");
        }
      }

      // Fallback: return raw content as a single insight
      if (content.trim()) {
        return [{
          id: "ai-narrative",
          category: "optimization" as const,
          severity: "info" as const,
          title: "AI Analysis",
          description: content.slice(0, 500),
          recommendation: content.length > 500 ? content.slice(500) : "Review the analysis above.",
          module: "System",
          confidence: 80,
        }];
      }

      return [];
    },
    enabled: !!session?.access_token,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  const displayInsights = insights || [];
  const anomalies = displayInsights.filter((i) => i.category === "anomaly");
  const forecasts = displayInsights.filter((i) => i.category === "forecast");
  const compliance = displayInsights.filter((i) => i.category === "compliance");
  const optimizations = displayInsights.filter((i) => i.category === "optimization");

  const overallScore = displayInsights.length === 0
    ? 100
    : Math.max(
        0,
        100 -
          displayInsights.filter((i) => i.severity === "critical").length * 25 -
          displayInsights.filter((i) => i.severity === "warning").length * 10
      );

  return (
    <Tabs defaultValue="chat" className="space-y-4">
      <TabsList>
        <TabsTrigger value="chat" className="gap-2">
          <Bot className="h-4 w-4" /> AI Chat
        </TabsTrigger>
        <TabsTrigger value="insights" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Insights
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
              {isLoading ? (
                <Skeleton className="h-8 w-12 mx-auto" />
              ) : (
                <div className={`text-3xl font-bold ${overallScore >= 70 ? "text-green-500" : overallScore >= 40 ? "text-yellow-500" : "text-destructive"}`}>
                  {overallScore}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">AI Health Score</p>
            </CardContent>
          </Card>

        {[
          { label: "Anomalies", count: anomalies.length, icon: <AlertTriangle className="h-3 w-3" /> },
          { label: "Forecasts", count: forecasts.length, icon: <TrendingUp className="h-3 w-3" /> },
          { label: "Compliance", count: compliance.length, icon: <Shield className="h-3 w-3" /> },
          { label: "Optimizations", count: optimizations.length, icon: <Sparkles className="h-3 w-3" /> },
        ].map(({ label, count, icon }) => (
          <Card key={label}>
            <CardContent className="pt-6 text-center">
              {isLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : <div className="text-2xl font-bold">{count}</div>}
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                {icon} {label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI-Powered Insights
            <Badge variant="outline" className="text-[10px] ml-2 bg-primary/5 border-primary/20">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Live AI
            </Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            {isLoading ? "Analyzing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 mt-1" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Failed to load AI insights. Click Refresh to try again.</p>
            </div>
          ) : displayInsights.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No data available for analysis. Add financial records and employee data to enable AI insights.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-lg border p-4 ${severityColors[insight.severity]}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {categoryIcons[insight.category]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{insight.title}</h4>
                        <Badge variant="outline" className={`text-xs ${severityBadge[insight.severity]}`}>
                          {insight.severity}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {insight.module}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {insight.confidence}% confidence
                        </span>
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
