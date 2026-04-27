interface PageHeroProps {
  kicker: string;
  title: string;
  pill?: string;
}

export function PageHero({ kicker, title, pill }: PageHeroProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-500">{kicker}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{title}</h2>
      </div>
      {pill ? (
        <p className="text-sm font-medium text-slate-500">{pill}</p>
      ) : null}
    </div>
  );
}
