# Lumen redesign — Deploy Console for the official showreel

**Date:** 2026-06-17
**Goal:** Rebuild the demo page (`assets-src/demo/index.html`) so the official
showcase reel never fires an event off-screen and never uses a motion primitive
decoratively. Every primitive and action gets a NATURAL home bound to real state,
and every scene is self-contained in one camera frame.

Decided autonomously (user abstained) with a multi-agent council: 16 skeptics
judged each primitive→anchor mapping, 2 designers proposed layouts, a lead
synthesized the final spec. Council rejected the first-draft anchors that were
decorative (countup-on-vanity-total, countdown-as-fake-suspense, orbit-on-logo,
trail-between-arbitrary-services) and replaced them with state-bound homes.

## Concept

**Lumen = a Deploy Console** (DevOps: build pipeline, services, latency, deploy
button, deploy history). The name and existing elements (lumen-web, "Deploy to
production", build, services) already point here, and deploy telemetry gives every
primitive a real-state home.

## Hard constraints

1. **Nothing off-screen.** Each scene fits one camera frame. Co-locate primitives
   that share one state machine into one panel so a single `zoom:2` captures the
   whole moment.
2. **No decorative motion.** Every primitive is bound to a real state transition
   and DIES the instant it stops being true. Fire-once effects never replay; only
   `pulse@Live` loops (it is itself true state: serving).

## Layout

12-col dark grid. Left/top console chrome. Main = 2-row cluster grid:
- **Row 1:** Pipeline panel (wide, the hero) + Log stream (side).
- **Row 2:** Metrics cluster + Topology + Deploy-action panel.
- **History table** full-width below.

Each panel is a self-contained card sized to fit ~86% viewport at `zoom:2` — the
camera auto-fits ONE panel, never two.

### Sections + selectors

| Section | Selectors | Hosts |
|---|---|---|
| Console chrome | `header.console-bar`, `.logo`, `#env-switch`, `button#menu`, `nav.drawer#drawer` (fixed), `.nav-item`, `button#theme`, `.status-dot#live-dot` | drawer menu, theme toggle, pulse |
| Pipeline panel | `.pipeline`, `ul.stages`, `li.stage[data-stage]` (`#stage-build/test/push/deploy`), `.stage-ring`, `.stage-link[data-edge]`, `li.stage .badge`, `li.stage#stage-deploy .chip`, `.deploy-progress > i`, `.stage.running/.done/.fail` | orbit, trail, glow, checkmark, flash, progress |
| Log stream | `.log-stream#deploy-log`, `.log-stream__body` (fixed height, overflow), `.line.typing`, `.line--ok/--err` | typeon |
| Metrics cluster | `.metrics`, `.kpi[data-metric]`, `.kpi b.value[data-countup]`, `.kpi#p95 .spark`, `.kpi__label` | countup, sparkline, marks+glossary |
| Topology | `.topology`, `.svc-node[data-service]` (`#svc-api/worker/cdn/db`), `.svc-node--focus`, `.topology[data-rollout]`, `.svc-link` | ripple, spotlight |
| Deploy action | `.deploy-panel`, `button.cta#deploy` (`.blocked/.loading/.done`), `.deploy-progress > i`, `.timer#schedule-countdown`, `.timer#rollback-countdown`, `.toast#cancel-toast` | deploy flow, shake, countdown |
| History table | `table.deploy-history#history`, `tbody#history-body`, `tr.row--new:first-child`, `td.email[data-private]`, `.pill.ok/.run` | reveal, confetti, privacy blur |
| Deploy detail | `.deploy-detail`, `img.artifact-preview[data-kenburns]`, `.detail__commit`, `.detail__diff` | kenburns (optional) |
| Invite/config form | `form.invite#invite-form`, `#iname`, `#iemail`, `select#region`, `button#invite`, `.toast#invite-toast`, `[data-cursor-stop]` | form fill, follow path |

## Primitive map (final — every one state-bound)

| Primitive | Selector | Practical use |
|---|---|---|
| countup | `.kpi b.value[data-countup]` | post-deploy p95/throughput ticks to new steady state — real convergence |
| sparkline | `.kpi#p95 .spark` | p95 latency trend redraws as fresh post-deploy samples arrive |
| progress | `.deploy-progress > i` | build-stage bar fills with real % of the running stage |
| countdown | `.timer#rollback-countdown` | "Auto-rollback in 04:59" on a failing health window (real, actionable) |
| orbit | `li.stage.running .stage-ring` | ring orbits ONLY while the active stage runs, stops on resolve |
| trail | `.stage-link[data-edge]` | animates the connector from last-done stage into the running one |
| pulse | `.status-dot#live-dot` | "Live" dot breathes while serving — true ongoing state |
| ripple | `.topology[data-rollout] .svc-node` | wave fans out through services as the deploy goes live |
| glow | `li.stage.running .badge` | active stage badge breathes while pending, snaps solid on resolve |
| shake | `button.cta#deploy.blocked` | Deploy shakes once when a gate blocks the attempt |
| checkmark | `li.stage#stage-deploy .badge` | deploy badge draws a check the instant it completes (once) |
| flash | `li.stage#stage-deploy .chip` | final chip flashes green the instant it flips to Live |
| confetti | `tr.row--new:first-child` | newest history row lands + pill settles green, gated on health |
| typeon | `.log-stream .line.typing` | live build/deploy log streams line-by-line — genuine progress |
| reveal | `tr.row--new` | new deploy row appears at the top the moment it's recorded |
| kenburns | `img.artifact-preview[data-kenburns]` | optional slow push on the deployed-app screenshot (soft close) |

## Scene order (16 — each one frame, accent rotation blue→amber→red→green→violet)

1. **Establish** (blue): full page at rest, pipeline idle, Live dot pulsing. topbar on.
2. **Drawer** (blue, Preset B): zoom #menu, open/walk/close drawer, then topbar off.
3. **Theme toggle** (green): zoom header, click #theme, surface re-themes in one frame, highlight #live-dot.
4. **Form** (amber, Preset F): fill #iname/#iemail, select region, click #invite, rect toast.
5. **Cursor path** (red, Preset G): hold form, follow #iname→#iemail→#region→#invite.
6. **Privacy** (blue, Preset E): zoom #history, blur/redact/highlight email cells.
7. **Spotlight** (violet, Preset D): zoom topology, spotlight one service node.
8. **Metrics glossary** (amber, Preset C): marks+glossary+stagger on KPIs.
9. **Blocked** (red): click deploy on failed gate → shake + rollback countdown + fail badge.
10. **Deploy fires** (green, cluster A): click deploy, cancel-grace, orbit+trail+glow+progress all live in the pipeline frame.
11. **Log stream** (green): typeon lines in the log box.
12. **Resolve** (green): checkmark + flash on the deploy badge; orbit/glow die.
13. **Rollout** (violet): ripple fans out through topology.
14. **Converge** (violet): sparkline redraws + countup settles p95/rps.
15. **History landing** (green): new row reveals + confetti + pill settles.
16. **Outro** (blue, optional): ken burns on artifact preview, longest hold.

## Visual style (design notes)

- **Palette dark:** canvas `#0B0E14`, panel `#131722` (1px `#1E2530`), raised `#1A1F2C`. Text `#E6EAF2` / muted `#8A93A6`. Accent electric indigo `#5B8CFF`. State hues carry meaning only: running `#FFB84D`, success/live `#34D399`, fail `#F25555`.
- **Light variant** (`.light`): canvas `#F6F8FB`, panel `#FFFFFF` (`#E3E8F0`), text `#1A1F2C`; same accent/state at +8% saturation. Toggle re-themes whole surface in one frame.
- **Type:** Inter for UI (600/500/400), JetBrains Mono for log, metric values, SHAs, timers (tabular-nums so digits tick without jitter). Stage chips mono caps.
- **Spacing:** 8px base; 24px panel padding, 16px card gaps; stages 32px apart, 2px connectors; rounded 12px panels / 8px chips / 6px inputs.
- **Beauty = restraint:** one accent, state colors the only other hue, generous negative space, the pipeline is the hero. Glassy 1px borders + subtle inner shadow read premium without gradient noise.

## Out of scope

- Real backend / data — all state driven by the demo's own JS (classes toggled in sequence), as today.
- New engine primitives — the 16 exist; this is pure demo redesign + roster rewrite.

## Build order

1. Rewrite `assets-src/demo/index.html` to this layout + state-driving JS.
2. Rewrite `assets-src/showcase-steps.json` to the 16-scene order against the new selectors.
3. Render realtime fps30, frame-verify each scene in-frame + each primitive firing on its real state.
4. Re-encode crf24, install `assets/showcase.mp4` + poster, commit, push.
