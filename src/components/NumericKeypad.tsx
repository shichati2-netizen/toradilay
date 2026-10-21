"use client";

import { ArrowLeft, Delete, RotateCcw } from "lucide-react";
import { FxButton } from "./FxButton";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const KEY_H = "h-[clamp(50px,8vh,70px)]";

export function NumericKeypad({
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  disabled = false,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  // מניעת גניבת פוקוס מהדף בעת לחיצה
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="grid w-full select-none grid-cols-3 gap-2.5" dir="ltr">
      {DIGITS.map((d) => (
        <FxButton
          key={d}
          variant="key"
          sound="key"
          liquidWobble
          disabled={disabled}
          onMouseDown={keep}
          onClick={() => onDigit(d)}
          className={`${KEY_H} font-mono text-3xl`}
        >
          {d}
        </FxButton>
      ))}

      <FxButton
        variant="ghost"
        sound="clear"
        disabled={disabled}
        onMouseDown={keep}
        onClick={onClear}
        className={`${KEY_H} flex-col gap-0.5 text-xs`}
      >
        <RotateCcw className="h-4 w-4 text-gold-300" />
        <span dir="rtl">איפוס</span>
      </FxButton>

      <FxButton
        variant="key"
        sound="key"
        liquidWobble
        disabled={disabled}
        onMouseDown={keep}
        onClick={() => onDigit("0")}
        className={`${KEY_H} font-mono text-3xl`}
      >
        0
      </FxButton>

      <FxButton
        variant="ghost"
        sound="delete"
        disabled={disabled}
        onMouseDown={keep}
        onClick={onBackspace}
        className={`${KEY_H} flex-col gap-0.5 text-xs`}
      >
        <Delete className="h-4 w-4 text-gold-300" />
        <span dir="rtl">מחיקה</span>
      </FxButton>

      <div className="col-span-3 pt-1" dir="rtl">
        <FxButton
          variant="gold"
          disabled={disabled}
          onMouseDown={keep}
          onClick={onSubmit}
          className="h-[clamp(52px,7.6vh,64px)] w-full text-lg"
        >
          <span>איתור תיקייה ופתיחת קבצים</span>
          <ArrowLeft className="h-5 w-5" />
        </FxButton>
      </div>
    </div>
  );
}
