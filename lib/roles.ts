// 이 이름으로 가입하면 자동으로 운영진(admin) 권한이 배정된다.
// 승인은 여전히 필요하고, 승인 화면에서 운영진이 역할을 바꿀 수도 있다.
export const ADMIN_NAMES = [
  "장현민",
  "장정훈",
  "엄현진",
  "임성환",
  "김성훈",
  "박태남",
  "정동현",
];

export function isWhitelistedAdminName(displayName: string): boolean {
  return ADMIN_NAMES.includes(displayName.trim());
}
