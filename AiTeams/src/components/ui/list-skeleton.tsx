
import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  count?: number;
  height?: string;
  className?: string;
}

export function ListSkeleton({ count = 5, height = "h-16", className }: ListSkeletonProps) {
  return (
    <div className={cn("space-y-2 p-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0 mt-1" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            {i % 2 === 0 && <Skeleton className="h-4 w-1/2" />}
          </div>
        </div>
      ))}
    </div>
  );
}

import { cn } from "@/lib/utils";