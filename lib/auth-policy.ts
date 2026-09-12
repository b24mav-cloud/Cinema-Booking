export type PasswordRule = { key: string; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", label: "At least 8 characters", test: password => password.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: password => /[A-Z]/.test(password) },
  { key: "lower", label: "One lowercase letter", test: password => /[a-z]/.test(password) },
  { key: "number", label: "One number", test: password => /[0-9]/.test(password) }
];

export const passwordErrors = (password: string): string[] =>
  PASSWORD_RULES.filter(rule => !rule.test(password)).map(rule => rule.label);

export const passwordIsValid = (password: string): boolean => passwordErrors(password).length === 0;

export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());