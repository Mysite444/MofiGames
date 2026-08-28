import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminImpersonationReportsPage() {
  return (
    <ReportsAdminClient
      title="Impersonation Reports"
      description="Pretending to be another person, brand, or staff member"
      kind="user"
      reason="impersonation"
      categoryGroup="abuse"
      defaultScope="all"
    />
  );
}
