// Centralized color classes for member role badges.
export function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r === "owner" || r === "club_admin" || r === "admin") {
    return "bg-[#E63329] text-white hover:bg-[#c0392b]";
  }
  if (r === "coach") {
    return "bg-blue-600 text-white hover:bg-blue-700";
  }
  if (r === "assistant_coach") {
    return "bg-purple-600 text-white hover:bg-purple-700";
  }
  if (r === "member") {
    return "bg-gray-200 text-gray-700 hover:bg-gray-300";
  }
  if (r === "guest") {
    return "bg-gray-100 text-gray-500 hover:bg-gray-200";
  }
  if (r === "driver") {
    return "bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }
  if (r === "crew") {
    return "bg-success text-success-foreground hover:bg-success/90";
  }
  if (r === "patient") {
    return "bg-warning text-warning-foreground hover:bg-warning/90";
  }
  return "bg-muted text-muted-foreground hover:bg-muted/80";
}

export function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "club_admin") return "Admin";
  if (r === "assistant_coach") return "Asst. Coach";
  return role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ");
}
