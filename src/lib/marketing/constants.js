// Phase 2G vocabulary. Every list here is validated server-side; the browser
// only uses the labels. Keeping the vocabulary in one place stops a draft from
// being described as published in one screen and scheduled in another.

export const MARKETING_SERVICES = [
  { key: 'seo', label: 'SEO' },
  { key: 'local_seo', label: 'Local SEO' },
  { key: 'website_optimization', label: 'Website optimization' },
  { key: 'content_marketing', label: 'Content marketing' },
  { key: 'social_media', label: 'Social media management' },
  { key: 'google_ads_planning', label: 'Google Ads planning' },
  { key: 'meta_ads_planning', label: 'Meta Ads planning' },
  { key: 'lead_generation', label: 'Lead generation' },
  {
    key: 'conversion_rate_optimization',
    label: 'Conversion rate optimization',
  },
  { key: 'website_maintenance', label: 'Website maintenance' },
];

export const MARKETING_SERVICE_KEYS = MARKETING_SERVICES.map((item) => item.key);

export const MARKETING_SERVICE_LABELS = Object.fromEntries(
  MARKETING_SERVICES.map((item) => [item.key, item.label]),
);

export const MARKETING_CHANNELS = [
  { key: 'organic_seo', label: 'Organic SEO' },
  { key: 'local_seo', label: 'Local SEO' },
  { key: 'website', label: 'Website' },
  { key: 'blog_content', label: 'Blog / content' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'email', label: 'Email marketing' },
];

export const MARKETING_CHANNEL_KEYS = MARKETING_CHANNELS.map(
  (item) => item.key,
);

export const MARKETING_CHANNEL_LABELS = Object.fromEntries(
  MARKETING_CHANNELS.map((item) => [item.key, item.label]),
);

export const CONTENT_TYPES = [
  { key: 'content_idea', label: 'Content idea' },
  { key: 'blog_outline', label: 'Blog outline' },
  { key: 'blog_draft', label: 'Blog draft' },
  { key: 'seo_title', label: 'SEO title' },
  { key: 'meta_description', label: 'Meta description' },
  { key: 'social_caption', label: 'Social caption' },
  { key: 'social_post', label: 'Social post draft' },
  { key: 'landing_page_copy', label: 'Landing page copy' },
  { key: 'website_section', label: 'Website section content' },
  { key: 'product_description', label: 'Product description' },
  { key: 'faq', label: 'FAQ content' },
  { key: 'email_campaign', label: 'Email campaign draft' },
  { key: 'content_variation', label: 'Content variation' },
  { key: 'keyword_suggestion', label: 'Keyword suggestion' },
  { key: 'content_brief', label: 'Content brief' },
];

export const CONTENT_TYPE_KEYS = CONTENT_TYPES.map((item) => item.key);

export const CONTENT_TYPE_LABELS = Object.fromEntries(
  CONTENT_TYPES.map((item) => [item.key, item.label]),
);

export const CONTENT_PLATFORMS = [
  { key: 'website', label: 'Website' },
  { key: 'blog', label: 'Blog' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'email', label: 'Email' },
  { key: 'other', label: 'Other' },
];

export const CONTENT_PLATFORM_KEYS = CONTENT_PLATFORMS.map(
  (item) => item.key,
);

export const CONTENT_PLATFORM_LABELS = Object.fromEntries(
  CONTENT_PLATFORMS.map((item) => [item.key, item.label]),
);

export const CAMPAIGN_STATUSES = [
  'planned',
  'draft',
  'awaiting_review',
  'approved',
  'scheduled',
  'executed',
  'failed',
  'cancelled',
];

