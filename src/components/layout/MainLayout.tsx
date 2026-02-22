import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AnimatedPage } from "./AnimatedPage";
import { MobileBottomNav } from "./MobileBottomNav";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-64 transition-[padding] duration-300">
        <Header title={title} subtitle={subtitle} />
        <main className="p-4 md:p-6 pb-24 md:pb-6">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
