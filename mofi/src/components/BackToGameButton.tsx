"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function BackToGameButton({ targetId }: { targetId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <a
      href={`#${targetId}`}
      aria-hidden={!visible}
      className={`btn-cta fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-2 py-3 text-sm transition-all duration-200 lg:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ArrowUp size={16} strokeWidth={2.5} />
      Back to Game
    </a>
  );
}
