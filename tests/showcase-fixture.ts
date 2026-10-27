import { supportedProviders } from "../src/lib/bindings/supported-providers";
import type { Bootstrap } from "../src/lib/bindings/Bootstrap";

/** Realistic, synthetic content for documentation screenshots; no live agents. */
export function populateShowcase(data: Bootstrap) {
  data.projects = [
    {
      id: "navigation",
      name: "Workspace navigation",
      workspaceId: "harbor",
      icon: "code",
      color: "purple",
    },
    {
      id: "portfolio",
      name: "Portfolio refresh",
      workspaceId: "website",
      icon: "globe",
      color: "blue",
    },
  ];
  data.workspaces = [
    {
      id: "harbor",
      name: "harbor",
      path: "/Users/demo/Projects/harbor",
      lastUsedAt: 2,
      available: true,
      isGitRoot: true,
    },
    {
      id: "website",
      name: "personal-website",
      path: "/Users/demo/Projects/personal-website",
      lastUsedAt: 1,
      available: true,
      isGitRoot: true,
    },
  ];
  data.providers = supportedProviders;
  const conversations = [
    ["harbor", "Polish the new task page", "codex"],
    ["harbor", "Add keyboard navigation", "claude"],
    ["harbor", "Review workspace switching", "grok"],
    ["website", "Refresh the home page", "claude"],
    ["website", "Improve mobile navigation", "codex"],
  ];
  data.sessions = conversations.map(([workspaceId, title, providerId], index) => ({
    id: `showcase-${index}`,
    title,
    projectId: workspaceId === "harbor" ? "navigation" : "portfolio",
    workspaceId,
    isGit: true,
    providerId,
    cwd: data.workspaces.find((workspace) => workspace.id === workspaceId)!.path,
    acpSessionId: null,
    nativeSessionId: null,
    worktreeId: null,
    status: "idle",
    mode: "gui",
    createdAt: Date.now() - (index + 1) * 3_600_000,
    updatedAt: Date.now() - (index + 1) * 3_600_000,
    configOptions: [],
    modes: null,
    models: null,
    capabilities: {
      loadSession: false,
      resumeSession: false,
      configOptions: true,
      nativeHandoff: false,
      nativeHandoffReason: "Documentation preview",
      raw: {},
    },
    error: null,
    draft: "",
    scrollTop: 0,
    reviewOpen: false,
    archived: false,
  }));
}
