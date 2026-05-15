import { useEffect } from "react";

import { DebugPanel } from "@/components/DebugPanel";
import { enableAutosave, loadAutosaved } from "@/store/useWorkspaceStore";

export function App(): JSX.Element {
  useEffect(() => {
    loadAutosaved();
    return enableAutosave();
  }, []);

  return <DebugPanel />;
}
