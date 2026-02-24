import { ReactNode, useState, useEffect } from "react";
import { Sidebar, getSidebarCollapsed } from "./Sidebar";
import { Header } from "./Header";
import { AnimatedPage } from "./AnimatedPage";
import { MobileBottomNav } from "./MobileBottomNav";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className={`transition-[padding] duration-300 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>
        <Header title={title} subtitle={subtitle} />
        <main className="p-4 md:p-6 pb-24 md:pb-6">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
