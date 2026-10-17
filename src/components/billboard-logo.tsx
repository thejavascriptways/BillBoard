import Image from "next/image";

import { cn } from "cn";

export function BillboardLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/billboard-logo.svg"
      alt=""
      width={512}
      height={512}
      unoptimized
      className={cn("size-9 shrink-0", className)}
    />
  );
}
