import { redirect } from "next/navigation";

// 이 앱은 조끼 GPS 경기 분석 하나만 다룬다. 첫 화면은 분석 목록이다.
export default function HomePage() {
  redirect("/gps");
}
