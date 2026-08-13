"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 명예의 전당은 이제 "랭킹" 페이지 안의 탭으로 통합됐다. 기존에 저장된
// 링크·북마크가 죽지 않도록 이 경로는 리다이렉트만 한다.
export default function HallOfFameRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ranking");
  }, [router]);
  return null;
}
