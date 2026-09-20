import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ReceiptData, ReceiptItem } from '../models/types';

export class VisionService {
  private client: ImageAnnotatorClient;

  constructor() {
    this.client = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  async analyzeReceipt(imageBuffer: Buffer): Promise<ReceiptData> {
    const [result] = await this.client.textDetection({
      image: { content: imageBuffer }
    });

    const detections = result.textAnnotations || [];
    const fullText = detections[0]?.description || '';

    return this.parseReceiptText(fullText);
  }

  async analyzeReceiptFile(filePath: string): Promise<ReceiptData> {
    const [result] = await this.client.textDetection(filePath);
    const detections = result.textAnnotations || [];
    const fullText = detections[0]?.description || '';

    return this.parseReceiptText(fullText);
  }

  private parseReceiptText(text: string): ReceiptData {
    const lines = text.split('\n').filter(line => line.trim());

    const store = this.extractStore(lines);
    const total = this.extractTotal(text);
    const date = this.extractDate(text);
    const items = this.extractItems(lines);

    return {
      store,
      total,
      date,
      items
    };
  }

  private extractStore(lines: string[]): string {
    const storePatterns = [
      /^(?:supermercado|mercado|loja|farmácia|restaurante|padaria|bar)/i,
      /^[A-Z][A-Za-z\s]+(?:LTDA|ME|EPP|SA|EIRELI)/i
    ];

    for (const line of lines.slice(0, 5)) {
      for (const pattern of storePatterns) {
        if (pattern.test(line)) {
          return line.trim();
        }
      }
    }

    return lines[0]?.trim() || 'Estabelecimento não identificado';
  }

  private extractTotal(text: string): number {
    const totalPatterns = [
      /total\s*(?:geral)?\s*:?\s*R?\$?\s*(\d+[.,]\d{2})/i,
      /valor\s*(?:total)?\s*:?\s*R?\$?\s*(\d+[.,]\d{2})/i,
      /R?\$?\s*(\d+[.,]\d{2})\s*(?:total|à vista)/i
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    const amounts = text.match(/R?\$?\s*(\d+[.,]\d{2})/g);
    if (amounts && amounts.length > 0) {
      const values = amounts.map(a => {
        const num = a.replace(/R?\$?\s*/, '').replace(',', '.');
        return parseFloat(num);
      });
      return Math.max(...values);
    }

    return 0;
  }

  private extractDate(text: string): Date {
    const datePatterns = [
      /(\d{2})\/(\d{2})\/(\d{4})/,
      /(\d{2})-(\d{2})-(\d{4})/,
      /(\d{2})\.(\d{2})\.(\d{4})/
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const year = parseInt(match[3]);
        return new Date(year, month, day);
      }
    }

    return new Date();
  }

  private extractItems(lines: string[]): ReceiptItem[] {
    const items: ReceiptItem[] = [];
    const itemPattern = /(.+?)\s+(?:\d+\s+)?R?\$?\s*(\d+[.,]\d{2})/;

    for (const line of lines) {
      const match = line.match(itemPattern);
      if (match) {
        const name = match[1].trim();
        const price = parseFloat(match[2].replace(',', '.'));

        if (name.length > 2 && price > 0 && !this.isHeaderOrFooter(name)) {
          items.push({
            name,
            quantity: 1,
            price
          });
        }
      }
    }

    return items;
  }

  private isHeaderOrFooter(text: string): boolean {
    const ignoredPatterns = [
      /total/i,
      /subtotal/i,
      /desconto/i,
      /troco/i,
      /forma.*pagamento/i,
      /cartão/i,
      /dinheiro/i,
      /pix/i,
      /obrigad/i,
      /volte sempre/i,
      /cnpj/i,
      /ie:/i,
      /endereço/i,
      /telefone/i
    ];

    return ignoredPatterns.some(pattern => pattern.test(text));
  }

  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    const [result] = await this.client.textDetection({
      image: { content: imageBuffer }
    });

    return result.textAnnotations?.[0]?.description || '';
  }
}
