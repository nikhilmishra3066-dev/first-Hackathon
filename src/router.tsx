import { useCallback, useEffect, useState } from "react";

// Minimal client-side router (no external dependency).
// Real paths like /live-demo work with a static-host SPA fallback (see vercel.json).

export function navigate(to: string): void {
  if (window.location.pathname === to) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function replace(to: string): void {
  if (window.location.pathname === to) return;
  window.history.replaceState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return path;
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handle = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      // Let modified clicks / non-primary buttons open normally (new tab, etc.).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      navigate(to);
      window.scrollTo({ top: 0 });
    },
    [to, onClick],
  );
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
