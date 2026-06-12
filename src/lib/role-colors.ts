// Centralized color classes for member role badges.
// Uses semantic tokens from src/styles.css.
export function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r === "owner" || r === "club_admin" || r === "admin") {
    return "bg-primary text-primary-foreground hover:bg-primary/90";
  }
  if (r === "coach") {
    return "bg-accent text-accent-foreground hover:bg-accent/90";
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
  return role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ");
}
