import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminReportQueuePage() {
  return (
    <ReportsAdminClient
      title="Report Queue"
      description="Every open case across User Reports, Abuse & Moderation, and Copyright"
      defaultScope="open"
      emptyMessage="The queue is empty — nothing needs review right now."
    />
  );
}
