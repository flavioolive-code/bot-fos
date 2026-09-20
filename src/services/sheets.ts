import { google, sheets_v4 } from 'googleapis';
import { Expense, Bill, ShoppingItem, UsageRecord, MonthlySummary, CategorySummary } from '../models/types';
import { formatDate, getCurrentMonth, getMonthRange } from '../utils/date';
import { v4 as uuidv4 } from 'uuid';

export class SheetsService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID || '';
  }

  async initialize(): Promise<void> {
    try {
      await this.ensureSheets();
      console.log('Google Sheets conectado com sucesso');
    } catch (error) {
      console.error('Erro ao conectar Google Sheets:', error);
      throw error;
    }
  }

  private async ensureSheets(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId
    });

    const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];
    const requiredSheets = ['Gastos', 'Contas', 'Compras', 'Uso'];

    for (const sheetName of requiredSheets) {
      if (!existingSheets.includes(sheetName)) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: { title: sheetName }
              }
            }]
          }
        });

        await this.addHeaders(sheetName);
      }
    }
  }

  private async addHeaders(sheetName: string): Promise<void> {
    const headers: Record<string, string[]> = {
      'Gastos': ['ID', 'Data', 'Descrição', 'Valor', 'Categoria', 'Origem'],
      'Contas': ['ID', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Data Pagamento'],
      'Compras': ['ID', 'Item', 'Quantidade', 'Status', 'Data Adição', 'Data Compra'],
      'Uso': ['Serviço', 'Mês', 'Usado', 'Limite']
    };

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers[sheetName] || []]
      }
    });
  }

  async addExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    const id = uuidv4();
    const newExpense: Expense = { ...expense, id };

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Gastos!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          id,
          formatDate(expense.date),
          expense.description,
          expense.amount,
          expense.category,
          expense.source
        ]]
      }
    });

    return newExpense;
  }

  async addBill(bill: Omit<Bill, 'id' | 'paid'>): Promise<Bill> {
    const id = uuidv4();
    const newBill: Bill = { ...bill, id, paid: false };

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Contas!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          id,
          bill.description,
          bill.amount,
          formatDate(bill.dueDate),
          'Pendente',
          ''
        ]]
      }
    });

    return newBill;
  }

  async addShoppingItem(item: string, quantity: number = 1): Promise<ShoppingItem> {
    const id = uuidv4();
    const newItem: ShoppingItem = {
      id,
      item,
      quantity,
      purchased: false,
      addedDate: new Date()
    };

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Compras!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          id,
          item,
          quantity,
          'Pendente',
          formatDate(new Date()),
          ''
        ]]
      }
    });

    return newItem;
  }

  async getMonthlySummary(month?: string): Promise<MonthlySummary> {
    const targetMonth = month || getCurrentMonth();
    const { start, end } = getMonthRange(new Date(targetMonth + '-01'));

    const expenses = await this.getExpenses(start, end);
    const pendingBills = await this.getPendingBills();

    const categories = this.groupByCategory(expenses);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      month: targetMonth,
      totalExpenses,
      categories,
      pendingBills,
      recentExpenses: expenses.slice(0, 10)
    };
  }

  private async getExpenses(start: Date, end: Date): Promise<Expense[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Gastos!A2:F'
    });

    const rows = response.data.values || [];
    return rows
      .map(row => ({
        id: row[0],
        date: new Date(row[1]),
        description: row[2],
        amount: parseFloat(row[3]) || 0,
        category: row[4],
        source: row[5] as 'text' | 'audio' | 'image'
      }))
      .filter(e => e.date >= start && e.date <= end);
  }

  private groupByCategory(expenses: Expense[]): CategorySummary[] {
    const groups: Record<string, { total: number; count: number }> = {};

    for (const expense of expenses) {
      if (!groups[expense.category]) {
        groups[expense.category] = { total: 0, count: 0 };
      }
      groups[expense.category].total += expense.amount;
      groups[expense.category].count++;
    }

    return Object.entries(groups).map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count
    }));
  }

  async getPendingBills(): Promise<Bill[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Contas!A2:F'
    });

    const rows = response.data.values || [];
    return rows
      .map(row => ({
        id: row[0],
        description: row[1],
        amount: parseFloat(row[2]) || 0,
        dueDate: new Date(row[3]),
        paid: row[4] === 'Pago',
        paidDate: row[5] ? new Date(row[5]) : undefined
      }))
      .filter(b => !b.paid);
  }

  async markBillAsPaid(billId: string): Promise<void> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Contas!A2:F'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === billId);

    if (rowIndex >= 0) {
      const rowNumber = rowIndex + 2;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Contas!E${rowNumber}:F${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Pago', formatDate(new Date())]]
        }
      });
    }
  }

  async getShoppingList(): Promise<ShoppingItem[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Compras!A2:F'
    });

    const rows = response.data.values || [];
    return rows
      .map(row => ({
        id: row[0],
        item: row[1],
        quantity: parseInt(row[2]) || 1,
        purchased: row[3] === 'Comprado',
        addedDate: new Date(row[4]),
        purchasedDate: row[5] ? new Date(row[5]) : undefined
      }))
      .filter(i => !i.purchased);
  }

  async markItemAsPurchased(itemId: string): Promise<void> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Compras!A2:F'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === itemId);

    if (rowIndex >= 0) {
      const rowNumber = rowIndex + 2;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Compras!D${rowNumber}:F${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Comprado', '', formatDate(new Date())]]
        }
      });
    }
  }

  async clearShoppingList(): Promise<void> {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: 'Compras!A2:F'
    });
  }

  async recordUsage(service: 'speech' | 'vision', used: number): Promise<void> {
    const month = getCurrentMonth();
    const limits: Record<string, number> = {
      speech: 60,
      vision: 1000
    };

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Uso!A2:D'
    });

    const rows = response.data.values || [];
    const existingIndex = rows.findIndex(row => row[0] === service && row[1] === month);

    if (existingIndex >= 0) {
      const rowNumber = existingIndex + 2;
      const currentUsed = parseFloat(rows[existingIndex][2]) || 0;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Uso!C${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[currentUsed + used]]
        }
      });
    } else {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Uso!A:D',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[service, month, used, limits[service]]]
        }
      });
    }
  }

  async getUsage(service: 'speech' | 'vision'): Promise<UsageRecord> {
    const month = getCurrentMonth();
    const limits: Record<string, number> = {
      speech: 60,
      vision: 1000
    };

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Uso!A2:D'
    });

    const rows = response.data.values || [];
    const row = rows.find(r => r[0] === service && r[1] === month);

    return {
      service,
      month,
      used: row ? parseFloat(row[2]) || 0 : 0,
      limit: limits[service]
    };
  }
}
