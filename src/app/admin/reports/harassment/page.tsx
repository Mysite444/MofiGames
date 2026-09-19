import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminHarassmentReportsPage() {
  return (
    <ReportsAdminClient
      title="Harassment / Hate Speech Reports"
      description="Targeted harassment, threats, or hateful conduct"
      kind="user"
      reason="harassment"
      categoryGroup="abuse"
      defaultScope="all"
    />
  );
}
