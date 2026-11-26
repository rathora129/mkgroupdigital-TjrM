// Shared between the server-side importer and the browser preview so both use
// exactly the same column order and labels. No database imports here.
export const IMPORT_FIELDS = [
  'companyName',
  'phone',
  'contactName',
  'requirementsInitial',
  'website',
  'callDate',
  'callStatus',
  'requirementsDetailed',
  'nextMeetingDate',
  'nextMeetingTime',
  'dateAdded',
  'amountReceived',
  'outstanding',
  'projectCost',
  'followUp',
];

export const IMPORT_FIELD_LABELS = {
  companyName: 'Company Name',
  phone: 'Contact Number',
  contactName: 'Owner / Contact Person',
  requirementsInitial: 'Initial Requirement',
  website: 'Website',
  callDate: 'Call Date',
  callStatus: 'Call Status',
  requirementsDetailed: 'Detailed Client Requirement',
  nextMeetingDate: 'Next Meeting Date',
  nextMeetingTime: 'Next Meeting Time',
  dateAdded: 'Date Added',
  amountReceived: 'Amount Received',
  outstanding: 'Outstanding',
  projectCost: 'Project Cost',
  followUp: 'Follow up',
};
