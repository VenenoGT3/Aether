"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: "currency" | "compact" | "percentage" | "standard";
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  format = "standard",
  decimals = 0,
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10px" });
  
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
    mass: 1,
  });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (!ref.current) return;
      
      let formatted = "";
      if (format === "currency") {
        formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(latest);
      } else if (format === "compact") {
        formatted = new Intl.NumberFormat("en-US", {
          notation: latest >= 10000 ? "compact" : "standard",
          maximumFractionDigits: latest >= 10000 ? 1 : 0,
        }).format(latest);
      } else if (format === "percentage") {
        formatted = `${new Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(latest)}%`;
      } else {
        formatted = new Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(latest);
      }
      
      ref.current.textContent = formatted;
    });
  }, [springValue, format, decimals]);

  return <span ref={ref} className={className} />;
}
