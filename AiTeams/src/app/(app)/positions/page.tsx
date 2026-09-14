"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PositionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members/positions");
  }, [router]);
  return null;
}
