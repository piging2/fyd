export function SectionNavigation({ items }: { items: { id: string; label: string }[] }) {
  const links = (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map(({ id, label }) => (
        <li key={id}>
          <a href={"#" + id} className="inline-flex min-h-11 items-center py-2 font-medium text-honey-text underline underline-offset-4">
            {label}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <nav aria-label="On this page" className="mb-8 rounded-lg border border-border-soft px-4 py-2 text-sm">
      <details className="md:hidden">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-text">On this page</summary>
        {links}
      </details>
      <div className="hidden md:block">
        <p className="pt-2 font-semibold text-text">On this page</p>
        {links}
      </div>
    </nav>
  );
}
