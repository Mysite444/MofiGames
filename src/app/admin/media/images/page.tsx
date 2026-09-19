import { MediaAdminClient } from "@/components/admin/MediaAdminClient";

export default function AdminMediaImagesPage() {
  return (
    <MediaAdminClient
      category="image"
      title="Images"
      description="General-purpose images used across the site — banners, section art, promo graphics."
      accept="image/*"
    />
  );
}
