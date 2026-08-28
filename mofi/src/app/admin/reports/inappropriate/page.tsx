import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminInappropriateContentReportsPage() {
  return (
    <ReportsAdminClient
      title="Inappropriate Content Reports"
      description="Content unsuitable for the platform (sexual, violent, etc.)"
      kind="user"
      reason="inappropriate_content"
      categoryGroup="abuse"
      defaultScope="all"
    />
  );
}
