import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AnimatedPage } from "./AnimatedPage";
import { DevToolbar } from "@/components/dev/DevToolbar";
import { DeveloperModeBanner } from "@/components/dev/DeveloperModeBanner";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Developer Mode Banner - Only renders in developer mode */}
      <DeveloperModeBanner />
      <Sidebar />
      <div className="pl-64 transition-[padding] duration-300">
        <Header title={title} subtitle={subtitle} />
        <main className="p-6">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
      </div>
      {/* Dev Mode Toolbar - Only renders when DEV_MODE=true */}
      <DevToolbar />
    </div>
  );
}
