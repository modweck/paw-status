import { appConfig } from './appConfig.js';

export function isStaffDashboardEnabled() {
  return appConfig.enableGroomerDashboard;
}
