import { GROOMING_SERVICES } from '../data/services.js';

// Services a groomer can perform. When a groomer has no explicit offering list
// we fall back to the full catalog so booking is never blocked.
export function serviceOptionsForGroomer(groomer) {
  const offeredServices = Array.isArray(groomer?.services) ? groomer.services : [];
  if (!offeredServices.length) return GROOMING_SERVICES;

  const matchedServices = GROOMING_SERVICES.filter((serviceOption) =>
    offeredServices.includes(serviceOption.id),
  );
  return matchedServices.length ? matchedServices : GROOMING_SERVICES;
}

// Pick a sensible default service: the dog's saved preference first, then the
// service the customer searched with, then the groomer's first offering.
export function chooseServiceForGroomer(groomer, { dog = null, selectedService = null } = {}) {
  const serviceOptions = serviceOptionsForGroomer(groomer);

  if (
    dog?.preferredServiceId &&
    serviceOptions.some((serviceOption) => serviceOption.id === dog.preferredServiceId)
  ) {
    return dog.preferredServiceId;
  }

  if (
    selectedService?.id &&
    serviceOptions.some((serviceOption) => serviceOption.id === selectedService.id)
  ) {
    return selectedService.id;
  }

  return serviceOptions[0]?.id || GROOMING_SERVICES[0].id;
}
