export const projects = [
  {
    slug: 'rooteco',
    name: 'RootsEco',
    industry: 'Corporate Gifting',
    services: [
      'E-commerce Development',
      'Website Development',
      'UI/UX Design',
      'Custom Web Applications',
    ],
    image: '/projects/rooteco.jpg',
    imageWide: '/projects/rooteco-wide.jpg',
    imageAlt:
      'RootsEco corporate gifting brand cover with the RootsEco seal on a deep green background',
    url: 'https://www.rootseco.com/',
    status: 'Live',
    featured: true,
    summary:
      'A full corporate-gifting storefront and owner dashboard, managed from one connected system.',
    overview: [
      'RootsEco is a corporate gifting storefront built as a single, connected system. The public site presents products, collections and a build-your-own-hamper flow, while a private owner dashboard manages the catalogue, orders, quotes, leads and website content.',
      'The result is a storefront that is straightforward for customers and practical for the team running it — with content, commerce and enquiries living in the same place.',
    ],
    highlights: [
      'Product catalogue with categories, variants and customisation',
      'Build-your-own-hamper flow and quote requests',
      'Owner dashboard covering orders, leads, content and SEO',
    ],
  },
  {
    slug: 'multigraphics',
    name: 'Multigraphics Group',
    industry: 'Printing & Assessment Technology',
    services: ['Website Development', 'UI/UX Design'],
    image: '/projects/multigraphics.jpg',
    imageAlt:
      'Multigraphics Group website hero presenting print, assessment and learning platforms',
    url: 'https://multigraphics.in/',
    status: 'Live',
    featured: false,
    summary:
      'A group website bringing print production, OMR assessment and learning platforms under one clear brand.',
    overview: [
      'Multigraphics Group operates across print production, InstaOMR assessment technology and learning platforms. The website needed to present three related but distinct offerings without diluting the group brand.',
      'We built a clear group-level structure with a distinct story for each service line and straightforward enquiry paths throughout.',
    ],
    highlights: [
      'Group-level structure across three business offerings',
      'Product storytelling for print, assessment and learning',
      'Clear enquiry paths for each service line',
    ],
  },
  {
    slug: 'dice-academy',
    name: 'Dice Academy',
    industry: 'Education & Training',
    services: ['Website Development', 'UI/UX Design'],
    image: '/projects/dice-academy.jpg',
    imageAlt:
      'Dice Academy website hero promoting UGC-recognised degrees and industry training',
    url: 'https://www.dice-academy.com/',
    status: 'Live',
    featured: true,
    summary:
      'A conversion-focused site for a UGC-recognised degree and industry training academy in Delhi NCR.',
    overview: [
      'Dice Academy presents UGC-recognised degree programmes alongside industry training, with a course ladder that runs from a six-month certificate to a three-year degree.',
      'The website makes programme options easy to compare, keeps enrolment and demo booking visible, and gives the academy a current, responsive presence across devices.',
    ],
    highlights: [
      'Programme ladder from certificate to degree',
      'Demo booking and enrolment calls to action',
      'Responsive programme content for mobile visitors',
    ],
  },
  {
    slug: 'tech-assistant',
    name: 'Tech Assistant',
    industry: 'Technology & Software',
    services: ['Website Development', 'UI/UX Design'],
    image: '/projects/techassistant.jpg',
    imageAlt:
      'Tech Assistant website hero for a custom software development company in India',
    url: 'https://www.techassistant.co.in/',
    status: 'Live',
    featured: false,
    summary:
      'A modern website for a Lucknow-based custom software company, with a conversational enquiry entry point.',
    overview: [
      'Tech Assistant builds custom software for clients in India and abroad. Its website needed to explain a broad service range quickly and make starting a conversation feel easy.',
      'The site pairs a clear service story with a conversational enquiry experience, backed by a fast, responsive marketing build.',
    ],
    highlights: [
      'Service positioning for a custom software company',
      'Conversational enquiry entry point',
      'Fast, responsive marketing site',
    ],
  },
  {
    slug: 'oraanj-interiors',
    name: 'Ooraanj Interiors',
    industry: 'Interior Design',
    services: ['Website Development', 'UI/UX Design'],
    image: '/projects/oraanj.jpg',
    imageAlt:
      'Ooraanj Interiors website hero presenting bespoke London residential and commercial interiors',
    url: 'https://oraanj-interiors.co.uk/',
    status: 'Live',
    featured: true,
    summary:
      'A premium website for a London interior design and design & build studio serving UK and international clients.',
    overview: [
      'Ooraanj Interiors designs and delivers residential and commercial interiors across London. The website needed to communicate a high-end design sensibility while making a complex service range easy to navigate.',
      'The site presents interior design, renovation and design & build services with project storytelling and clear consultation paths for local and overseas clients.',
    ],
    highlights: [
      'Service architecture across residential, commercial and renovation',
      'Project storytelling with before-and-after content',
      'Consultation and enquiry flows for UK and overseas clients',
    ],
  },
  {
    slug: 'havelock-island-beach-resort',
    name: 'Havelock Island Beach Resort',
    industry: 'Hospitality & Tourism',
    services: ['Website Development', 'UI/UX Design'],
    image: '/projects/havelock-island-beach-resort.jpg',
    imageAlt:
      'Havelock Island Beach Resort website showing an aerial view of the resort, pool and beach',
    url: 'https://www.havelockislandbeachresort.com/',
    status: 'Live',
    featured: true,
    summary:
      'A booking-focused website for a beachfront resort in the Andaman Islands, with room search, packages and direct reservation paths.',
    overview: [
      'Havelock Island Beach Resort is a beach property in the Andaman and Nicobar Islands. Its website presents the resort, rooms and activities, and lets visitors check availability and plan a stay in one place.',
      'The build puts the booking flow front and centre — availability search, packages and gallery content — with clear contact paths for guests and travel agents.',
    ],
    highlights: [
      'Availability search with check-in, check-out and room selection',
      'Resort packages and activities presented clearly',
      'Separate paths for guests, agents and direct enquiries',
    ],
  },
  {
    slug: 'andaman-island',
    name: 'Andaman Island',
    industry: 'Travel & Tourism',
    services: ['Website Development'],
    image: '/projects/andaman-island.jpg',
    imageAlt:
      'Andaman Island tourism website hero presenting tour packages and island destinations',
    url: 'https://www.andamanisland.in/',
    status: 'Live',
    featured: true,
    summary:
      'A tourism portal for the Andaman Islands covering tour packages, island destinations, activities and trip planning.',
    overview: [
      "Andaman Island brings the region's tours, islands, water sports and stay options into a single planning experience for travellers researching a trip.",
      'The site is structured around how visitors actually plan — browsing destinations and packages first, then reaching a booking or enquiry conversation through clear contact and chat options.',
    ],
    highlights: [
      'Tour packages and island destinations in one place',
      'Activities, water sports and trip-planning content',
      'Live chat and enquiry paths for booking assistance',
    ],
  },
];

export const featuredProjects = projects.filter((project) => project.featured);

export const getProjectBySlug = (slug) =>
  projects.find((project) => project.slug === slug);

export default projects;
