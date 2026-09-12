import { useEffect } from "react";
import { navigate, useRoute } from "./lib/router";
import { StoreProvider, useStore } from "./state/store";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import { Plans } from "./screens/Plans";
import { Progress } from "./screens/Progress";
import { Settings } from "./screens/Settings";
import { Summary } from "./screens/Summary";
import { Train } from "./screens/Train";

function Router() {
  const route = useRoute();
  const { profile } = useStore();
  const onboarded = profile.onboardedAt !== null;

  useEffect(() => {
    if (route.name === "landing" && onboarded) navigate("home");
    else if (!onboarded && route.name !== "landing" && route.name !== "onboarding") navigate("onboarding");
  }, [route.name, onboarded]);

  switch (route.name) {
    case "landing":
      return onboarded ? null : <Landing />;
    case "onboarding":
      return <Onboarding />;
    case "home":
      return <Home />;
    case "train":
      return <Train key={window.location.hash} />;
    case "session":
      return <Summary id={route.id} />;
    case "history":
      return <History />;
    case "progress":
      return <Progress />;
    case "plans":
      return <Plans />;
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