export const CAMPAIGN_STATUS_LABELS = {
  planned: 'Planned',
  draft: 'Draft',
  awaiting_review: 'Awaiting review',
  approved: 'Approved',
  scheduled: 'Scheduled (internal)',
  executed: 'Executed (recorded)',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const CONTENT_STATUSES = [
  'idea',
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'failed',
  'cancelled',
];

export const CONTENT_STATUS_LABELS = {
  idea: 'Idea',
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  scheduled: 'Scheduled (internal)',
  published: 'Published (recorded)',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const PROPOSAL_STATUSES = [
  'draft',
  'awaiting_review',
  'approved',
  'rejected',
  'executing',
  'executed',
  'cancelled',
];

export const PROPOSAL_STATUS_LABELS = {
  draft: 'Draft',
  awaiting_review: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
  executing: 'Execution in progress',
  executed: 'Executed (verified manually)',
  cancelled: 'Cancelled',
};

export const FINDING_SOURCES = [
  'verified',
  'manual',
  'ai_suggestion',
  'unverified',
];

export const FINDING_SOURCE_LABELS = {
  verified: 'Verified by local audit engine',
  manual: 'Manually entered observation',
  ai_suggestion: 'AI-generated suggestion',
  unverified: 'Unverified recommendation',
};

export const FINDING_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'];

export const FINDING_STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
};

export const METRIC_KEYS = [
  'website_sessions',
  'organic_traffic',
  'search_impressions',
  'search_clicks',
  'keyword_position',
  'leads',
  'conversion_rate',
  'content_output',
  'social_reach',
  'engagement',
  'campaign_budget',
  'campaign_spend',
  'cost_per_lead',
  'qualified_leads',
];

export const METRIC_LABELS = {
  website_sessions: 'Website sessions',
  organic_traffic: 'Organic traffic',
  search_impressions: 'Search impressions',
  search_clicks: 'Search clicks',
  keyword_position: 'Average keyword position',
  leads: 'Leads',
  conversion_rate: 'Conversion rate (%)',
  content_output: 'Content items published',
  social_reach: 'Social reach',
  engagement: 'Social engagement',
  campaign_budget: 'Campaign budget',
  campaign_spend: 'Campaign spend',
  cost_per_lead: 'Cost per lead',
  qualified_leads: 'Qualified leads',
};

export const METRIC_SOURCES = [
  'manual',
  'imported',
  'calculated',
  'ai_estimate',
];

export const METRIC_SOURCE_LABELS = {
  manual: 'Manually entered',
  imported: 'Imported',
  calculated: 'Calculated from recorded values',
  ai_estimate: 'AI estimate (not verified analytics)',
};

export const CAMPAIGN_TRANSITIONS = {
  planned: ['draft', 'cancelled'],
  draft: ['awaiting_review', 'cancelled'],
  awaiting_review: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'executed', 'cancelled'],
  scheduled: ['executed', 'failed', 'cancelled'],
  executed: [],
  failed: ['cancelled'],
  cancelled: [],
};

export const CONTENT_TRANSITIONS = {
  idea: ['draft', 'cancelled'],
  draft: ['in_review', 'cancelled'],
  in_review: ['approved', 'changes_requested', 'cancelled'],
  changes_requested: ['draft', 'in_review', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['published', 'failed', 'cancelled'],
  published: [],
  failed: ['cancelled'],
  cancelled: [],
};

export const PROPOSAL_TRANSITIONS = {
  draft: ['awaiting_review', 'cancelled'],
  awaiting_review: ['approved', 'rejected', 'draft', 'cancelled'],
  approved: ['executing', 'executed', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  executing: ['executed', 'failed', 'cancelled'],
  executed: [],
  cancelled: [],
};

export function canTransition(map, from, to) {
  return Boolean(map[from]?.includes(to));
}

// Copy used in the UI and API responses so an internal record is never
// described as an external action.
export const NO_EXTERNAL_PUBLISHING_NOTE =
  'Internal planning record only. No social network, ad platform or website was contacted.';
export const NO_EXTERNAL_EXECUTION_NOTE =
  'Execution is recorded manually. No live website, CMS, DNS or hosting change was made by this system.';
