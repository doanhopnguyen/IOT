import { parseProductQr } from './productQr';
export function parseActivationCode(input: string): string { return parseProductQr(input).activationCode; }

export function activationClaimInput(code: string, name: string) {
  const doorName = name.trim();
  if (!doorName || doorName.length > 100) throw new Error('Tên cửa cần từ 1 đến 100 ký tự.');
  return { activationCode: parseActivationCode(code), name: doorName };
}

export const productSetup = parseProductQr;
