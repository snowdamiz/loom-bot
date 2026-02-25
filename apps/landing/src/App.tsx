import {
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Clock3,
  Cpu,
  Eye,
  Github,
  KeyRound,
  LockKeyhole,
  Orbit,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Capability = {
  title: string;
  description: string;
  footnote: string;
  icon: LucideIcon;
};

type LoopStep = {
  title: string;
  detail: string;
  micro: string;
  visual: string;
  icon: LucideIcon;
};

type Guardrail = {
  title: string;
  detail: string;
  icon: LucideIcon;
};

type LogEntry = {
  action: string;
  note: string;
  status: 'Done' | 'Active';
  time: string;
};

const navItems = [
  { label: 'Proof', href: '#capabilities' },
  { label: 'Workflow', href: '#autonomy-loop' },
  { label: 'Safety', href: '#governance' },
  { label: 'Early Access', href: '#install' },
];

const installCommand = 'bash <(curl -fsSL https://getloom.dev/install.sh)';
const dashboardCommand = 'open http://localhost:3001';

const outcomeStats = [
  { value: 'Runtime self-extension', label: 'The agent can write tools and expand schema while it runs' },
  { value: 'Domain-agnostic', label: 'A strategy lifecycle runs discovery, evaluation, execution, and monitoring across domains' },
  { value: 'Parallel sub-agents', label: 'Scoped sub-agents run through BullMQ so independent workstreams can progress concurrently' },
  { value: '20 built-in tools', label: 'Primitives, browser automation, self-extension, and multi-agent control ship ready' },
];

const telemetryLog: LogEntry[] = [
  {
    action: 'Maintaining a persistent goal loop',
    note: 'Goals are evaluated continuously, and sub-goals are replanned when current approaches stall.',
    status: 'Done',
    time: 'Startup',
  },
  {
    action: 'Parallelizing work through sub-agents',
    note: 'The parent loop dispatches focused sub-agents, waits for results, and keeps independent workstreams moving.',
    status: 'Done',
    time: 'Startup',
  },
  {
    action: 'Expanding capabilities during runtime',
    note: 'Loom can author TypeScript tools, compile them, and register them immediately as new capabilities.',
    status: 'Active',
    time: 'Runtime',
  },
];

const capabilities: Capability[] = [
  {
    title: 'Runs complete strategy lifecycles autonomously',
    description:
      'A domain-agnostic strategy engine moves work through discovery, evaluation, execution, and monitoring so long-running approaches survive restarts.',
    icon: Workflow,
    footnote: 'Four-stage strategy lifecycle with restart resilience',
  },
  {
    title: 'Parallelizes independent workstreams',
    description:
      'Loom dispatches scoped sub-agents through BullMQ, consolidates results, and keeps research and execution running in parallel.',
    icon: Cpu,
    footnote: 'Scoped sub-agent delegation with structured result collection',
  },
  {
    title: 'Extends itself while it runs',
    description:
      'The runtime can author new TypeScript tools, compile them in a sandbox harness, register them immediately, and extend database schema when needed.',
    icon: KeyRound,
    footnote: 'Runtime tool authoring with schema extension support',
  },
  {
    title: 'Promotes built-in changes through deterministic gates',
    description:
      'Built-in modifications run isolated verification and deterministic pull-request promotion, then merge only after required status contexts are green.',
    icon: Eye,
    footnote: 'Isolated verifier stages plus required status contexts',
  },
];

const loopSteps: LoopStep[] = [
  {
    title: 'Discover opportunities',
    detail: 'Strategies enter discovery so the agent can identify viable paths before committing execution effort.',
    micro: 'Discovery',
    visual: 'Discover',
    icon: Sparkles,
  },
  {
    title: 'Evaluate expected upside',
    detail: 'Evaluator and replanner logic refine next moves as results arrive and assumptions change.',
    micro: 'Evaluation',
    visual: 'Evaluate',
    icon: Wrench,
  },
  {
    title: 'Execute in parallel',
    detail: 'Main and sub-agents execute scoped workstreams through shared tools and queue-backed orchestration.',
    micro: 'Execution',
    visual: 'Execute',
    icon: TerminalSquare,
  },
  {
    title: 'Monitor and iterate',
    detail: 'Running strategies stay tracked across restarts so monitoring, adaptation, and follow-on actions continue.',
    micro: 'Monitoring',
    visual: 'Monitor',
    icon: CheckCheck,
  },
];

const loopNodePositions = [
  'left-1/2 top-[13.1%] -translate-x-1/2 -translate-y-1/2',
  'left-[83.9%] top-1/2 -translate-x-1/2 -translate-y-1/2',
  'left-1/2 top-[86.9%] -translate-x-1/2 -translate-y-1/2',
  'left-[16.1%] top-1/2 -translate-x-1/2 -translate-y-1/2',
];

const guardrails: Guardrail[] = [
  {
    title: 'Fail-closed built-in promotion pipeline',
    detail: 'Built-in modifications compile, run isolated verification, publish the sandbox status context, and only promote when required checks pass.',
    icon: LockKeyhole,
  },
  {
    title: 'Verification includes startup smoke validation',
    detail: 'Promotion verification executes compile, targeted testing, and startup smoke checks before merge eligibility.',
    icon: ShieldCheck,
  },
  {
    title: 'Journaled crash recovery',
    detail: 'Checkpoint writes are required, and startup recovery resets interrupted goals before staggered restart.',
    icon: Clock3,
  },
];

const faqs = [
  {
    question: 'Who should deploy Loom?',
    answer:
      'Loom is built for engineering teams that want autonomous execution in production with explicit operator controls, queue-backed delegation, and verifiable safety gates.',
  },
  {
    question: 'Can it run long-lived strategies without manual babysitting?',
    answer:
      'Yes. Loom uses a strategy lifecycle that tracks work across discovery, evaluation, execution, and monitoring, and it persists progress across restarts.',
  },
  {
    question: 'How does Loom expand capabilities over time?',
    answer:
      'It can author new TypeScript tools at runtime, compile them in a sandbox harness, register them immediately, and extend schema when built-in structures are not enough.',
  },
  {
    question: 'What keeps built-in self-modification from breaking production?',
    answer:
      'Promotion is fail-closed: isolated verification must pass first, then required status contexts must be green before merge.',
  },
];

export default function App() {
  const [commandsCopied, setCommandsCopied] = useState(false);

  const handleCopyCommands = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${installCommand}\n${dashboardCommand}`);
    setCommandsCopied(true);
    window.setTimeout(() => setCommandsCopied(false), 1800);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-paper-grid [background-size:36px_36px] opacity-45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-console-lights opacity-90" />
      <div className="pointer-events-none absolute -left-20 top-28 -z-10 h-64 w-64 rounded-full bg-secondary/20 blur-3xl animate-float-soft" />
      <div className="pointer-events-none absolute right-[-5rem] top-[22rem] -z-10 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-float-soft [animation-delay:900ms]" />

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.7rem] w-full max-w-6xl items-center justify-between px-6">
          <a href="#" className="group inline-flex items-center gap-3">
            <img
              src="/logo-primary.svg"
              alt="Loom"
              className="h-8 w-auto transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </a>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="group relative pb-1 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {item.label}
                <span className="pointer-events-none absolute inset-x-0 -bottom-[1px] h-[1.5px] origin-left scale-x-0 bg-primary/75 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="coming-soon-pill hidden border-amber-300/70 bg-amber-100/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-amber-900 sm:inline-flex"
            >
              <Clock3 className="h-3 w-3" />
              Coming Soon
            </Badge>
            <Badge
              variant="outline"
              className="hidden border-border/70 bg-card/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground lg:inline-flex"
            >
              Open Source
            </Badge>
            <a
              href="https://github.com/snowdamiz/jarvis"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card/80 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open GitHub repository"
            >
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
        <nav aria-label="Section navigation" className="no-scrollbar mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-6 pb-3 md:hidden">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="nav-chip whitespace-nowrap">
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section id="mission" className="mx-auto grid w-full max-w-6xl gap-14 px-6 pb-16 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:pt-24">
          <div className="space-y-7">
            <Badge className="section-kicker">
              <Clock3 className="h-3.5 w-3.5" />
              Coming Soon Preview
            </Badge>

            <div className="space-y-5">
              <h1 className="hero-title max-w-2xl text-balance">
                Unopinionated automation with a self-extending autonomous agent.
              </h1>
              <p className="max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Loom adapts to your domain, executes strategy lifecycles, and writes new tools at runtime so automation keeps compounding instead of stalling.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="shadow-console px-7">
                <a
                  href="https://github.com/snowdamiz/jarvis"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Track Launch on GitHub
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border/80 bg-card/70">
                <a href="#capabilities">
                  Review Proof
                  <ChevronRight className="h-4 w-4" />
                </a>
              </Button>
            </div>

          </div>

          <div className="panel-strong animate-enter relative overflow-hidden p-6 sm:p-7">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-secondary via-primary to-accent" />
            <div className="flex items-center justify-between gap-4">
              <p className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
                <TerminalSquare className="h-4 w-4 text-primary" />
                Development Preview Snapshot
              </p>
              <p className="coming-soon-pill">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
                Preview only
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {telemetryLog.map((entry) => (
                <article
                  key={entry.action}
                  className="log-entry"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <p className="font-semibold text-foreground">{entry.action}</p>
                    <span
                      className={
                        entry.status === 'Active'
                          ? 'inline-flex items-center gap-1.5 rounded-full bg-accent/14 px-2 py-0.5 font-semibold text-accent'
                          : 'inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground'
                      }
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${entry.status === 'Active' ? 'bg-accent' : 'bg-muted-foreground/70'}`} />
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.note}</p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {entry.time}
                  </p>
                </article>
              ))}
            </div>

          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-10">
          <div className="signature-divider" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {outcomeStats.map((item, index) => (
              <div
                key={item.label}
                className="panel animate-enter px-5 py-5"
                style={{ animationDelay: `${index * 110}ms` }}
              >
                <div className="mb-3 h-[3px] w-10 rounded-full bg-gradient-to-r from-primary/80 to-accent/80" />
                <p className="text-display-metric">{item.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="capabilities" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
            <div className="space-y-5 lg:sticky lg:top-28 lg:h-fit">
              <Badge className="section-kicker">
                <Workflow className="h-3.5 w-3.5" />
                Proof-Backed Differentiators
              </Badge>
              <h2 className="max-w-xl text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Why Loom is built for real autonomous execution.
              </h2>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                Each differentiator below maps directly to behavior that already ships in this repository.
              </p>
            </div>

            <div className="space-y-4">
              {capabilities.map((item, index) => (
                <article
                  key={item.title}
                  className="panel group flex flex-col gap-4 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-console sm:flex-row sm:items-start"
                >
                  <div className="flex items-center gap-4 sm:w-60">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold tracking-tight">{item.title}</h3>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="leading-relaxed text-muted-foreground">{item.description}</p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-accent">
                      {item.footnote}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="autonomy-loop" className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="panel-strong overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
            <Badge className="section-kicker">
              <Orbit className="h-3.5 w-3.5" />
              Runtime Workflow
            </Badge>
            <h2 className="mt-5 max-w-3xl text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Built around a four-stage strategy lifecycle.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Loom continuously cycles from discovery to monitoring so strategies adapt instead of stalling after first execution.
            </p>

            <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
              <ol className="space-y-3">
                {loopSteps.map((step, index) => (
                  <li key={step.title} className="rounded-2xl border border-border/70 bg-card/80 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-primary">
                        <step.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          Stage {String(index + 1).padStart(2, '0')}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="execution-constellation hidden lg:block">
                <div className="execution-constellation-surface">
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 620 420"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <defs>
                      <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="hsl(214 74% 38%)" stopOpacity="0.07" />
                        <stop offset="100%" stopColor="hsl(214 74% 38%)" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Subtle center glow */}
                    <circle cx="310" cy="210" r="180" fill="url(#coreGlow)" />

                    {/* Static guide track */}
                    <path
                      d="M 150 55 H 470 Q 520 55 520 105 V 315 Q 520 365 470 365 H 150 Q 100 365 100 315 V 105 Q 100 55 150 55 Z"
                      className="loop-track"
                    />

                    {/* Animated flow overlay */}
                    <path
                      id="loop-path"
                      d="M 150 55 H 470 Q 520 55 520 105 V 315 Q 520 365 470 365 H 150 Q 100 365 100 315 V 105 Q 100 55 150 55 Z"
                      className="loop-flow"
                    />

                    {/* Directional arrow chevrons */}
                    <path d="M 432 42 L 454 55 L 432 68" className="loop-arrow" />
                    <path d="M 507 295 L 520 317 L 533 295" className="loop-arrow" />
                    <path d="M 188 378 L 166 365 L 188 352" className="loop-arrow" />
                    <path d="M 113 125 L 100 103 L 87 125" className="loop-arrow" />

                    {/* Animated particles */}
                    <circle className="loop-particle loop-particle-1" r="6">
                      <animateMotion dur="9s" repeatCount="indefinite">
                        <mpath href="#loop-path" />
                      </animateMotion>
                    </circle>
                    <circle className="loop-particle loop-particle-2" r="4.5">
                      <animateMotion dur="9s" begin="-3s" repeatCount="indefinite">
                        <mpath href="#loop-path" />
                      </animateMotion>
                    </circle>
                    <circle className="loop-particle loop-particle-3" r="3.5">
                      <animateMotion dur="9s" begin="-6.2s" repeatCount="indefinite">
                        <mpath href="#loop-path" />
                      </animateMotion>
                    </circle>
                  </svg>

                  {/* Stage nodes positioned on the path */}
                  {loopSteps.map((step, index) => (
                    <article
                      key={step.title}
                      className={`loop-stage ${loopNodePositions[index]}`}
                    >
                      <span className="loop-stage-icon">
                        <step.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="loop-stage-label">{step.visual}</span>
                    </article>
                  ))}

                  {/* Center core */}
                  <div className="constellation-core">
                    <span className="constellation-core-halo" />
                    <Cpu className="h-5 w-5 text-primary" />
                    <p className="mt-2 text-sm font-semibold tracking-tight">Loom Core</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Adaptive loop</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="governance" className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="panel-strong p-6 sm:p-7">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Operators stay informed while automation runs.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Dashboard streaming sends status and activity updates in real time, and kill switch changes push immediate state updates to connected clients.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  'SSE stream emits connection, status, activity, and heartbeat events',
                  'Kill switch changes broadcast state updates immediately',
                  'Dashboard poller refreshes core status data every 2 seconds',
                ].map((item) => (
                  <p
                    key={item}
                    className="inline-flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-sm"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {item}
                  </p>
                ))}
              </div>
            </article>

            <article className="panel p-6 sm:p-7">
              <h3 className="text-balance font-display text-3xl font-semibold tracking-tight">
                Safety checks run inside execution paths.
              </h3>
              <ul className="mt-5 space-y-3">
                {guardrails.map((item) => (
                  <li key={item.title} className="rounded-xl border border-border/70 bg-background/75 p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/12 text-secondary">
                        <item.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold tracking-tight">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="space-y-4 pb-6">
            <Badge className="section-kicker">
              <ShieldCheck className="h-3.5 w-3.5" />
              FAQ
            </Badge>
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Deployment questions teams ask before turning autonomy on.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <details key={faq.question} className="faq-item panel group p-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-base font-semibold tracking-tight">
                  {faq.question}
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 pr-6 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="install" className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16">
          <div className="panel-strong relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
            <div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 -translate-y-1/3 rounded-full bg-secondary/20 blur-3xl" />
            <Badge className="section-kicker">
              <Cpu className="h-3.5 w-3.5" />
              Early Access
            </Badge>
            <h2 className="mt-5 max-w-3xl text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Preview setup is available now. Public launch is coming soon.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              You can test Loom in controlled preview environments today. We are still hardening onboarding, upgrade paths, and release defaults before general availability.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-100/80 px-3 py-2 text-sm font-medium text-amber-950">
              <Clock3 className="h-4 w-4 text-amber-700" />
              Not ready for production yet. Treat setup commands as preview-only.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="terminal-shell overflow-hidden rounded-2xl border border-border/70 bg-[#081325] text-slate-100 shadow-panel">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    <span className="ml-2 font-mono uppercase tracking-[0.12em]">bootstrap</span>
                  </div>
                  <button type="button" className="terminal-copy-btn" onClick={handleCopyCommands}>
                    {commandsCopied ? (
                      <>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>Copy commands</>
                    )}
                  </button>
                </div>
                <div className="space-y-2.5 px-4 py-5 font-mono text-sm">
                  <p className="command-line">
                    <span className="text-cyan-300">$</span> {installCommand}
                  </p>
                  <p className="command-line">
                    <span className="text-cyan-300">$</span> {dashboardCommand}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  'Run the installer in a non-production environment to provision Postgres, Redis, schema push, agent, worker, and dashboard.',
                  'Complete dashboard setup with model key and GitHub OAuth repository trust binding for preview testing.',
                  'Review the seeded paused goal, then resume when your team is ready to evaluate the preview.',
                ].map((step) => (
                  <p key={step} className="install-step rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-sm leading-relaxed">
                    {step}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border/70 pt-6">
              <Button asChild size="lg" className="shadow-console px-7">
                <a
                  href="https://github.com/snowdamiz/jarvis#one-command-docker-install-servervm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read Preview Install Guide
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border/80 bg-card/70">
                <a
                  href="https://github.com/snowdamiz/jarvis"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Watch Launch Progress
                  <ChevronRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-primary.svg" alt="Loom" className="h-7 w-auto" />
            <div>
              <p className="font-display text-sm font-semibold tracking-tight">Loom</p>
              <p className="text-xs text-muted-foreground">Open-source autonomous runtime with operator control</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              Proof
            </a>
            <a href="#autonomy-loop" className="transition-colors hover:text-foreground">
              Workflow
            </a>
            <a href="#governance" className="transition-colors hover:text-foreground">
              Safety
            </a>
            <a
              href="https://github.com/snowdamiz/jarvis"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
