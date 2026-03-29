import type { Transition, Variants } from "framer-motion";

export const motionTransition = {
  gentle: {
    type: "spring",
    stiffness: 210,
    damping: 24,
    mass: 0.9,
  } satisfies Transition,
  snappy: {
    type: "spring",
    stiffness: 280,
    damping: 22,
    mass: 0.8,
  } satisfies Transition,
  panel: {
    type: "spring",
    stiffness: 190,
    damping: 26,
    mass: 1,
  } satisfies Transition,
  modal: {
    type: "spring",
    stiffness: 240,
    damping: 24,
    mass: 0.92,
  } satisfies Transition,
  soft: {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1],
  } satisfies Transition,
} as const;

export const motionVariants = {
  fadeUp: {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: motionTransition.gentle },
  } satisfies Variants,
  softScale: {
    hidden: { opacity: 0, scale: 0.975, y: 10 },
    show: { opacity: 1, scale: 1, y: 0, transition: motionTransition.panel },
  } satisfies Variants,
  panel: {
    hidden: { opacity: 0, x: 18, scale: 0.985 },
    show: { opacity: 1, x: 0, scale: 1, transition: motionTransition.panel },
    exit: {
      opacity: 0,
      x: 14,
      scale: 0.985,
      transition: motionTransition.soft,
    },
  } satisfies Variants,
  overlay: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: motionTransition.soft },
    exit: { opacity: 0, transition: { duration: 0.18 } },
  } satisfies Variants,
} as const;

export function createStaggeredList(staggerChildren = 0.07): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren,
        delayChildren: 0.02,
      },
    },
  };
}

export function getHoverLift(
  reducedMotion: boolean | null | undefined,
  options: { y?: number; scale?: number } = {},
) {
  if (reducedMotion) {
    return undefined;
  }

  return {
    y: options.y ?? -4,
    scale: options.scale ?? 1.01,
  };
}

export function getTapScale(
  reducedMotion: boolean | null | undefined,
  scale = 0.985,
) {
  if (reducedMotion) {
    return undefined;
  }

  return { scale };
}

export function getFloatingAnimation(
  reducedMotion: boolean | null | undefined,
  distance = 3,
) {
  if (reducedMotion) {
    return {};
  }

  return { y: [0, -distance, 0] };
}

export function getFloatingTransition(
  reducedMotion: boolean | null | undefined,
  duration = 2.6,
  repeatDelay = 4,
): Transition {
  if (reducedMotion) {
    return { duration: 0 };
  }

  return {
    duration,
    repeat: Infinity,
    repeatDelay,
    ease: "easeInOut",
  };
}
