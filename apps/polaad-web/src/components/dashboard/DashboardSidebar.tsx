"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  Landmark,
  ReceiptText,
  LogOut,
  ChevronsUpDown,
  ChevronLeft,
} from "lucide-react";

import styles from "./DashboardSidebar.module.css";

/* ── Primary nav ─────────────────────────────── */
const PRIMARY_NAV = [
  { href: "/bank-statements", label: "Statements", icon: ReceiptText },
  { href: "/tally-prime", label: "Tally", icon: Landmark },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface UserInfo {
  name: string;
  email: string;
}

export interface DashboardSidebarProps {
  user?: UserInfo;
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const userRowRef = useRef<HTMLDivElement>(null);

  const displayUser: UserInfo = user ?? {
    name: "Admin",
    email: "admin@polaad.local",
  };

  const initials = displayUser.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      {/* ── BRAND ── */}
      <div className={`${styles.brandRow} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.brandLeft}>
          <div className={styles.brandLogoMark}>P</div>
          <span className={styles.brandTitle}>Polaad</span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={styles.collapseBtn}
          type="button"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── PRIMARY NAVIGATION ── */}
      <nav className={styles.navSection}>
        <ul className={styles.navList} role="list">
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                >
                  <div className={styles.navItemLeft}>
                    {active && <div className={styles.activeBar} />}
                    <Icon className={styles.navIcon} />
                    <span className={styles.navTitle}>{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          <li className={styles.mobileLogoutItem}>
            <form action="/auth/signout" method="post">
              <button type="submit" className={`${styles.navItem} ${styles.mobileLogoutButton}`}>
                <div className={styles.navItemLeft}>
                  <LogOut className={styles.navIcon} />
                  <span className={styles.navTitle}>Logout</span>
                </div>
              </button>
            </form>
          </li>
        </ul>
      </nav>

      <div className={styles.spacer} />

      {/* ── USER ROW (opens popover) ── */}
      <div className={styles.userRowWrapper} ref={userRowRef}>
        {/* Logout Popover */}
        {popoverOpen && (
          <>
            {/* Backdrop to close */}
            <div
              className={styles.popoverBackdrop}
              onClick={() => setPopoverOpen(false)}
            />
            <div className={styles.popover}>
              <div className={styles.popoverHeader}>
                <div className={styles.popoverUserAvatar}>{initials}</div>
                <div className={styles.popoverUserInfo}>
                  <div className={styles.popoverUserName}>{displayUser.name}</div>
                  <div className={styles.popoverUserEmail}>{displayUser.email}</div>
                </div>
              </div>
              
              <div className={styles.popoverFooter}>
                <form action="/auth/signout" method="post" className="w-full">
                  <button type="submit" className={styles.popoverLogoutBtn}>
                    <LogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        <div
          className={styles.userRow}
          onClick={() => setPopoverOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setPopoverOpen((o) => !o)}
          aria-expanded={popoverOpen}
          aria-haspopup="true"
        >
          <div className={styles.userLeft}>
            <div className={styles.userAvatar}>{initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{displayUser.name}</span>
              <span className={styles.userEmail}>{displayUser.email}</span>
            </div>
          </div>
          <ChevronsUpDown size={14} className={styles.userChevron} />
        </div>
      </div>
    </aside>
  );
}
