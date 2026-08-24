import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminSpamReportsPage() {
  return (
    <ReportsAdminClient
      title="Spam Reports"
      description="Unsolicited advertising, scams, or repeated junk content"
      kind="user"
      reason="spam"
      categoryGroup="abuse"
      defaultScope="all"
    />
  );
}
