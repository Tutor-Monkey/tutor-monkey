import Navigation from "@/components/Navigation";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceFolder from "@/components/resources/ResourceFolder";
import { readResources } from "@/lib/resources";
import { ResourceFolder as ResourceFolderType } from "@/types/resources";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const resources: ResourceFolderType[] = await readResources();

  return (
    <main className="min-h-screen bg-white">
      <Navigation />
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-8 animate-fade-in-up font-display">
            Free Study & Review Resources
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-12 animate-fade-in-up animation-delay-200 max-w-3xl mx-auto font-light">
            Access free study guides, review sheets, and practice materials for a variety of subjects. More coming soon!
          </p>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          {resources
            // Ensure folders are ordered by position then title as a safe fallback
            .slice()
            .sort((a, b) => {
              if (typeof a.position === "number" && typeof b.position === "number") return a.position - b.position;
              return a.title.localeCompare(b.title);
            })
            .map((folder) => (
              <ResourceFolder key={folder.id ?? folder.title} title={folder.title} defaultOpen={folder.defaultOpen}>
                {folder.resources
                  .slice()
                  .sort((x, y) => {
                    if (typeof x.position === "number" && typeof y.position === "number") return x.position - y.position;
                    return x.title.localeCompare(y.title);
                  })
                  .map((resource) => (
                    <ResourceCard
                      key={resource.id ?? resource.title}
                      title={resource.title}
                      description={resource.description}
                      links={resource.links}
                    />
                  ))}
              </ResourceFolder>
            ))}
        </div>
      </section>
    </main>
  );
}
