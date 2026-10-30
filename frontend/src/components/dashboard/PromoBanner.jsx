import { BrainCircuit } from 'lucide-react'

/** Decorative teal banner kept from the design (plan §4) – static text, no data. */
export default function PromoBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(160deg,var(--teal-card-from)_0%,var(--teal-card-to)_100%)] p-5 text-white shadow-[0_18px_40px_-24px_rgb(11_85_96/0.8)]">
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-mint/15 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 left-6 size-32 rounded-full bg-white/10 blur-2xl" />
      <span className="relative flex size-11 items-center justify-center rounded-full bg-white/10 text-mint ring-1 ring-white/15">
        <BrainCircuit className="size-5" aria-hidden="true" />
      </span>
      <p className="relative mt-5 text-base font-semibold">Forecast. Prevent. Save.</p>
      <p className="relative mt-1 text-sm text-white/75">ML forecasts and rule-based advice for a reliable supply chain.</p>
    </div>
  )
}
