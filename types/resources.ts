export interface ResourceLink {
  label: string;
  url: string;
  id: string;
  gtmLabel: string;
  position?: number;
}

export interface Resource {
  id?: string;
  title: string;
  description: string;
  position?: number;
  links: ResourceLink[];
}

export interface ResourceFolder {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  position?: number;
  resources: Resource[];
}
