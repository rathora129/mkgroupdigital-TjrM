import * as Yup from 'yup';
import { budgetOptions, contactMethodOptions } from '@/data/content';
import {
  industryOptions,
  projectTypes,
  serviceInterests,
  timelineOptions,
} from '@/data/enquiry';

const phonePattern = /^[+()\d\s.-]{7,20}$/;
const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}([/?#].*)?$/i;

export const contactSchema = Yup.object({
  fullName: Yup.string()
    .trim()
    .min(2, 'Please enter your full name.')
    .max(80, 'Please keep your name under 80 characters.')
    .required('Please enter your full name.'),
  company: Yup.string()
    .trim()
    .max(120, 'Please keep the company name under 120 characters.'),
  mobile: Yup.string()
    .trim()
    .required('Please enter your mobile number.')
    .test(
      'mobile-format',
      'Please enter a valid mobile number.',
      (value) => !value || phonePattern.test(value),
    ),
  whatsapp: Yup.string()
    .trim()
    .test(
      'whatsapp-format',
      'Please enter a valid WhatsApp number.',
      (value) => !value || phonePattern.test(value),
    ),
  email: Yup.string()
    .trim()
    .email('Please enter a valid email address.')
    .max(254, 'Please use an email address under 254 characters.'),
  location: Yup.string()
    .trim()
    .max(120, 'Please keep the country / city under 120 characters.'),
  industry: Yup.string().oneOf(
    ['', ...industryOptions],
    'Please choose an industry from the list.',
  ),
  services: Yup.array()
    .of(Yup.string().oneOf(serviceInterests))
    .min(1, 'Please select at least one service.')
    .required('Please select at least one service.'),
  projectType: Yup.string().oneOf(
    ['', ...projectTypes],
    'Please choose a project type from the list.',
  ),
  existingWebsite: Yup.string()
    .trim()
    .max(300, 'Please keep the website address under 300 characters.')
    .test(
      'website-format',
      'Please enter a valid website address, for example https://example.com.',
      (value) => !value || urlPattern.test(value),
    ),
  budget: Yup.string().oneOf(
    ['', ...budgetOptions],
    'Please choose a budget from the list.',
  ),
  timeline: Yup.string().oneOf(
    ['', ...timelineOptions],
    'Please choose a timeline from the list.',
  ),
  contactMethod: Yup.string().oneOf(
    contactMethodOptions,
    'Please choose a contact method.',
  ),
  details: Yup.string()
    .trim()
    .required('Please describe what you need.')
    .min(10, 'Please share a little more detail — at least 10 characters.')
    .max(5000, 'Please keep the project details under 5,000 characters.'),
  preferredMeeting: Yup.string()
    .trim()
    .max(120, 'Please keep the preferred date / time under 120 characters.'),
  website: Yup.string().max(0),
});

export const initialContactValues = {
  fullName: '',
  company: '',
  mobile: '',
  whatsapp: '',
  email: '',
  location: '',
  industry: '',
  services: [],
  projectType: '',
  existingWebsite: '',
  budget: '',
  timeline: '',
  contactMethod: 'WhatsApp',
  details: '',
  preferredMeeting: '',
  website: '',
};
