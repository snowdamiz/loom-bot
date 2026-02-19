import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronRight,
  CirclePlay,
  Compass,
  Eye,
  Infinity,
  Key,
  Quote,
  Puzzle,
  Sparkles,
  Star,
  WandSparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type Step = {
  title: string;
  description: string;
  metric: string;
};

type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

type PricingTier = {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
};

const navItems = [
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Proof', href: '#proof' },
  { label: 'Pricing', href: '#pricing' },
];

const stats = [
  { value: 'Any domain', label: 'No vertical limits' },
  { value: 'Self-extending', label: 'Builds its own tools' },
  { value: 'Zero config', label: 'Sets up its own stack' },
  { value: '24/7', label: 'Fully autonomous execution' },
];

const features: Feature[] = [
  {
    title: 'Domain-agnostic intelligence',
    description:
      'Not locked to coding, marketing, or support. Give Jarvis any task in any field and it understands the domain, identifies what it needs, and gets to work.',
    icon: Compass,
  },
  {
    title: 'Self-extending capabilities',
    description:
      'When Jarvis needs a tool it doesn\'t have, it finds one, installs it, and wires it up. It builds integrations on demand rather than waiting for you to configure them.',
    icon: Puzzle,
  },
  {
    title: 'Opens its own accounts',
    description:
      'Need a service to complete a task? Jarvis signs up, authenticates, and starts using it. No manual setup, no credential juggling — it handles the entire onboarding itself.',
    icon: Key,
  },
  {
    title: 'Adaptive reasoning',
    description:
      'Jarvis doesn\'t follow static scripts. It evaluates context, adjusts strategy mid-task, recovers from failures, and learns from outcomes to improve over time.',
    icon: BrainCircuit,
  },
  {
    title: 'True end-to-end autonomy',
    description:
      'From understanding your intent to delivering the result, Jarvis operates independently. It plans, executes, verifies, and iterates without hand-holding.',
    icon: Infinity,
  },
  {
    title: 'Full transparency',
    description:
      'Every decision, tool call, and account action is logged with reasoning. You see exactly what Jarvis did, why it did it, and what it plans to do next.',
    icon: Eye,
  },
];

const steps: Step[] = [
  {
    title: 'Describe what you need',
    description:
      'Tell Jarvis what you want done in plain language. Any domain, any complexity. It figures out the scope, the tools required, and the strategy on its own.',
    metric: 'Step 01',
  },
  {
    title: 'Jarvis builds its own toolkit',
    description:
      'It evaluates what integrations, accounts, and tools are needed — then sets them up autonomously. APIs, databases, third-party services — whatever the task demands.',
    metric: 'Step 02',
  },
  {
    title: 'Autonomous execution with full visibility',
    description:
      'Jarvis works through the task end-to-end while streaming every decision and action to your dashboard. Intervene if you want, or let it finish on its own.',
    metric: 'Step 03',
  },
];

const testimonials: Testimonial[] = [
  {
    quote:
      'I told Jarvis to set up our entire customer feedback pipeline. It signed up for the tools, built the integrations, and had it running before lunch.',
    name: 'Lena Park',
    role: 'Founder, Northline',
  },
  {
    quote:
      'The fact that it extends itself is what sold me. I don\'t configure anything — I just describe the outcome and Jarvis figures out the path.',
    name: 'Marcus Vale',
    role: 'CTO, Arcstone',
  },
  {
    quote:
      'We use it for everything from data scraping to ops automation to content generation. There is no single domain — that\'s the whole point.',
    name: 'Iris Castillo',
    role: 'Head of Product, Skyrift',
  },
];

const pricingTiers: PricingTier[] = [
  {
    name: 'Starter',
    price: '$49',
    description: 'For individuals exploring fully autonomous workflows.',
    features: ['1 active agent', 'Self-setup integrations', 'Real-time activity feed', 'Community support'],
  },
  {
    name: 'Growth',
    price: '$149',
    description: 'For power users running complex multi-domain operations.',
    features: ['Unlimited agent runs', 'Autonomous account creation', 'Priority execution queue', 'Priority support'],
    highlighted: true,
  },
  {
    name: 'Scale',
    price: 'Custom',
    description: 'For organizations with advanced governance and scale needs.',
    features: ['SSO + audit exports', 'Custom deployment', 'Policy guardrails', 'Dedicated success team'],
  },
];

