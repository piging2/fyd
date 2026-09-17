import type { Company } from "@/types/company";
import { getCompany } from "@/lib/company";

/**
 * Company data service — INTERFACE.
 * Today reads authority; later could read a CMS/API. Components call getCompany().
 */
export interface CompanyService {
  getCompany(): Company;
}

export const mockCompanyService: CompanyService = {
  getCompany: () => getCompany(),
};

export const companyService: CompanyService = mockCompanyService;
