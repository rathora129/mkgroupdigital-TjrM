const siteConfig = {
  name: 'MK Group Digital',
  legalName: 'MK Group Digital',
  url: 'https://mkgroupdigital.com',
  tagline: 'We build digital experiences that drive growth.',
  description:
    'MK Group Digital is a full-service IT, software development and digital solutions company building websites, business applications and growth systems for clients in India and worldwide.',
  email: 'query@mkgroupdigital.com',
  personalEmail: 'rathora129@gmail.com',
  phone: '+91 8076689539',
  phoneHref: 'tel:+918076689539',
  whatsappNumber: '918076689539',
  whatsappMessage: 'Hello MK Group Digital, I would like to discuss a project.',
  whatsappUrl:
    'https://wa.me/918076689539?text=Hello%20MK%20Group%20Digital%2C%20I%20would%20like%20to%20discuss%20a%20project.',
  whatsappFloatUrl:
    'https://wa.me/918076689539?text=Hello%20MK%20Group%20Digital%2C%20I%20want%20to%20discuss%20a%20project.',
  location: 'India · Working with clients worldwide',
  availability: 'Available for new projects',
  responseTime: 'We reply within one business day',
  social: {
    instagram: 'https://www.instagram.com/',
    instagramPending: true,
    instagramQr: '/contact/mkgroupdigital-qr.png',
  },
  nav: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Services', href: '/services' },
    { label: 'Industries', href: '/industries' },
    { label: 'Work', href: '/work' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Contact', href: '/contact' },
  ],
  cta: { label: "Let's Talk", href: '/contact' },
};

export const emailHref = `mailto:${siteConfig.email}`;
export const whatsappHref = siteConfig.whatsappUrl;
export const telHref = siteConfig.phoneHref;

export default siteConfig;
