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
      {/* DEPLOYMENT VERIFICATION MARKER - BUILD HASH CHECK */}
      <div 
        style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          background: 'red', 
          color: 'white', 
          padding: '10px', 
          zIndex: 9999,
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        BUILD VERIFICATION v{Date.now()} - FRONTEND REBUILT
      </div>
      {/* Developer Mode Banner - Only renders in developer mode */}
      <DeveloperModeBanner />
      <Sidebar />
      <div className="pl-64 transition-all duration-300">
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
