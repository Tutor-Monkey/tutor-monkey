"use client";

import Navigation from "@/components/Navigation";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceFolder from "@/components/resources/ResourceFolder";
import { ResourceFolder as ResourceFolderType } from "@/types/resources";

const resources: ResourceFolderType[] = [
  {
    title: "AP Calculus BC",
    resources: [
      {
        title: "AP Calculus BC Limits Review",
        description: "Unit 1 review for limits",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1M9-yXpW2lZypi5f5BZZI5yqf9ipVnqQN/view?usp=sharing",
            id: "calc-bc-limits-pdf",
            gtmLabel: "AP Calculus BC Limits Review PDF"
          },
          {
            label: "View Key",
            url: "https://drive.google.com/file/d/1VcbykiwHt6-4fw1gi4TV_atsV7b3i6H_/view?usp=sharing",
            id: "calc-bc-limits-key",
            gtmLabel: "AP Calculus BC Limits Review Key"
          }
        ]
      },
      {
        title: "AP Calculus BC Derivatives Review",
        description: "Units 2.1-2.5 review for derivatives",
        links: [
          {
            label: "Review 2.1",
            url: "https://drive.google.com/file/d/1qMhl0h9R0uZZyJVLIwMsTL0ArH_35Vp_/view?usp=drive_link",
            id: "calc-bc-deriv-2-1",
            gtmLabel: "AP Calculus BC Derivatives Review 2.1"
          },
          {
            label: "Review 2.2-2.5",
            url: "https://drive.google.com/file/d/1_kXDl4BmCaOBegT4lRYh9EQE3Bsle_uj/view?usp=drive_link",
            id: "calc-bc-deriv-2-2-2-5",
            gtmLabel: "AP Calculus BC Derivatives Review 2.2-2.5"
          }
        ]
      },
      {
        title: "AP Calculus BC Chapter 2 Review",
        description: "Comprehensive review for Chapter 2 (derivatives)",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1Cjrd9HmldQ7blnSCMOx4OzHPUpIl1aLN/view?usp=sharing",
            id: "calc-bc-deriv-ch2-review",
            gtmLabel: "AP Calculus BC Chapter 2 Review PDF"
          }
        ]
      },
      {
        title: "AP Calculus BC Chapter 2 Quiz Review",
        description: "Quiz review for derivatives",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1H0b9v1Nui-DidBVavfN72U7OhvjZAAkh/view?usp=sharing",
            id: "calc-bc-deriv-ch2-quiz",
            gtmLabel: "AP Calculus BC Chapter 2 Quiz Review PDF"
          },
          {
            label: "View Key",
            url : "https://drive.google.com/file/d/1i9STo-CRN8H2lGnjv6aeHvu1fJkTuYC1/view?usp=sharing",
            id: "calc-bc-deriv-ch2-quiz-key",
            gtmLabel: "AP Calculus BC Chapter 2 Quiz Review Key"
          }
        ]
      },
      {
        title: "AP Calculus BC CH2 2.3-2.4 Quiz",
        description: "Quiz covering derivative rules 2.3-2.4",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1yk_mgxmIlJGk2OosBupwbTmmCwoz3qdV/view?usp=sharing",
            id: "calc-bc-deriv-ch2-2-3-2-4-quiz",
            gtmLabel: "AP Calculus BC CH2 2.3-2.4 Quiz PDF"
          }
        ]
      },
      {
        title: "AP Calculus BC CH2 2.5-2.6 Quiz",
        description: "Quiz covering derivative rules 2.5-2.6",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1tg2k3I_wMcWW5y0IhVux7GYKS7ONAaO2/view?usp=sharing",
            id: "calc-bc-deriv-ch2-2-5-2-6-quiz",
            gtmLabel: "AP Calculus BC CH2 2.5-2.6 Quiz PDF"
          }
        ]
      },
      {
        title: "AP Calculus BC Optimization Worksheet",
        description: "Practice problems focused on optimization applications of derivatives",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1nfyHPY5CJvBR4KATlOKEgCn-bbzOcdvk/view?usp=sharing",
            id: "calc-bc-optimization-worksheet",
            gtmLabel: "AP Calculus BC Optimization Worksheet PDF"
          }
        ]
      },
      {
        title: "AP Calculus BC Integration and Differential Equations",
        description: "Review covering integration techniques and differential equations practice",
        links: [
          {
            label: "View PDF",
            url: "https://drive.google.com/file/d/1fXmUMMEHYn3MCkM5QI85LWoZbgviPg-5/view?usp=sharing",
            id: "calc-bc-integration-diff-eq",
            gtmLabel: "AP Calculus BC Integration and Differential Equations PDF"
          }
        ]
      }
    ]
  },
  {
    title: "Biology",
    resources: [
      {
        title: "Cell Transport Review Worksheet",
        description: "Practice questions reviewing diffusion, osmosis, and active transport concepts.",
        links: [
          {
            label: "View Worksheet",
            url: "https://drive.google.com/file/d/1sn9MyV1LrzrLTM0_lR4erxHGZKJcgomy/view?usp=sharing",
            id: "biology-cell-transport-review",
            gtmLabel: "Biology Cell Transport Review Worksheet PDF"
          }
        ]
      }
    ]
  }
];

export default function ResourcesPage() {
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
          {resources.map((folder, folderIndex) => (
            <ResourceFolder key={folderIndex} title={folder.title} defaultOpen={folder.defaultOpen}>
              {folder.resources.map((resource, resourceIndex) => (
                <ResourceCard
                  key={resourceIndex}
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
