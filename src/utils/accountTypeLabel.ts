/** Label shown for the account type selected at sign-up or login. */
export const accountTypeLabel = (role: string): string => {
  if (role === 'EMPLOYEE') return 'Employee';
  return 'Manager';
};
