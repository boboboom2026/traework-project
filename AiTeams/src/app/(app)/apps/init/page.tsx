"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppsInitRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members");
  }, [router]);
  return null;
}
