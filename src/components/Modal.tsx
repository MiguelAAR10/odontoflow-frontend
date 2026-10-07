import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "./useFocusTrap";

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "small" | "medium" | "large";
}

export function Modal({ title, open, onClose, children, footer, size = "medium" }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, open, onClose);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={`modal modal--${size}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar modal"><X size={21} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}
