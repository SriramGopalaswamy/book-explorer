import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Brain, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIChat, ChatMessage } from "@/hooks/useAIInsights";
import ReactMarkdown from "react-markdown";

export function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage, clearMessages } = useAIChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="h-14 w-14 rounded-full bg-primary shadow-lg shadow-primary/30 hover:bg-primary/90 p-0"
            >
              <Brain className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] max-h-[80vh] rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">CFO AI</h3>
                  <p className="text-[10px] text-muted-foreground">Blunt. Data-driven. No fluff.</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearMessages}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-primary/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Ask me anything about your business data.
                  </p>
                  <div className="space-y-2">
                    {[
                      "What's burning cash the fastest?",
                      "Are we collecting receivables on time?",
                      "How efficient is our headcount vs revenue?",
                      "Give me a brutally honest state of the business",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-foreground hover:bg-primary/10 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Analyzing data...</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask the CFO AI..."
                  className="flex-1 bg-muted/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="h-10 w-10 rounded-xl shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted/50 text-foreground rounded-bl-md border border-border/30"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
