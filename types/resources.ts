export interface ResourceLink {
  label: string;
  url: string;
  id: string;
  gtmLabel: string;
}

export interface Resource {
  id?: string;
  title: string;
  description: string;
  links: ResourceLink[];
}

export interface ResourceFolder {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  resources: Resource[];
}
