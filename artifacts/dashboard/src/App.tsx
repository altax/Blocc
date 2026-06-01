import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "./components/layout";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Logs from "@/pages/logs";
import Messages from "@/pages/messages";
import Patterns from "@/pages/patterns";
import Settings from "@/pages/settings";
import Streamers from "@/pages/streamers";
import Learning from "@/pages/learning";
import TestBot from "@/pages/test-bot";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/logs" component={Logs} />
        <Route path="/messages" component={Messages} />
        <Route path="/streamers" component={Streamers} />
        <Route path="/learning" component={Learning} />
        <Route path="/test-bot" component={TestBot} />
        <Route path="/patterns" component={Patterns} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
