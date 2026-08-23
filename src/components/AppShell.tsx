"use client";

import { useCallback, useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { HeaderAdSlot } from "./HeaderAdSlot";
import { FooterAdSlot } from "./FooterAdSlot";
import { StickyAdSlot } from "./StickyAdSlot";
import type { AdPlacementConfig } from "./AdUnit";

export function AppShell({
  children,
  adSettings,
}: {
  children: React.ReactNode;
  /** Passed down from the server (RootLayout → getAdSettings()) since
   * AppShell itself is a client component. Optional so existing tests/
   * usages that don't pass it still render (just with every sitewide ad
   * placement off). */
  adSettings?: {
    header: AdPlacementConfig;
    footer: AdPlacementConfig;
    sticky: AdPlacementConfig;
    stickyPosition: "top" | "bottom";
    stickyDismissible: boolean;
    adsenseClientId: string | null;
    adsenseReady: boolean;
  };
}) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Stable references — inline arrow functions re-create on every render,
  // which caused Header's useEffect (depending on onOpenDrawer) to
  // remove and re-attach the touchend listener on every AppShell render.
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarHidden((v) => !v), []);

  const OFF: AdPlacementConfig = { enabled: false, slotId: null, code: null };
  const ads = adSettings ?? {
    header: OFF,
    footer: OFF,
    sticky: OFF,
    stickyPosition: "bottom" as const,
    stickyDismissible: true,
    adsenseClientId: null,
    adsenseReady: false,
  };

  return (
    <div className="min-h-screen">
      <Header
        sidebarHidden={sidebarHidden}
        onToggleSidebar={toggleSidebar}
        onOpenDrawer={openDrawer}
      />
      {/* Sidebar is a hover-expand overlay — it never pushes content, so main's
          padding only needs to reserve space for the collapsed icon-rail. */}
      <Sidebar hidden={sidebarHidden} />
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} />

      <main
        id="top"
        style={{ "--sidebar-rail": sidebarHidden ? "0px" : "60px" } as React.CSSProperties}
        className={`min-h-screen pb-6 pt-[calc(3.5rem+0.75rem)] transition-[padding] duration-200 lg:pb-10 lg:pt-[calc(3.5rem+1.25rem)] ${
          sidebarHidden ? "lg:pl-0" : "lg:pl-[60px]"
        }`}
      >
        <HeaderAdSlot
          config={ads.header}
          adsenseClientId={ads.adsenseClientId}
          adsenseReady={ads.adsenseReady}
        />

        {children}

        <FooterAdSlot
          config={ads.footer}
          adsenseClientId={ads.adsenseClientId}
          adsenseReady={ads.adsenseReady}
        />
      </main>

      <StickyAdSlot
        config={ads.sticky}
        position={ads.stickyPosition}
        dismissible={ads.stickyDismissible}
        adsenseClientId={ads.adsenseClientId}
        adsenseReady={ads.adsenseReady}
      />
    </div>
  );
}
