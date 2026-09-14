"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppsSkillRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members/skills");
  }, [router]);
  return null;
}
