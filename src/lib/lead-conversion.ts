import { normalizeSlug } from "@/lib/slug";

export function leadProvisionDefaults(lead: {
  restaurant_name: string;
  city: string;
  contact_name: string;
  email: string;
}) {
  return {
    organizationName: lead.restaurant_name,
    locationName: lead.restaurant_name,
    city: lead.city,
    slug: normalizeSlug(lead.restaurant_name),
    contactName: lead.contact_name,
    ownerEmail: lead.email,
  };
}
