export const SERVICE_TYPES = [
  'AC Service',
  'Refrigeration',
  'HVAC',
  'Elevator',
  'Generator',
  'Water Purification',
] as const

export const COMPLAINT_CATEGORIES = [
  'Service Quality',
  'Billing',
  'Technician',
  'Product',
  'Other',
] as const

// Machines a service contract can be written against. The first few are what
// an AMC is actually sold on; 'Other' keeps the door open for a site with
// something unusual on it.
export const ASSET_CATEGORIES = [
  'AC',
  'Chiller',
  'DG Set',
  'Electrical Panel',
  'Water Cooler',
  'UPS',
  'Other',
] as const

export const CITIES = [
  'Mumbai',
  'Pune',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Ahmedabad',
  'Kolkata',
] as const

export const TECHNICIANS = [
] as const

export const PAYMENT_METHODS = ['UPI', 'Net Banking', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Cash', 'Card', 'Cheque'] as const

export const CURRENT_USER = {
  name: 'Darshan Patgar',
  role: 'Service Operations',
  email: 'darshan.sirpi@gmail.com',
  phone: '+91 98765 43210',
}

export const APP = {
  name: 'ServicePulse',
  tagline: 'Track. Analyze. Retain.',
  version: '1.0.0',
  environment: 'Frontend Demo',
}