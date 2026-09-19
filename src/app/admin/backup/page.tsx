import { ContentBackupSection } from "@/components/admin/ContentBackupSection";
import { MigrationSection } from "@/components/admin/MigrationSection";

export default function AdminBackupPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Backup &amp; Migration</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Two separate tools for two separate jobs — back up your content day-to-day, or export the whole site to
          move it somewhere else.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <ContentBackupSection />
        <MigrationSection />
      </div>
    </div>
  );
}
