export function toWorkspaceProfile(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    timezone: workspace.timezone,
    businessEmail: workspace.businessEmail || null,
    businessPhone: workspace.businessPhone || null,
    businessAddress: workspace.businessAddress || null,
    websiteUrl: workspace.websiteUrl || null,
    brandColor: workspace.brandColor || null,
    logoUrl: workspace.logoUrl || null,
    preferences: workspace.preferences || {},
  };
}
