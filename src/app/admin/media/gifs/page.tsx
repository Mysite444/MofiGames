import { MediaAdminClient } from "@/components/admin/MediaAdminClient";

export default function AdminMediaGifsPage() {
  return (
    <MediaAdminClient
      category="gif"
      title="GIFs"
      description="Animated GIFs used for previews, reactions, and promo content."
      accept="image/gif"
    />
  );
}
