export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(amount);
}

export function parseCurrency(text: string): number | null {
  const patterns = [
    /R\$\s*(\d+[.,]\d{2})/,
    /R\$\s*(\d+)/,
    /(\d+[.,]\d{2})/,
    /(\d+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].replace(',', '.');
      return parseFloat(value);
    }
  }

  return null;
}

export function extractAmount(text: string): { amount: number; description: string } | null {
  const patterns = [
    /(?:gastei|gasto|paguei|pago|custou|valor)\s*(?:de\s*)?R?\$?\s*(\d+[.,]?\d*)\s*(?:em|no|na|com|para)?\s*(.+)/i,
    /R?\$?\s*(\d+[.,]?\d*)\s*(?:em|no|na|com|para)?\s*(.+)/i,
    /(.+?)\s*R?\$?\s*(\d+[.,]?\d*)/i,
    /(\d+[.,]?\d*)\s*(?:reais?|pila|conto)?\s*(?:em|no|na|com|para)?\s*(.+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let amount: number;
      let description: string;

      if (pattern === patterns[2]) {
        amount = parseFloat(match[2].replace(',', '.'));
        description = match[1].trim();
      } else {
        amount = parseFloat(match[1].replace(',', '.'));
        description = match[2]?.trim() || '';
      }

      if (!isNaN(amount) && amount > 0) {
        return { amount, description };
      }
    }
  }

  return null;
}
