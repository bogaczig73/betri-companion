import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-14 w-3/5 self-start rounded-2xl" />
      <Skeleton className="h-14 w-3/5 self-end rounded-2xl" />
      <Skeleton className="h-10 w-2/5 self-start rounded-2xl" />
      <Skeleton className="h-14 w-3/5 self-end rounded-2xl" />
      <Skeleton className="mt-4 h-20 w-full rounded-xl" />
    </div>
  );
}
