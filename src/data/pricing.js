export const pricingGroups = [
  {
    id: 'websites',
    title: 'Website Development',
    icon: 'Code2',
    note: 'Every website is responsive, fast and structured so search engines and customers can both find their way.',
    plans: [
      {
        name: 'Starter Website',
        price: '₹5,000',
        cadence: 'onwards',
        features: [
          'Basic business website',
          'Up to 5 pages',
          'Responsive design',
          'Contact form',
          'Basic SEO setup',
        ],
      },
      {
        name: 'Business Website',
        price: '₹15,000',
        cadence: 'onwards',
        features: [
          'Professional multi-page website',
          'Custom UI/UX',
          'Responsive layouts',
          'Enquiry integration',
          'SEO-friendly structure',
        ],
      },
      {
        name: 'Professional Website',
        price: '₹30,000',
        cadence: 'onwards',
        features: [
          'Advanced website',
          'Dynamic pages',
          'CMS or dashboard integration where applicable',
          'API integrations',
          'Advanced UI/UX',
        ],
      },
      {
        name: 'E-commerce Website',
        price: '₹40,000',
        cadence: 'onwards',
        features: [
          'Product catalogue',
          'Shopping cart',
          'Checkout integration',
          'Order management',
          'Admin functionality',
        ],
      },
    ],
  },
  {
    id: 'software',
    title: 'Custom Software Development',
    icon: 'Cpu',
    note: 'Built for shops, retail stores, distributors, wholesalers and small businesses that have outgrown spreadsheets and registers.',
    plans: [
      {
        name: 'Basic Business Software',
        price: '₹25,000',
        cadence: 'onwards',
        features: [
          'Basic inventory or customer management',
          'Admin dashboard',
          'Data management',
        ],
      },
      {
        name: 'Business Management Software',
        price: '₹50,000',
        cadence: 'onwards',
        features: [
          'Inventory and stock tracking',
          'Billing and invoices',
          'Employee records',
          'Reports and dashboard',
        ],
      },
      {
        name: 'Advanced Custom Software',
        price: '₹1,00,000',
        cadence: 'onwards',
        features: [
          'Multi-user access',
          'Role-based permissions',
          'Advanced inventory',
          'Employee management',
          'CRM and sales tracking',
          'Reports and analytics',
          'Custom workflows',
        ],
      },
    ],
  },
  {
    id: 'marketing',
    title: 'Digital Marketing',
    icon: 'Megaphone',
    note: 'Advertising spend is separate from management fees. Every plan includes clear, honest reporting — no guaranteed rankings, leads or sales.',
    monthly: true,
    plans: [
      {
        name: 'Social Media Starter',
        price: '₹5,000',
        cadence: '/month onwards',
        features: [
          'Basic social media management',
          'Content planning',
          'Creative posts',
        ],
      },
      {
        name: 'SEO Management',
        price: '₹10,000',
        cadence: '/month onwards',
        features: [
          'Website SEO audit',
          'On-page SEO',
          'Keyword research',
          'Monthly reporting',
        ],
      },
      {
        name: 'Ads Management',
        price: '₹8,000',
        cadence: '/month onwards',
        features: [
          'Google Ads or Meta Ads management',
          'Campaign setup',
          'Audience targeting',
          'Performance reporting',
        ],
      },
      {
        name: 'Full Digital Marketing',
        price: '₹25,000',
        cadence: '/month onwards',
        features: [
          'SEO',
          'Social media management',
          'Google/Meta Ads management',
          'Monthly reporting',
        ],
      },
    ],
  },
];

export const pricingNotes = [
  'All prices are indicative starting prices, not guaranteed fixed quotations.',
  'Final cost depends on scope, features, integrations and requirements — confirmed in a written proposal before work begins.',
  'Hosting, domain, paid third-party services and advertising spend are separate unless explicitly included.',
  'We never promise guaranteed leads, sales or advertising results — we promise clear work, clear reporting and honest advice.',
];

export default pricingGroups;
