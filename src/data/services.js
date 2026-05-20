export const GROOMING_SERVICE_GROUPS = [
  { id: 'packages', label: 'Grooming packages' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'special-care', label: 'Special care' },
];

export const GROOMING_SERVICES = [
  {
    id: 'full-groom',
    group: 'packages',
    name: 'Full groom',
    description: 'Bath, haircut, nails, ears, and finishing brush.',
    basePrice: 85,
  },
  {
    id: 'bath-brush',
    group: 'packages',
    name: 'Bath and brush',
    description: 'Cleaning, blow dry, brush-out, and light trim.',
    basePrice: 55,
  },
  {
    id: 'haircut',
    group: 'packages',
    name: 'Haircut',
    description: 'Breed-aware haircut or tidy trim after bath and dry.',
    basePrice: 70,
  },
  {
    id: 'mobile-grooming',
    group: 'packages',
    name: 'Mobile grooming',
    description: 'At-home or van-based grooming where available.',
    basePrice: 110,
  },
  {
    id: 'nail-trim',
    group: 'maintenance',
    name: 'Nail trim',
    description: 'Clip or grind nails with paw check.',
    basePrice: 22,
  },
  {
    id: 'de-shed',
    group: 'maintenance',
    name: 'De-shedding',
    description: 'Undercoat removal, bath, blowout, and brush finish.',
    basePrice: 75,
  },
  {
    id: 'teeth-cleaning',
    group: 'maintenance',
    name: 'Teeth cleaning',
    description: 'Non-anesthetic tooth brushing and breath refresh.',
    basePrice: 30,
  },
  {
    id: 'ear-cleaning',
    group: 'maintenance',
    name: 'Ear cleaning',
    description: 'Gentle ear cleaning and inspection.',
    basePrice: 18,
  },
  {
    id: 'flea-tick-bath',
    group: 'special-care',
    name: 'Flea and tick bath',
    description: 'Targeted bath for flea or tick treatment plans.',
    basePrice: 65,
  },
  {
    id: 'senior-care',
    group: 'special-care',
    name: 'Senior dog care',
    description: 'Lower-stress grooming for older dogs.',
    basePrice: 80,
  },
  {
    id: 'puppy-intro',
    group: 'special-care',
    name: 'Puppy intro',
    description: 'Short first visit for dogs learning the routine.',
    basePrice: 45,
  },
];

export function groupGroomingServices(services = GROOMING_SERVICES) {
  return GROOMING_SERVICE_GROUPS.map((group) => ({
    ...group,
    services: services.filter((service) => service.group === group.id),
  })).filter((group) => group.services.length);
}
