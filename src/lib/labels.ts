export function paymentMethodLabel(method: { nickname: string; last4: string | null }): string {
  return method.last4 ? `${method.nickname} ••${method.last4}` : method.nickname;
}

export function archivedChoiceLabel(name: string, archived: boolean): string {
  return archived ? `${name} (archived)` : name;
}
