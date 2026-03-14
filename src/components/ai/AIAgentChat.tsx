import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Sparkles, X, Maximize2, Minimize2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  "Show me today's dashboard metrics",
  "List all overdue invoices",
  "How many employees are on leave today?",
  "Give me a financial summary for this month",
  "Analyze our company's financial health",
  "Show me low-stock inventory items",
];

export function AIAgentChat() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = useCallback(async (allMessages: Message[]) => {
    if (!session?.access_token) {
      toast.error("Please sign in to use the AI agent.");
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (resp.status === 429) {
      toast.error("Rate limit exceeded. Please wait a moment.");
      throw new Error("Rate limited");
    }
    if (resp.status === 402) {
      toast.error("AI credits exhausted. Add credits in workspace settings.");
      throw new Error("Credits exhausted");
    }
    if (!resp.ok || !resp.body) {
      // Try non-streaming fallback
      const errorText = await resp.text();
      let parsed: { content?: string; error?: string } = {};
      try { parsed = JSON.parse(errorText); } catch { /* ignore */ }
      if (parsed.content) return parsed.content;
      throw new Error(parsed.error || `Request failed: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            fullContent += content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: fullContent } : m);
              }
              return [...prev, { id: crypto.randomUUID(), role: "assistant", content: fullContent, timestamp: new Date() }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Flush remaining
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            fullContent += content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: fullContent } : m);
              }
              return [...prev, { id: crypto.randomUUID(), role: "assistant", content: fullContent, timestamp: new Date() }];
            });
          }
        } catch { /* ignore */ }
      }
    }

    return fullContent;
  }, [session?.access_token]);

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const allMessages = [...messages, userMsg];
      const result = await streamChat(allMessages);

      // If non-streaming fallback returned content directly
      if (typeof result === "string" && result) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return prev;
          return [...prev, { id: crypto.randomUUID(), role: "assistant", content: result, timestamp: new Date() }];
        });
      }
    } catch (e) {
      console.error("AI Agent error:", e);
      const errorMsg = (e as Error).message;
      if (!errorMsg.includes("Rate limited") && !errorMsg.includes("Credits exhausted")) {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm sorry, I couldn't complete that request. The AI service may be temporarily unavailable. Please try again in a moment. If this persists, contact your administrator.",
          timestamp: new Date(),
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, streamChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className={`fixed z-50 shadow-2xl border-primary/20 flex flex-col transition-all duration-300 ${
      isExpanded
        ? "inset-4 rounded-2xl"
        : "bottom-6 right-6 w-[420px] h-[600px] rounded-2xl"
    }`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">GRX10 AI Agent</CardTitle>
            <p className="text-xs text-muted-foreground">ERP Intelligence Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/30">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Live
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-4 py-6">
              <div className="text-center">
                <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">Hi! I'm your ERP AI agent.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  I can query your data, analyze trends, and take actions across all modules.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground px-1">Try asking:</p>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 hover:bg-accent hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-foreground border border-border/30"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>table]:text-xs">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-muted/60 rounded-xl px-4 py-3 border border-border/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing your data...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about invoices, employees, finances..."
              className="min-h-[40px] max-h-[120px] resize-none text-sm border-muted"
              rows={1}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Powered by GRX10 AI · All actions are audited
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
