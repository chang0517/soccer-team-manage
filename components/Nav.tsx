"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./useSession";

const BASE_TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/schedule", label: "일정", icon: "📅" },
  { href: "/notice", label: "공지", icon: "📢" },
  { href: "/ranking", label: "랭킹", icon: "🏆" },
  { href: "/members", label: "멤버", icon: "👥" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useSession();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const tabs = user?.role === "admin"
    ? [...BASE_TABS, { href: "/admin", label: "운영진", icon: "🛠️" }]
    : BASE_TABS;

  const doLogout = async () => {
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-zinc-200 bg-emerald-900 text-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="text-lg font-extrabold tracking-wide">
              RAVEN FC
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden gap-1 md:flex">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    isActive(t.href)
                      ? "bg-emerald-700 text-white"
                      : "text-emerald-100 hover:bg-emerald-800"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            {!loading && (
              <div className="flex items-center gap-2 text-sm">
                {user ? (
                  <>
                    <span className="hidden text-emerald-100 sm:inline">
                      {user.displayName}님
                    </span>
                    <button
                      onClick={doLogout}
                      className="rounded-lg bg-emerald-800 px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      로그아웃
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    로그인
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive(t.href)
                  ? "font-bold text-emerald-700"
                  : "text-zinc-500"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
