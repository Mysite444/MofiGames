import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminAbuseReportsPage() {
  return (
    <ReportsAdminClient
      title="Abuse Reports"
      description="Every abuse report against a user, regardless of reason"
      kind="user"
      categoryGroup="abuse"
      defaultScope="all"
    />
  );
}
