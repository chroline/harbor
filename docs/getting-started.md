# getting started

[← Harbor](../README.md)

## open Harbor

open **Harbor.app** if you have a local build, or follow the [development guide](development.md#run-from-source) to build it. the current macOS target is Apple silicon with macOS 12 or later. local macOS bundles use a persistent self-signed certificate stored in your user keychain. distribution with Developer ID signing and notarization requires your Apple credentials. agent CLIs, their ACP adapters, authentication, and Worktrunk are separate dependencies. Harbor does not install global tools or manage provider credentials.

## workspaces and conversations

home contains the task composer and workspace picker. tasks belong directly to a local workspace folder; adding a workspace does not require a project. use **add workspace** in the sidebar or composer to choose any local folder. existing project records remain available, but project shortcuts select their workspace for new tasks. agents are selected in the composer and configured in settings. conversations appear under their saved workspace in the sidebar.

1. open settings and select your agent. configure the ACP executable and arguments, one argument per line. check connection setup to see executable paths, native version, and Worktrunk availability.
2. authenticate in the provider’s own CLI if necessary. Harbor reuses that login; ACP authentication methods appear when advertised.
3. select an agent and model on home, even before adding a workspace. reasoning choices refresh when the model changes. Harbor discovers these through a reusable ACP session in a temporary directory, without sending a prompt or creating a Harbor chat or worktree. some providers may retain that blank session in their own history.
4. leave **no workspace** selected for a freeform chat. Harbor keeps its working files in an app-managed conversation folder and never calls Git or Worktrunk for it. these chats appear under no workspace and retain their files when archived. for folder work, add a workspace using any local directory and select it in the composer. Git checkout roots also offer the existing checkout or a new Worktrunk branch. your selected model and reasoning effort are validated and applied to the new session. new worktrees require an existing commit and `wt` on PATH. provider-advertised modes can be selected before launch or in an existing chat; valid model preferences are remembered per provider.
5. start the task. approvals, tool activity, worker transcripts, plans, and code appear in the conversation. review changes in unified or split view; open files with your configured external editor.

executable paths may be absolute. Harbor includes standard Homebrew, `~/.local/bin`, `~/.grok/bin`, Cargo, and installed NVM Node locations in its launch PATH. arguments are passed directly without shell interpolation. arbitrary custom ACP executables can be configured in settings.

## arrange the sidebar

drag projects, workspace headers (including no workspace), chats within each workspace, and pinned chats to rearrange them. each list remembers its order locally across restarts. right-click a row for **move up** / **move down**, or focus it and press **option/alt + ↑/↓**. touch users can use the long-press menu to move rows. press escape to cancel a drag.

## terminals and standalone windows

the **+** beside a task's tabs opens an independent login shell in the task's working directory. terminal titles follow the current folder and foreground command, and accept titles set by terminal programs. shells keep running while switching tabs or tasks; closing a terminal tab, archiving its task, or quitting Harbor stops them. terminal tabs last for the current app run and show an exited state when their shell finishes.

drag any task tab sideways to reorder it; the tab follows the pointer and swaps with a neighbor when the pointer crosses that tab's midpoint, with neighboring tabs animating out of its way. the order is remembered for each task. option/alt + left/right moves the focused tab with the keyboard. a quick outward pull or sufficient distance away from the bar opens the tab immediately, before mouse release, in a standalone window with Harbor's outer frame, a dynamic title, and native macOS stoplight controls. the original tab says **open in standalone window** and focuses that window when clicked. terminals retain the same shell, output, directory, and running command. conversation drafts and attachments move with the conversation. standalone windows omit the sidebar, tab bar, and feedback toolbar; drag the titlebar to move them and use the native close button or **⌘w** to close them. closing a standalone window hides that view while retaining its tab, running shell, and unsent draft. click **open in standalone window** to reopen it. archiving the task or quitting Harbor still stops its managed shells.

## worker conversations

each task contains a tab for its parent conversation and a tab for every subagent in the top bar. new subagents appear automatically without interrupting the active conversation. use the tabs or their arrow-key navigation to switch conversations. selecting a worker opens its existing conversation so you can send a follow-up. parent and child drafts, messages, approvals, and turn completion remain separate. Prime resumes the exact child session with its existing context. OpenCode exposes loadable child sessions. Codex, Claude, Cursor, and Pi use a clearly labeled parent relay with native worker messaging/resume tools where direct child input is unavailable. Claude's delayed child completion is tracked after the parent turn ends. a custom provider must expose worker identities and support either direct recovery or native continuation through its parent.

see [provider compatibility](providers.md) and the [live verification record](subagent-verification.md) for the tested continuation routes.

## window behavior

settings → workspace → **keep working in the background** controls window closure. on (the default) hides the window and keeps agents in the menu bar. off stops managed agents, saves disconnected session state, and quits Harbor when the window closes. explicit quit always stops managed processes.

## shortcuts

the mode picker beside the model shows the current working mode. changes made during a response are labeled **next turn** and apply once the response ends. queued selections survive switching chats, but not restarting Harbor.

| shortcut | action |
| --- | --- |
| ⌘ n | new task |
| ⌘ k | search workspaces and conversations |
| ⌘ b | toggle sidebar |
| ⌘ t | new terminal tab in the current task |
| ⌘ w | close the active terminal tab |
| ⌘ ⇧ t | switch chat / native terminal when supported |
| ⌘ enter (ctrl enter on other platforms) / enter | send / newline |
| shift tab in the chat input | cycle the modes advertised by the connected provider |
| escape | close dialogs |
