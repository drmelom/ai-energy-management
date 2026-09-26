import { useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from 0 (or the previous value) to `to`, writing `format(v)` into the element. */
export function useCountUp(to: number, format: (n: number) => string, duration = 0.9): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) { el.textContent = format(to); prev.current = to; return; }
    const obj = { v: prev.current };
    gsap.to(obj, { v: to, duration, ease: 'power2.out', onUpdate: () => { el.textContent = format(obj.v); }, onComplete: () => { prev.current = to; } });
  }, { dependencies: [to] });
  return ref;
}

/** Staggered rise-in of the direct children of `scope` (or of `selector` inside it). */
export function useRiseIn(scope: RefObject<HTMLElement | null>, selector = ':scope > *', deps: unknown[] = []) {
  useGSAP(() => {
    if (prefersReducedMotion() || !scope.current) return;
    gsap.from(scope.current.querySelectorAll(selector), { y: 10, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.06, clearProps: 'transform,opacity' });
  }, { scope, dependencies: deps });
}

export { gsap, useGSAP };
