import { useEffect, useState, useRef } from 'react';

interface UseCountUpOptions {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trigger?: boolean;
}

export function useCountUp({
  target,
  duration = 1400,
  prefix = '',
  suffix = '',
  decimals = 0,
  trigger = true,
}: UseCountUpOptions): string {
  const [displayValue, setDisplayValue] = useState(`${prefix}0${suffix}`);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!trigger || hasAnimated.current) return;
    hasAnimated.current = true;

    const start = performance.now();

    function step(timestamp: number) {
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (decimals > 0) {
        setDisplayValue(`${prefix}${current.toFixed(decimals)}${suffix}`);
      } else {
        setDisplayValue(
          `${prefix}${Math.round(current).toLocaleString('en-US')}${suffix}`,
        );
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [trigger, target, duration, prefix, suffix, decimals]);

  return displayValue;
}
