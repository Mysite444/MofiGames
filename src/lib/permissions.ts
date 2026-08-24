// Canonical list of assignable roles and the fine-grained permissions
// moderator/editor can additionally be granted, mirrored exactly by the
// check constraints in supabase/migrations/0012_user_management.sql — keep
// both in sync by hand if this ever changes (there are only 5 permissions,
// a shared reference table would be overkill).

export type StaffRole = "moderator" | "editor";
export type AnyRole = "user" | StaffRole | "admin";

export const ASSIGNABLE_ROLES: { value: AnyRole; label: string; description: string }[] = [
  { value: "user", label: "User", description: "Regular player account. No admin panel access." },
  {
    value: "moderator",
    label: "Moderator",
    description: "Community moderation — comments, bans, and reports.",
  },
  { value: "editor", label: "Editor", description: "Reviews and verifies accounts." },
  { value: "admin", label: "Admin", description: "Full access to every admin panel section." },
];

export const PERMISSIONS = [
  "ban_users",
  "verify_users",
  "manage_reports",
  "view_activity_logs",
  "moderate_comments",
  "manage_copyright",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  ban_users: { label: "Ban users", description: "Ban or unban a user's account." },
  verify_users: { label: "Verify users", description: "Grant or revoke the verified badge." },
  manage_reports: {
    label: "Manage reports",
    description: "View and resolve User Reports and Abuse & Moderation reports (spam, harassment, etc.).",
  },
  view_activity_logs: { label: "View activity logs", description: "See the account activity trail." },
  moderate_comments: { label: "Moderate comments", description: "Delete any comment across the site." },
  manage_copyright: {
    label: "Manage copyright",
    description: "View and resolve Copyright, DMCA, and counter-notice claims.",
  },
};

/** Roles whose permissions are configurable in the matrix. Admin always
 * has everything; regular users have no panel access at all. */
export const CONFIGURABLE_ROLES: StaffRole[] = ["moderator", "editor"];
