import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "framer-motion"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-semibold tracking-tight whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-95 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
        outline:
          "border-border bg-background hover:bg-secondary/60 hover:text-foreground dark:border-border dark:bg-card dark:hover:bg-secondary/40 shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-secondary/60 hover:text-foreground dark:hover:bg-secondary/40",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10.5 gap-2 px-5 rounded-xl",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs",
        sm: "h-8.5 gap-1.5 rounded-lg px-3.5 text-xs",
        lg: "h-12 gap-2 px-6 rounded-2xl text-base",
        icon: "size-10.5 rounded-xl",
        "icon-xs": "size-7 rounded-lg",
        "icon-sm": "size-8.5 rounded-lg",
        "icon-lg": "size-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const MotionButton = motion.create(ButtonPrimitive)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <MotionButton
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.96 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
        mass: 0.8,
      }}
      {...(props as any)}
    />
  )
}

export { Button, buttonVariants }
