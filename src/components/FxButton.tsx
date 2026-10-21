"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useFx } from "@/lib/client/fx";
import { playSound, type SoundKind } from "@/lib/client/sound";

export type ButtonVariant =
  | "gold"
  | "navy"
  | "emerald"
  | "ghost"
  | "danger"
  | "key"
  | "done"
  | "doneBlue";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  gold: "btn-gold",
  navy: "btn-navy",
  emerald: "btn-emerald",
  ghost: "btn-ghost",
  danger: "btn-danger",
  key: "btn-key",
  done: "btn-done",
  doneBlue: "btn-done-blue",
};

interface FxButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** ברק רץ. ברירת מחדל: פעיל בכפתורי זהב וירוק */
  shimmer?: boolean;
  sound?: SoundKind | "none";
  /** Brief liquid-material wobble on click, only while Liquid Glass is enabled. */
  liquidWobble?: boolean;
}

/**
 * כפתור אחיד של העמדה: אדווה במגע, ברק רץ וצליל, וכולם נשלטים מהגדרות האפקטים.
 */
export const FxButton = forwardRef<HTMLButtonElement, FxButtonProps>(
  function FxButton(
    {
      variant = "ghost",
      shimmer,
      sound = "click",
      liquidWobble = false,
      className = "",
      onClick,
      onPointerDown,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const { on } = useFx();
    const withShimmer = shimmer ?? (variant === "gold" || variant === "emerald");

    const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(e);
      const el = e.currentTarget;
      if (!on("ripple") || el.disabled) return;
      const rect = el.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height) * 0.6;
      const wave = document.createElement("span");
      wave.className = "ripple-wave";
      wave.style.width = wave.style.height = `${d}px`;
      wave.style.left = `${e.clientX - rect.left - d / 2}px`;
      wave.style.top = `${e.clientY - rect.top - d / 2}px`;
      el.appendChild(wave);
      window.setTimeout(() => wave.remove(), 750);
    };

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (sound !== "none") playSound(sound);

      // Restart the short squish/refraction animation even on rapid repeated taps.
      if (liquidWobble && on("glass") && !e.currentTarget.disabled) {
        const button = e.currentTarget;
        button.classList.remove("liquid-wobble");
        void button.offsetWidth;
        button.classList.add("liquid-wobble");
        button.addEventListener(
          "animationend",
          () => button.classList.remove("liquid-wobble"),
          { once: true },
        );
      }

      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type={type}
        className={`btn ${VARIANT_CLASS[variant]} ${withShimmer ? "btn-shimmer" : ""} ${className}`}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
