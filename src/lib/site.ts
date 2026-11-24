/**
 * Public contact details for the product site. Set NEXT_PUBLIC_CONTACT_EMAIL
 * to the address that should receive enquiries. Until it is set, the site
 * shows no "book a walkthrough" button rather than a dead link.
 */
export function contactEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export function walkthroughHref(): string | null {
  const email = contactEmail();
  if (!email) return null;
  const subject = encodeURIComponent("Civitas walkthrough");
  const body = encodeURIComponent("Hello,\n\nWe would like to see Civitas.\n\nOrganisation:\nRole:\nWhat we manage (roads, water, electricity, facilities):\n");
  return `mailto:${email}?subject=${subject}&body=${body}`;
}
