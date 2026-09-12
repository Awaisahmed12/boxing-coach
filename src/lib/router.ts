import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "onboarding" }
  | { name: "home" }
  | { name: "train" }
  | { name: "session"; id: string }
  | { name: "history" }
  | { name: "progress" }
  | { name: "plans" }
  | { name: "settings" };

export function routeQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  switch (parts[0]) {
    case "onboarding":
      return { name: "onboarding" };
    case "home":
      return { name: "home" };
    case "train":
      return { name: "train" };
    case "session":
      return parts[1] ? { name: "session", id: parts[1] } : { name: "history" };
    case "history":
      return { name: "history" };
    case "progress":
      return { name: "progress" };
    case "plans":
      return { name: "plans" };
    case "settings":
      return { name: "settings" };
    default:
      return { name: "landing" };
  }
}

export function navigate(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\/+/, "")}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
