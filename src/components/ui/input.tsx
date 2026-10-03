import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-11 w-full rounded-xl border-2 border-border bg-[#171a20] px-4 text-sm text-foreground outline-none placeholder:text-[#8b8b8e] focus:bg-[#252931] focus:ring-2 focus:ring-gold", className)} {...props} />
));
Input.displayName = "Input";
