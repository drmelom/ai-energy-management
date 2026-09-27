import { useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from 0 (or the previous value) to `to`, writing `format(v)` into the element. */
export function useCountUp(to: number, format: (n: number) => string, duration = 1.4): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || prev.current === to) { el.textContent = format(to); prev.current = to; return; }
    // first reveal counts from 0; later updates glide from the previous value
    const obj = { v: prev.current ?? 0 };
    gsap.to(obj, { v: to, duration, ease: 'expo.out', overwrite: true, onUpdate: () => { el.textContent = format(obj.v); }, onComplete: () => { prev.current = to; } });
  }, { dependencies: [to] });
  return ref;
}

/** Staggered rise-in of the direct children of `scope` (or of `selector` inside it).
 *  Runs ONCE, the first time the scope has children (or the first time `ready` is true): re-running it on
 *  data arrival would snap already-visible elements back to opacity 0, which reads as flicker. */
export function useRiseIn(scope: RefObject<HTMLElement | null>, selector = ':scope > *', ready: unknown[] = []) {
  const done = useRef(false);
  useGSAP(() => {
    if (done.current || !scope.current) return;
    const targets = scope.current.querySelectorAll(selector);
    if (!targets.length) return;
    done.current = true;
    if (prefersReducedMotion()) return;
    gsap.fromTo(targets, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out', stagger: 0.05, clearProps: 'transform,opacity,visibility' });
  }, { scope, dependencies: ready });
}

export { gsap, useGSAP };
