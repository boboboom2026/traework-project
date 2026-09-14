"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppsToolsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members/tools");
  }, [router]);
  return null;
}
