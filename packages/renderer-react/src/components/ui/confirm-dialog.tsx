/**
 * ConfirmDialog - In-DOM confirmation dialog (replaces window.confirm)
 * Keeps focus within the renderer to avoid Windows focus loss after native dialogs.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { getTapScale, motionTransition, motionVariants } from "@/lib/motion";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const finalConfirmLabel = confirmLabel || t("actions.confirm");
  const finalCancelLabel = cancelLabel || t("actions.cancel");

  useEffect(() => {
    if (open && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial="hidden"
          animate="show"
          exit="exit"
          variants={motionVariants.overlay}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onKeyDown={handleKeyDown}
        >
          <motion.div
            initial="hidden"
            animate="show"
            exit="exit"
            variants={motionVariants.softScale}
            transition={motionTransition.modal}
            className={cn(
              "mx-4 max-w-md rounded-[28px] border border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-xl",
              "focus:outline-none",
            )}
            tabIndex={-1}
          >
            <h2 id="confirm-dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <motion.div whileTap={getTapScale(prefersReducedMotion)}>
                <Button
                  ref={cancelRef}
                  variant="outline"
                  onClick={onCancel}
                  className="rounded-full border-border/70 bg-background/70 shadow-none"
                >
                  {finalCancelLabel}
                </Button>
              </motion.div>
              <motion.div whileTap={getTapScale(prefersReducedMotion)}>
                <Button
                  variant={
                    variant === "destructive" ? "destructive" : "default"
                  }
                  onClick={onConfirm}
                  className="rounded-full shadow-none"
                >
                  {finalConfirmLabel}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
