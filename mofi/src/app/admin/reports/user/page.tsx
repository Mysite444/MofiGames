import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminUserReportsPage() {
  return (
    <ReportsAdminClient
      title="User Reports"
      description="Reports filed by users against other users, games, or comments"
      kind="user"
      categoryGroup="abuse"
      defaultScope="all"
      allowCreate
    />
  );
}
