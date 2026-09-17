/**
 * Company Authority Types
 * 
 * Company profile as a constitutional authority.
 */

export interface SocialLink {
  platform: string;
  label: string;
  url: string;
}

export interface Owner {
  name: string;
  title: string;
  focus: string;
}

export interface Address {
  city: string;
  region: string;
  country: string;
}

export interface Proof {
  projectsCompleted: string;
  estimateResponse: string;
  yearsInBusiness: string;
  insured: boolean;
  bonded: boolean;
  serviceCounties: string[];
}

export interface Company {
  name: string;
  legalName: string;
  tagline: string;
  description: string;
  ccbNumber: string;
  email: string;
  phone: string;
  phoneDisplay: string;
  address: Address;
  serviceArea: string;
  businessHours: string;
  social: SocialLink[];
  owners: Owner[];
  proof: Proof;
}

export interface CompanyManifest {
  version: string;
  generatedAt: string;
  company: Company;
}
