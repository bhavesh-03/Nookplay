import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-foreground text-sm font-black uppercase tracking-wide shadow-[4px_4px_0_#ff7da8] transition-all hover:-translate-y-0.5 hover:shadow-[5px_6px_0_#ff7da8] active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-45", {
  variants: {
    variant: {
      default: "bg-primary text-[#17191f] hover:bg-[#ff9bbc]",
      outline: "bg-card text-foreground hover:bg-[#343b48]",
      ghost: "border-transparent bg-transparent text-foreground shadow-none hover:bg-white/10 hover:shadow-none",
      gold: "bg-gold text-[#17191f] hover:bg-[#ffeb9a]"
    },
    size: {
      default: "h-11 px-5",
      sm: "h-9 px-3",
      lg: "h-12 px-6",
      icon: "h-10 w-10"
    }
  },
  defaultVariants: { variant: "default", size: "default" }
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
