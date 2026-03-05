import { ReactNode } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlatformOrgBanner } from "./PlatformOrgBanner";

interface PlatformLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function PlatformLayout({ children, title, subtitle }: PlatformLayoutProps) {
  return (
    <MainLayout>
      <PlatformOrgBanner />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </MainLayout>
  );
}
