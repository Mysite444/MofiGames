import { redirect } from "next/navigation";

// Moved under the new Reports & Moderation section, which groups User
// Reports alongside Abuse & Moderation and Copyright (they're all views
// over the same underlying table — see migration 0015). Kept as a
// redirect so any bookmarked/linked URL still lands somewhere useful.
export default function AdminUserReportsRedirectPage() {
  redirect("/admin/reports/user");
}