const faqs = [
  {
    question: 'What does "domain-agnostic" actually mean?',
    answer:
      'Jarvis is not pre-built for a specific use case. It works across any field — development, marketing, research, operations, data analysis — by understanding context and assembling the right tools on the fly.',
  },
  {
    question: 'How does it set up its own integrations?',
    answer:
      'When Jarvis identifies that a task requires a tool or service it doesn\'t have access to, it autonomously finds the right integration, signs up if needed, authenticates, and connects it to the workflow.',
  },
  {
    question: 'Is it safe to let an AI open accounts and use services?',
    answer:
      'Yes. You can set approval gates for high-impact actions, define spending limits, and restrict which services Jarvis can access. Every action is logged with full reasoning so you maintain visibility and control.',
  },
];

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-grain-radial" />
      <div className="pointer-events-none absolute inset-0 -z-10 surface-grid opacity-30" />
      <div className="pointer-events-none absolute -top-32 left-[-10rem] -z-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-drift" />
      <div className="pointer-events-none absolute right-[-12rem] top-[24rem] -z-10 h-96 w-96 rounded-full bg-secondary/20 blur-3xl animate-float" />

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
          <a href="#" className="group inline-flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Jarvis</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
            <Button
              size="sm"
              className="group bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            >
              Start free
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl gap-14 px-6 pb-16 pt-20 md:grid-cols-[1.08fr_0.92fr] md:pt-24">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="animate-rise border-primary/30 bg-primary/10 px-4 py-1.5 font-medium text-primary"
            >
              The first truly autonomous AI agent
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-2xl text-balance font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Tell it what you want. <span className="text-primary">It figures out the rest.</span>
              </h1>
              <p className="max-w-xl text-balance text-lg text-muted-foreground sm:text-xl">
                Jarvis is a fully autonomous AI agent that works across any domain. It sets up its own integrations, opens its own accounts, and extends its own capabilities — whatever your task demands.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="group bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                Get started
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Button>
              <Button size="lg" variant="outline" className="border-border/80 bg-card/70 backdrop-blur-sm">
                <CirclePlay className="h-4 w-4" />
                See it in action
              </Button>
            </div>

            <div className="flex flex-wrap gap-2.5 text-sm text-muted-foreground">
              {['Any domain, any task', 'Self-configuring', 'Complete autonomy'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Hero card */}
          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-primary/30 via-transparent to-secondary/30 blur-3xl" />
            <Card className="relative w-full max-w-md overflow-hidden border-border/60 bg-card shadow-2xl shadow-primary/15 backdrop-blur-xl animate-rise [animation-delay:120ms]">
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3.5 py-2">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-1.5 text-[11px] text-muted-foreground">jarvis &mdash; autonomous agent</span>
              </div>
              <div className="border-b border-border/60 bg-primary/[0.06]">
                <CardHeader className="space-y-2 px-5 pb-4 pt-4">
                  <div className="flex items-center justify-between">
                    <Badge className="w-fit border border-primary/30 bg-primary/15 text-xs text-primary">Live Agent Feed</Badge>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Running
                    </span>
                  </div>
                  <CardTitle className="font-display text-lg">Task: Set up analytics pipeline</CardTitle>
                  <CardDescription className="text-xs">
                    Autonomously configuring integrations and executing workflow.
                  </CardDescription>
                </CardHeader>
              </div>
              <CardContent className="relative space-y-3 px-5 pb-5 pt-4">
                {[
                  { action: 'Signed up for Mixpanel', status: 'Done', color: 'bg-primary' },
                  { action: 'Connected API to data source', status: 'Done', color: 'bg-secondary' },
                  { action: 'Building event tracking schema', status: 'Active', color: 'bg-accent' },
                ].map((item, index) => (
                  <div
                    key={item.action}
                    className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-sm animate-rise"
                    style={{ animationDelay: `${220 + index * 120}ms` }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold tracking-tight">{item.action}</span>
                      <span className={`inline-flex items-center gap-1.5 ${item.status === 'Active' ? 'text-accent' : 'text-muted-foreground'}`}>
                        {item.status === 'Active' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-xs text-foreground shadow-sm shadow-secondary/10">
                  <div className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-semibold">
                    <WandSparkles className="h-3.5 w-3.5 text-secondary" />
                    Next action
                  </div>
                  <p className="text-muted-foreground">
                    Will create dashboard views and set up automated weekly reports once schema is live.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/60 bg-card/70 px-5 py-5 backdrop-blur-sm animate-rise"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <p className="font-display text-2xl font-semibold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-4">
              <Badge variant="outline" className="border-secondary/30 bg-secondary/10 text-secondary">
                Capabilities
              </Badge>
              <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                One agent. Any task. Zero configuration.
              </h2>
            </div>
            <p className="max-w-md text-muted-foreground">
              Jarvis doesn't need you to set things up. It identifies what's required, extends itself, and delivers results across any domain.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature, index) => {
              const iconColors = [
                'bg-primary/10 text-primary',
                'bg-secondary/10 text-secondary',
                'bg-accent/10 text-accent',
              ];
              const hoverColors = [
                'hover:border-primary/50 hover:shadow-primary/10',
                'hover:border-secondary/50 hover:shadow-secondary/10',
                'hover:border-accent/50 hover:shadow-accent/10',
              ];
              const colorIdx = index % 3;
              return (
                <Card
                  key={feature.title}
                  className={`group border-border/70 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${hoverColors[colorIdx]} animate-rise`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <CardHeader className="space-y-4">
                    <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconColors[colorIdx]} transition-transform duration-300 group-hover:scale-110`}>
                      <feature.icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="font-display text-2xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="grid gap-10 rounded-[2rem] border border-border/70 bg-card/75 p-8 backdrop-blur-sm lg:grid-cols-[0.8fr_1.2fr] lg:p-12">
            <div className="space-y-5">
              <Badge className="w-fit bg-primary/10 text-primary">How it works</Badge>
              <h3 className="font-display text-4xl font-semibold tracking-tight">You describe the goal. Jarvis handles everything else.</h3>
              <p className="text-muted-foreground">
                No integrations to configure, no workflows to build, no accounts to create. Jarvis autonomously assembles whatever it needs to get the job done.
              </p>
              <Button variant="outline" className="w-fit border-border/80 bg-background/70">
                See the architecture
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative space-y-4">
              {steps.map((step, index) => (
                <Card
                  key={step.metric}
                  className="border-border/70 bg-background/80 animate-rise"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <CardHeader className="flex items-start gap-4">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/[0.08] font-display text-sm font-semibold text-primary">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1">
                      <CardTitle className="font-display text-2xl">{step.title}</CardTitle>
                      <p className="mt-2 text-muted-foreground">{step.description}</p>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section id="proof" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-12 space-y-4 text-center">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              Early adopters
            </Badge>
            <h3 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              People are using Jarvis for things we never planned.
            </h3>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {testimonials.map((entry, index) => {
              const colors = ['bg-primary/10 text-primary', 'bg-secondary/10 text-secondary', 'bg-accent/10 text-accent'];
              const initials = entry.name.split(' ').map((n) => n[0]).join('');
              return (
                <Card
                  key={entry.name}
                  className="border-border/70 bg-card/80 backdrop-blur-sm animate-rise"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <CardContent className="space-y-4 p-6">
                    <Quote className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-base leading-relaxed text-foreground">{entry.quote}</p>
                    <div className="flex items-center gap-1 pt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-secondary text-secondary" />
                      ))}
                    </div>
                    <div className="flex items-center gap-3 border-t border-border/60 pt-4">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${colors[index % 3]}`}>
                        {initials}
                      </span>
                      <div>
                        <p className="font-semibold leading-tight">{entry.name}</p>
                        <p className="text-sm text-muted-foreground">{entry.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-12 space-y-4">
            <Badge variant="outline" className="border-secondary/30 bg-secondary/10 text-secondary">
              Pricing
            </Badge>
            <h3 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Autonomy at every scale.
            </h3>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-3">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={[
                  'border-border/70 bg-card/80 backdrop-blur-sm transition-all duration-300',
                  tier.highlighted
                    ? 'relative border-primary/60 shadow-xl shadow-primary/20 ring-1 ring-primary/20 lg:scale-105'
                    : 'hover:-translate-y-1 hover:shadow-lg',
                ].join(' ')}
              >
                {tier.highlighted && (
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                )}
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-3xl">{tier.name}</CardTitle>
                    {tier.highlighted && (
                      <Badge className="bg-primary text-primary-foreground">Most popular</Badge>
                    )}
                  </div>
                  <CardDescription>{tier.description}</CardDescription>
                  <p className="font-display text-4xl font-semibold tracking-tight">
                    {tier.price}
                    {tier.price !== 'Custom' && <span className="text-lg font-normal text-muted-foreground">/mo</span>}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={[
                      'w-full',
                      tier.highlighted ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background hover:bg-foreground/90',
                    ].join(' ')}
                  >
                    Choose {tier.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-border/70 bg-card/80 p-2 backdrop-blur-sm">
              <CardHeader className="space-y-4">
                <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
                  FAQ
                </Badge>
                <CardTitle className="font-display text-3xl">Common questions</CardTitle>
                <CardDescription className="text-base">
                  What people ask when they first hear about a self-extending autonomous agent.
                </CardDescription>
                <p className="text-sm text-muted-foreground">
                  Have another question?{' '}
                  <a href="#" className="font-medium text-primary underline-offset-4 hover:underline">
                    Reach out to us
                  </a>
                </p>
              </CardHeader>
            </Card>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card
                  key={faq.question}
                  className="border-border/70 bg-card/80 backdrop-blur-sm animate-rise"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">{faq.question}</CardTitle>
                    <CardDescription className="text-base">{faq.answer}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-r from-primary/90 via-primary to-secondary p-2 text-primary-foreground shadow-2xl shadow-primary/30">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.22),transparent_42%)]" />
            <CardContent className="relative flex flex-col items-start gap-6 p-8 sm:p-10 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm">
                  <Sparkles className="h-4 w-4" />
                  Complete autonomy starts here.
                </p>
                <h3 className="max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                  Give Jarvis a goal and get out of the way.
                </h3>
              </div>
              <Button
                size="lg"
                className="bg-white text-primary shadow-lg shadow-black/20 transition-transform duration-300 hover:scale-[1.03] hover:bg-white/95"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display font-semibold text-foreground">Jarvis</p>
              <p className="text-xs">Autonomous intelligence that extends itself.</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <a href="#capabilities" className="transition-colors hover:text-foreground">Capabilities</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#" className="transition-colors hover:text-foreground">Terms</a>
            <a href="#" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#" className="transition-colors hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
