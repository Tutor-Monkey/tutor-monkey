"use client";

interface ResourceLink {
  label: string;
  url: string;
  id: string;
  gtmLabel: string;
  position?: number;
}

interface ResourceCardProps {
  title: string;
  description: string;
  links: ResourceLink[];
}

export default function ResourceCard({ title, description, links }: ResourceCardProps) {
  const sortedLinks = (links ?? []).slice().sort((a, b) => {
    if (typeof a.position === "number" && typeof b.position === "number") return a.position - b.position;
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col items-start">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-gray-600 mb-4 text-sm">{description}</p>

      <div className="w-full grid gap-2">
        {sortedLinks.map((link) => (
          <a
            key={link.id}
            id={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 text-sm text-gray-700 hover:underline bg-gray-50 rounded px-3 py-2"
            data-gtm="download"
            data-gtm-label={link.gtmLabel}
            aria-label={`Open ${link.gtmLabel}`}
          >
            <span className="text-xs text-gray-500">📄</span>
            <span>{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
