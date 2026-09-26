import { useEffect, useState } from 'react';
import { CheckCircle2, Info, Loader2, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** shadcn-style Toaster without next-themes: follows the `dark` class on <html>. */
export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      icons={{ success: <CheckCircle2 className="size-4" />, info: <Info className="size-4" />, warning: <TriangleAlert className="size-4" />, error: <OctagonAlert className="size-4" />, loading: <Loader2 className="size-4 animate-spin" /> }}
      toastOptions={{ classNames: { toast: '!bg-popover !text-popover-foreground !border-border !shadow-md !rounded-lg !font-sans', description: '!text-muted-foreground', title: '!font-semibold' } }}
      style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' } as React.CSSProperties}
      {...props}
    />
  );
}
