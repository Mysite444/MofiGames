import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminReportHistoryPage() {
  return (
    <ReportsAdminClient
      title="Report History"
      description="Resolved and rejected cases across every report kind"
      defaultScope="closed"
      emptyMessage="No resolved or rejected reports yet."
    />
  );
}
