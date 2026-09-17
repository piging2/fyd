"use client";

import { motion, AnimatePresence } from "framer-motion";

interface PhotoPromptTransitionProps {
  prompt: string;
  className?: string;
}

/**
 * PhotoPromptTransition - Cross-fade transition for photo prompts
 * 
 * Brief (150-200ms) cross-fade between generic and contextual prompts.
 * Uses AnimatePresence for smooth transitions when prompt changes.
 */
export function PhotoPromptTransition({ prompt, className }: PhotoPromptTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={prompt}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.175 }}
        className={className}
      >
        {prompt}
      </motion.p>
    </AnimatePresence>
  );
}
