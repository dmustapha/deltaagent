import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  triggerOnce?: boolean;
}

export function useIntersectionObserver(
  ref: RefObject<Element | null>,
  { threshold = 0.15, triggerOnce = true }: UseIntersectionObserverOptions = {},
): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (triggerOnce && hasTriggered.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setIsVisible(true);
                hasTriggered.current = true;
                if (triggerOnce) observer.unobserve(entry.target);
              });
            });
          } else if (!triggerOnce) {
            setIsVisible(false);
          }
        });
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, triggerOnce]);

  return isVisible;
}
