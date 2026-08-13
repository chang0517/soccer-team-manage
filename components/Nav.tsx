"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./useSession";

// "멤버"(회원가입 때 입력하고 필요하면 /members에서 직접 수정 — 운영진은
// /admin에서 링크로 들어감), "전당"(랭킹 페이지 안 탭으로 통합), "운영진"
// (계정 설정 안 링크로 이동)은 더 이상 바텀 네비 탭이 아니다.
const BASE_TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/schedule", label: "일정", icon: "📅" },
  { href: "/notice", label: "게시판", icon: "📢" },
  { href: "/polls", label: "투표", icon: "🗳️" },
  { href: "/ranking", label: "랭킹", icon: "🏆" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useSession();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // 전술 시뮬레이터는 팀 맥미니의 로컬 AI 자원을 쓰기 때문에 운영진만
  // 접근할 수 있게 제한한다.
  const tabs = user?.role === "admin"
    ? [...BASE_TABS, { href: "/tactics", label: "전술", icon: "📋" }]
    : BASE_TABS;

  const doLogout = async () => {
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-zinc-200 bg-blue-900 text-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/30">
              <Image src="/logo.png" alt="Raven FC" fill sizes="32px" className="scale-110 object-cover" />
            </span>
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
                      ? "bg-blue-700 text-white"
                      : "text-blue-100 hover:bg-blue-800"
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
                    <Link
                      href="/account"
                      className="hidden text-blue-100 hover:underline sm:inline"
                    >
                      {user.displayName}님
                    </Link>
                    <Link
                      href="/account"
                      aria-label="계정 설정"
                      className="rounded-lg px-1.5 py-1.5 text-base sm:hidden"
                    >
                      ⚙️
                    </Link>
                    <button
                      onClick={doLogout}
                      className="rounded-lg bg-blue-800 px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      로그아웃
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    로그인
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
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
                  ? "font-bold text-blue-700"
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
