import { ReactNode } from "react";
import { Header } from "./Header";
import { AnimatedPage } from "./AnimatedPage";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Thin per-page wrapper. The persistent chrome (sidebar, outer container,
 * suspense boundary, role redirects, session timeout) lives in `AppShell`
 * which wraps the entire route tree. This wrapper only renders the page's
 * sticky header and main content area so navigation no longer unmounts the
 * sidebar.
 */
export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <>
      <Header title={title} subtitle={subtitle} />
      <main
        id="main-content"
        className="p-4 md:p-6 pb-24 md:pb-6"
        role="main"
        aria-label={title}
      >
        <AnimatedPage>{children}</AnimatedPage>
      </main>
    </>
  );
}
