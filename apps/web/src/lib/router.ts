import { useEffect, useState, type MouseEvent } from "react";

// Tiny client-side routing: the app only has a handful of public paths, so no router library.
export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePathname() {
  const [pathname, setPathname] = useState(location.pathname);
  useEffect(() => {
    const onChange = () => setPathname(location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return pathname;
}

/** Same-tab navigation for in-app links, keeping ctrl/cmd-click and middle-click as normal links. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
      window.scrollTo({ top: 0 });
    },
  };
}
