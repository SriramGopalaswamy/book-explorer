import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ChevronDown, ChevronRight, Copy, CheckCheck, Cpu } from "lucide-react";
import { MCP_MODULES, MCP_TOTAL_TOOLS, MCP_VERSION, type McpModuleInfo, type McpToolInfo } from "@/data/mcpModules";
import { cn } from "@/lib/utils";

// ── Tool row ──────────────────────────────────────────────────────────────

function ToolRow({ tool }: { tool: McpToolInfo }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 group transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono font-semibold text-primary">{tool.name}</code>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Copy tool name"
          >
            {copied ? <CheckCheck className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tool.description}</p>
      </div>
    </div>
  );
}

// ── Module card ───────────────────────────────────────────────────────────

function ModuleCard({ mod, searchQuery }: { mod: McpModuleInfo; searchQuery: string }) {
  const [expanded, setExpanded] = useState(true);

  const filteredTools = searchQuery
    ? mod.tools.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : mod.tools;

  if (searchQuery && filteredTools.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{mod.emoji}</span>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              {mod.label}
              <Badge variant="secondary" className="text-xs">{filteredTools.length} tools</Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 line-clamp-1">{mod.description}</CardDescription>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="divide-y divide-border/50">
            {filteredTools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function MCPToolExplorer() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredModules = MCP_MODULES.filter((mod) => {
    if (activeTab !== "all" && mod.id !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        mod.label.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q) ||
        mod.tools.some((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalVisible = filteredModules.reduce((s, m) => {
    if (!search) return s + m.tools.length;
    return s + m.tools.filter(
      (t) => t.name.toLowerCase().includes(search.toLowerCase()) ||
             t.description.toLowerCase().includes(search.toLowerCase())
    ).length;
  }, 0);

  return (
    <MainLayout
      title="MCP Tool Explorer"
      subtitle="All ERP tools available to AI agents via the Model Context Protocol"
    >
      <div className="space-y-6">
        {/* Header stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Tools", value: MCP_TOTAL_TOOLS, icon: "🔧" },
            { label: "Modules", value: MCP_MODULES.length, icon: "📦" },
            { label: "Server Version", value: MCP_VERSION, icon: "🚀" },
            { label: "Transport", value: "stdio", icon: "⚡" },
          ].map(({ label, value, icon }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <div className="font-bold text-lg leading-tight">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tools by name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search && (
            <Button variant="outline" size="sm" onClick={() => setSearch("")} className="self-start">
              Clear
            </Button>
          )}
        </div>

        {search && (
          <p className="text-sm text-muted-foreground">
            {totalVisible === 0 ? "No tools match your search." : `Showing ${totalVisible} tool${totalVisible !== 1 ? "s" : ""} matching "${search}"`}
          </p>
        )}

        {/* Module tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="all" className="text-xs">
              All Modules
            </TabsTrigger>
            {MCP_MODULES.map((mod) => (
              <TabsTrigger key={mod.id} value={mod.id} className="text-xs gap-1">
                <span>{mod.emoji}</span> {mod.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <div className={cn(
              "grid gap-4",
              activeTab === "all" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-2xl"
            )}>
              {filteredModules.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} searchQuery={search} />
              ))}
            </div>

            {filteredModules.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No modules match your filter.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Usage note */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-4 pb-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">How to use these tools</p>
            <p>
              All tools are exposed via the MCP server at <code className="bg-muted px-1 rounded">mcp-server/src/server.ts</code>.
              Connect any MCP-compatible client (Claude Desktop, Cursor, n8n) using the config on the Connectors page.
              Each tool requires an <code className="bg-muted px-1 rounded">organization_id</code> (your tenant UUID) and
              valid Supabase credentials in the server environment.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
