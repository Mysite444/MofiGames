import { ReportsAdminClient } from "@/components/admin/ReportsAdminClient";

export default function AdminCounterNoticesPage() {
  return (
    <ReportsAdminClient
      title="Counter-Notices"
      description="Responses disputing a prior DMCA takedown"
      kind="counter_notice"
      categoryGroup="copyright"
      defaultScope="open"
      allowCreate
    />
  );
}
