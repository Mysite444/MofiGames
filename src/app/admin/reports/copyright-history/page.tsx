import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminCopyrightHistoryPage() {
  return (
    <ReportsAdminClient
      title="Copyright Claim History"
      description="Resolved and rejected copyright claims, DMCA takedowns, and counter-notices"
      kind="copyright_all"
      categoryGroup="copyright"
      defaultScope="closed"
      emptyMessage="No resolved or rejected copyright claims yet."
    />
  );
}
