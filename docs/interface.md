# interface reference

[← Harbor](../README.md)

## foundation

a local desktop home for coding agents. Tauri 2, React 19, strict TypeScript, shadcn/ui, SQLite, ACP v1, native PTYs, and Worktrunk. the dark and light themes use neutral gray surfaces and text.

## native window surfaces

the sidebar sits outside the rounded main-content frame, over the original active macOS sidebar vibrancy. sidebar, titlebar, and outer gutters share Codex's 70% surface tint (#ededed in light mode, #212121 in dark mode). the main frame retains its original color and 84% light / 72% dark surface opacity. the native blur material is shared across the whole window. reduced transparency supplies an opaque chrome background. there is no grain texture. browser checks verify the CSS layers; native desktop screenshots verify the shared chrome after rebuilding.

## provider artwork

provider icons are bundled SVG brand marks from the [ACP registry](https://github.com/agentclientprotocol/registry) and [Prime Intellect](https://www.primeintellect.ai/icons/primeintellect-logo.svg). exact source URLs, the pinned registry revision, checksums, and the Prime symbol extraction are recorded in [artwork provenance](../src/assets/providers/sources.json). custom providers retain a generic terminal icon.

## component integration

see [Fluid Functionalism](fluid-functionalism.md) for registry integration, provenance, and compatibility patches.
