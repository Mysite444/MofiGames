"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Search, X, Bell, Bookmark, User, LogIn, UserPlus, LogOut, ChevronDown, Shield } from "lucide-react";
import { SidebarToggleIcon } from "./icons/SidebarToggleIcon";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { MobileActionSheet } from "./MobileActionSheet";
import { NotificationsList } from "./NotificationsList";
import { Avatar } from "./Avatar";
import { useAuth } from "@/lib/auth-context";
import { markFavoritesRead, useUnreadFavoriteCount } from "@/lib/game-library";
import { useUnreadNotificationCount, markNotificationsRead } from "@/lib/notifications";

export function Header({
  sidebarHidden,
  onToggleSidebar,
  onOpenDrawer,
}: {
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
}) {
  const { user, ready, logout } = useAuth();
  const unreadFavoriteCount = useUnreadFavoriteCount();
  const unreadNotifCount = useUnreadNotificationCount();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [desktopNotifOpen, setDesktopNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const desktopNotifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(e.target as Node)) {
        setDesktopMenuOpen(false);
        setAuthMenuOpen(false);
      }
      if (desktopNotifRef.current && !desktopNotifRef.current.contains(e.target as Node)) {
        setDesktopNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    // z-[10000] keeps the header above the NavigationLoadingOverlay (z-[9999])
    // so the hamburger button remains tappable even while a page transition
    // is in progress. Previously z-30 caused the overlay to block the button.
    <header
      className="fixed inset-x-0 top-0 z-[10000] border-b border-white/10 bg-black lg:border-b lg:border-white/10 lg:bg-[var(--color-menu-bg)]"
    >
      {/* Desktop/laptop: flush top-left toggle button, same 60px footprint as
          the collapsed sidebar rail below it (CrazyGames-style) — sits right
          in the corner instead of floating inset with the rest of the header,
          so it reads as the sidebar's own handle rather than a header icon. */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarHidden ? "Show menu" : "Hide menu"}
        aria-expanded={!sidebarHidden}
        className="absolute left-0 top-0 hidden h-14 w-[60px] items-center justify-center border-b border-r border-white/10 text-white transition-colors hover:bg-white/10 lg:flex"
      >
        <SidebarToggleIcon pointingRight={sidebarHidden} size={26} />
      </button>

      <div className="flex h-14 items-center gap-3 px-4 md:px-6 lg:pl-[76px]">
        {/* Mobile hamburger — opens the categories drawer.
            Uses a plain React onClick; touchAction:"manipulation" eliminates
            the 300 ms tap-delay on mobile without any native touchend listener.
            Previously used a dual touchend+guardedClick system with an unstable
            onOpenDrawer reference (new arrow fn on every render), which caused
            the native listener to be removed and re-added on every AppShell
            re-render and created subtle race conditions on some devices. */}
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          style={{ touchAction: "manipulation" }}
          className="rounded-lg p-2 text-white transition-colors active:bg-white/15 lg:hidden"
        >
          <Menu size={22} />
        </button>

        <Logo />

        <SearchBox className="mx-auto hidden w-full max-w-md sm:block" />

        {/* Desktop/laptop only — favorites, notifications, account. */}
        <div className="ml-auto hidden items-center gap-1 lg:flex">
          <Link
            href="/favorites"
            onClick={() => markFavoritesRead()}
            aria-label="Favorites"
            className="menu-item relative flex h-10 w-10 items-center justify-center rounded-lg text-white"
          >
            <Bookmark size={19} />
            {unreadFavoriteCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-hot px-1 text-[10px] font-bold leading-none text-white">
                {unreadFavoriteCount > 99 ? "99+" : unreadFavoriteCount}
              </span>
            )}
          </Link>

          <div ref={desktopNotifRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setDesktopNotifOpen((v) => {
                  const next = !v;
                  if (next) markNotificationsRead();
                  return next;
                });
              }}
              aria-label="Notifications"
              aria-haspopup="menu"
              aria-expanded={desktopNotifOpen}
              className="menu-item relative flex h-10 w-10 items-center justify-center rounded-lg text-white"
            >
              <Bell size={19} />
              {unreadNotifCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-hot px-1 text-[10px] font-bold leading-none text-white">
                  {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                </span>
              )}
            </button>

            {desktopNotifOpen && (
              <div className="glass-opaque absolute right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-80 overflow-y-auto rounded-xl p-2">
                <p className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-text-faint">Notifications</p>
                <NotificationsList onNavigate={() => setDesktopNotifOpen(false)} />
              </div>
            )}
          </div>

          <div ref={desktopMenuRef} className="relative">
            {!ready ? (
              <div className="h-9 w-9 rounded-full bg-white/5" aria-hidden />
            ) : user ? (
              <>
                <button
                  type="button"
                  onClick={() => setDesktopMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={desktopMenuOpen}
                  className="menu-item flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-white"
                >
                  <Avatar name={user.name} size={32} />
                  <span className="max-w-[120px] truncate text-sm font-semibold">{user.name}</span>
                  <ChevronDown size={15} className={`shrink-0 transition-transform ${desktopMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {desktopMenuOpen && (
                  <div className="glass-opaque absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl py-1.5">
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                      <Avatar name={user.name} size={34} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                        <p className="truncate text-xs text-text-faint">{user.email}</p>
                      </div>
                    </div>
                    <div className="my-1 border-t border-white/10" />
                    <Link
                      href="/profile"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <User size={16} />
                      My Profile
                    </Link>
                    {user.isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setDesktopMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                      >
                        <Shield size={16} />
                        Admin Panel
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setDesktopMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-hot transition-colors hover:bg-white/10"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={authMenuOpen}
                  className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-3.5 py-2 text-sm font-bold text-white active:scale-[0.98]"
                >
                  <LogIn size={16} />
                  Log In
                  <ChevronDown size={15} className={`shrink-0 transition-transform ${authMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {authMenuOpen && (
                  <div className="glass-opaque absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl py-1.5">
                    <Link
                      href="/login"
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <LogIn size={16} />
                      Log In
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <UserPlus size={16} />
                      Sign Up
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile only — search, notifications, account. */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
            style={{ touchAction: "manipulation" }}
            className="rounded-lg p-2 text-text-muted transition-colors active:bg-white/15 active:text-white sm:hidden"
          >
            {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>

          <button
            type="button"
            onClick={() => {
              setNotifOpen(true);
              markNotificationsRead();
            }}
            aria-label="Notifications"
            style={{ touchAction: "manipulation" }}
            className="relative rounded-lg p-2 text-text-muted transition-colors active:bg-white/15 active:text-white"
          >
            <Bell size={20} />
            {unreadNotifCount > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hot text-[9px] font-bold leading-none text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label="Account"
            style={{ touchAction: "manipulation" }}
            className="rounded-lg p-1.5 text-text-muted transition-colors active:bg-white/15 active:text-white"
          >
            {user ? <Avatar name={user.name} size={26} /> : <User size={20} />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="border-t border-white/10 p-3 sm:hidden">
          <SearchBox autoFocus onNavigate={() => setMobileSearchOpen(false)} />
        </div>
      )}

      <MobileActionSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        icon={<Bell size={17} />}
      >
        <NotificationsList onNavigate={() => setNotifOpen(false)} />
      </MobileActionSheet>

      <MobileActionSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={user ? "My Account" : "Guest session"}
        icon={user ? <Avatar name={user.name} size={17} /> : <User size={17} />}
      >
        {user ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-text-faint">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/profile"
                onClick={() => setAccountOpen(false)}
                className="glow-yellow-button flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white active:scale-[0.98]"
              >
                <User size={16} />
                View Profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setAccountOpen(false);
                }}
                className="glass flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-hot"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              You&apos;re playing as a guest, so favorites and game progress won&apos;t be saved on
              this device. Sign in or create a free account to fix that.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setAccountOpen(false)}
                className="glow-yellow-button flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white active:scale-[0.98]"
              >
                <LogIn size={16} />
                Log In
              </Link>
              <Link
                href="/signup"
                onClick={() => setAccountOpen(false)}
                className="glass flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white"
              >
                <UserPlus size={16} />
                Create Account
              </Link>
            </div>
          </>
        )}
      </MobileActionSheet>
    </header>
  );
}
