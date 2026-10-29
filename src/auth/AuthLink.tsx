import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

const authLinkCls =
  "w-fit rounded-sm text-body underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** Single link style for every auth-pattern link (text-colored, underlined, visible focus). */
export function AuthLink({ className, ...props }: LinkProps) {
  return <Link className={cn(authLinkCls, className)} {...props} />;
}
