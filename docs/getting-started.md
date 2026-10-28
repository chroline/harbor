# getting started

[← Harbor](../README.md)

## open Harbor

on an Apple silicon Mac with macOS 12 or later, download the latest published DMG from [GitHub Releases](https://github.com/chroline/harbor/releases), open it, and drag **Harbor.app** to Applications. open Harbor from Applications. release builds are signed and notarized; building locally is also supported through the [development guide](development.md#run-from-source). agent CLIs, their ACP adapters, authentication, and Worktrunk are separate dependencies. Harbor does not install global tools or manage provider credentials.

## workspaces and conversations

home contains the task composer and workspace picker. tasks belong directly to a local workspace folder; adding a workspace does not require a project. use **add workspace** in the sidebar or composer to choose any local folder. existing project records remain available, but project shortcuts select their workspace for new tasks. agents are selected in the composer and configured in settings. conversations appear under their saved workspace in the sidebar.

1. open settings and select your agent. configure its executable; **advanced** contains arguments, one per line, and a separate native CLI if needed. use **save and check** to verify executable paths, native version, ACP compatibility, authentication, and temporary session creation without submitting a prompt.
2. authenticate in the provider’s own CLI if necessary. Harbor reuses that login; ACP authentication methods appear when advertised.
3. select an agent and model on home, even before adding a workspace. reasoning choices refresh when the model changes. Harbor discovers these through a reusable ACP session in a temporary directory, without sending a prompt or creating a Harbor chat or worktree. some providers may retain that blank session in their own history.
4. leave **no workspace** selected for a freeform chat. Harbor keeps its working files in an app-managed conversation folder and never calls Git or Worktrunk for it. these chats appear under no workspace and retain their files when archived. for folder work, add a workspace using any local directory and select it in the composer. Git checkout roots also offer the existing checkout or a new Worktrunk branch. your selected model and reasoning effort are validated and applied to the new session. new worktrees require an existing commit and `wt` on PATH. provider-advertised modes can be selected before launch or in an existing chat; valid model preferences are remembered per provider.
5. start the task. approvals, tool activity, worker transcripts, plans, and code appear in the conversation. review changes in unified or split view; open files with your configured external editor.

executable paths may be absolute. Harbor includes standard Homebrew, `~/.local/bin`, `~/.grok/bin`, Cargo, and installed NVM Node locations in its launch PATH. arguments are passed directly without shell interpolation. only Claude Code, OpenAI Codex, and Grok Build are supported. Executable overrides configure these integrations; there is no custom-agent entry.

if an agent is installed under another name, choose **configure executable** beside the connection error or in the model menu. enter a command name or use **browse** to select its file. for example, point Grok Build at `/path/to/grok`. **advanced** contains its launch arguments (`--no-auto-update`, `agent`, and `stdio` for Grok Build) and the optional separate native CLI executable. when the ACP and native CLI use the same executable, changing the ACP executable updates both; separately configured adapters keep their own native CLI. **save changes** applies the connection and reloads model discovery. **save and check** establishes a real ACP session and distinguishes missing executables, authentication failures, protocol incompatibility, and timeouts. It displays advertised sign-in methods when available. the same fields are available under settings → agent connections.

## arrange the sidebar

drag projects, workspace headers (including no workspace), chats within each workspace, and pinned chats to rearrange them. each list remembers its order locally across restarts. right-click a row for **move up** / **move down**, or focus it and press **option/alt + ↑/↓**. touch users can use the long-press menu to move rows. press escape to cancel a drag.

## terminals and standalone windows

the **+** beside a task's tabs opens an independent login shell in the task's working directory. terminal titles follow the current folder and foreground command, and accept titles set by terminal programs. shells keep running while switching tabs or tasks; closing a terminal tab, archiving its task, or quitting Harbor stops them. tabs and their last known directories survive a restart, while processes and output do not. a tab shows an exited state when its shell finishes.

drag any task tab sideways to reorder it; the tab follows the pointer and swaps with a neighbor when the pointer crosses that tab's midpoint, with neighboring tabs animating out of its way. the order and selected tab are remembered for each task. after restarting Harbor, the last viewed task and its tabs reopen; terminal tabs start fresh shells in their saved working directories. option/alt + left/right moves the focused tab with the keyboard. a quick outward pull or sufficient distance away from the bar opens the tab immediately, before mouse release, in a standalone window with Harbor's outer frame, a dynamic title, and native macOS stoplight controls. the original tab says **open in standalone window** and focuses that window when clicked. terminals retain the same shell, output, directory, and running command. conversation drafts and attachments move with the conversation. standalone windows omit the sidebar, tab bar, and feedback toolbar; drag the titlebar to move them and use the native close button or **⌘w** to close them. closing a standalone window hides that view while retaining its tab, running shell, and unsent draft. click **open in standalone window** to reopen it. archiving the task or quitting Harbor still stops its managed shells.

## worker conversations

each task contains a tab for its parent conversation and a tab for every subagent in the top bar. new subagents appear automatically without interrupting the active conversation. use the tabs or their arrow-key navigation to switch conversations. selecting a worker opens its existing conversation so you can send a follow-up. parent and child drafts, messages, approvals, and turn completion remain separate. Grok Build opens the existing child session directly. OpenAI Codex and Claude Code use a clearly labeled parent relay with native worker messaging/resume tools. Claude's delayed child completion and typed parent/worker messages remain visible after the parent turn ends. Failed worker attachment retains history and reports the failure rather than creating a replacement worker.

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
| enter / shift enter | send / newline |
| shift tab in the chat input | cycle the modes advertised by the connected provider |
| escape | close dialogs |

## upgrading to three-provider support

The first launch migrates Harbor's database to version 3. Chats from removed providers, including archived chats and custom agents, are permanently removed along with their transcripts, worker records, connection settings, and cached preferences. Working files, freeform chat folders, projects, workspaces, Git worktrees, recovery archives, and native CLI history are preserved. The upgrade does not uninstall CLIs or remove their credentials.
