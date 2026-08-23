import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminCopyrightRequestsPage() {
  return (
    <ReportsAdminClient
      title="Copyright Requests"
      description="General copyright concerns that aren't formal DMCA takedowns"
      kind="copyright"
      categoryGroup="copyright"
      defaultScope="open"
      allowCreate
    />
  );
}
