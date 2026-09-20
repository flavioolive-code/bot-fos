import { proto } from '@whiskeysockets/baileys';
import { WhatsAppConnection } from './connection';
import { SheetsService } from '../services/sheets';
import { SpeechService } from '../services/speech';
import { VisionService } from '../services/vision';
import { MonitorService } from '../services/monitor';
import { extractAmount, formatCurrency } from '../utils/currency';
import { formatDate, extractDueDate, isDueSoon, isOverdue } from '../utils/date';

export class MessageHandler {
  private connection: WhatsAppConnection;
  private sheetsService: SheetsService;
  private speechService: SpeechService;
  private visionService: VisionService;
  private monitorService: MonitorService;

  constructor(
    connection: WhatsAppConnection,
    sheetsService: SheetsService,
    speechService: SpeechService,
    visionService: VisionService,
    monitorService: MonitorService
  ) {
    this.connection = connection;
    this.sheetsService = sheetsService;
    this.speechService = speechService;
    this.visionService = visionService;
    this.monitorService = monitorService;
  }

  async handleMessage(message: proto.IWebMessageInfo): Promise<void> {
    const jid = this.connection.getSenderJid(message);
    const messageType = this.connection.getMessageType(message);

    try {
      switch (messageType) {
        case 'text':
          await this.handleTextMessage(jid, message);
          break;
        case 'audio':
          await this.handleAudioMessage(jid, message);
          break;
        case 'image':
          await this.handleImageMessage(jid, message);
          break;
        default:
          await this.connection.sendReply(
            jid,
            '❓ Tipo de mensagem não suportado. Envie texto, áudio ou imagem.',
            message
          );
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      await this.connection.sendReply(
        jid,
        '❌ Erro ao processar mensagem. Tente novamente.',
        message
      );
    }
  }

  private async handleTextMessage(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const text = this.connection.getMessageText(message).trim().toLowerCase();

    if (this.isCommand(text, ['ajuda', 'help', 'comandos'])) {
      await this.sendHelp(jid, message);
      return;
    }

    if (this.isCommand(text, ['resumo', 'total', 'gastos'])) {
      await this.sendMonthlySummary(jid, message);
      return;
    }

    if (this.isCommand(text, ['contas', 'pendentes', 'pagar'])) {
      await this.sendPendingBills(jid, message);
      return;
    }

    if (this.isCommand(text, ['lista', 'compras', 'comprar'])) {
      await this.handleShoppingCommand(jid, message, text);
      return;
    }

    if (this.isCommand(text, ['paguei', 'pago'])) {
      await this.handleBillPayment(jid, message, text);
      return;
    }

    if (this.isCommand(text, ['comprou', 'comprado'])) {
      await this.handleItemPurchased(jid, message, text);
      return;
    }

    if (this.isCommand(text, ['limpar lista', 'limpar compras'])) {
      await this.clearShoppingList(jid, message);
      return;
    }

    await this.handleExpenseInput(jid, message, text);
  }

  private async handleAudioMessage(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const canUse = await this.monitorService.canUseService('speech');
    
    if (!canUse.allowed) {
      await this.connection.sendReply(jid, canUse.alert!, message);
      return;
    }

    await this.connection.sendReply(jid, '🎙️ Processando áudio...', message);

    const audioBuffer = await this.connection.downloadMedia(message);
    if (!audioBuffer) {
      await this.connection.sendReply(jid, '❌ Não foi possível baixar o áudio.', message);
      return;
    }

    const duration = this.speechService.getAudioDuration(audioBuffer);
    
    try {
      const transcription = await this.speechService.transcribeAudio(audioBuffer);
      
      if (!transcription) {
        await this.connection.sendReply(jid, '❌ Não consegui entender o áudio. Tente novamente.', message);
        return;
      }

      await this.monitorService.recordUsage('speech', duration);

      const alertInfo = await this.monitorService.checkUsage('speech');
      const alertMessage = this.monitorService.formatAlert(alertInfo);

      await this.connection.sendReply(
        jid,
        `🎙️ *Transcrição:*\n"${transcription}"\n\nProcessando...`,
        message
      );

      await this.processTranscription(jid, message, transcription);

      if (alertMessage) {
        await this.connection.sendReply(jid, alertMessage, message);
      }
    } catch (error) {
      console.error('Erro na transcrição:', error);
      await this.connection.sendReply(jid, '❌ Erro ao transcrever áudio. Tente novamente.', message);
    }
  }

  private async handleImageMessage(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const canUse = await this.monitorService.canUseService('vision');
    
    if (!canUse.allowed) {
      await this.connection.sendReply(jid, canUse.alert!, message);
      return;
    }

    await this.connection.sendReply(jid, '📸 Analisando imagem...', message);

    const imageBuffer = await this.connection.downloadMedia(message);
    if (!imageBuffer) {
      await this.connection.sendReply(jid, '❌ Não foi possível baixar a imagem.', message);
      return;
    }

    try {
      const receipt = await this.visionService.analyzeReceipt(imageBuffer);
      
      await this.monitorService.recordUsage('vision', 1);

      const alertInfo = await this.monitorService.checkUsage('vision');
      const alertMessage = this.monitorService.formatAlert(alertInfo);

      if (receipt.total > 0) {
        await this.sheetsService.addExpense({
          amount: receipt.total,
          category: 'Compras',
          description: receipt.store,
          date: receipt.date,
          source: 'image'
        });

        let response = `✅ *Gasto registrado!*\n\n` +
          `🏪 ${receipt.store}\n` +
          `💰 ${formatCurrency(receipt.total)}\n` +
          `📅 ${formatDate(receipt.date)}`;

        if (receipt.items.length > 0) {
          response += `\n\n📋 *Itens:*\n`;
          receipt.items.slice(0, 5).forEach(item => {
            response += `• ${item.name}: ${formatCurrency(item.price)}\n`;
          });
          if (receipt.items.length > 5) {
            response += `... e mais ${receipt.items.length - 5} itens`;
          }
        }

        await this.connection.sendReply(jid, response, message);
      } else {
        const text = await this.visionService.extractTextFromImage(imageBuffer);
        await this.connection.sendReply(
          jid,
          `📸 *Texto extraído:*\n\n${text.substring(0, 500)}\n\n` +
          `💡 Envie o valor manualmente se não foi识别ado.`,
          message
        );
      }

      if (alertMessage) {
        await this.connection.sendReply(jid, alertMessage, message);
      }
    } catch (error) {
      console.error('Erro na análise de imagem:', error);
      await this.connection.sendReply(jid, '❌ Erro ao analisar imagem. Tente novamente.', message);
    }
  }

  private async handleExpenseInput(jid: string, message: proto.IWebMessageInfo, text: string): Promise<void> {
    const parsed = extractAmount(text);

    if (parsed && parsed.amount > 0) {
      const category = this.categorizeExpense(parsed.description);
      
      await this.sheetsService.addExpense({
        amount: parsed.amount,
        category,
        description: parsed.description,
        date: new Date(),
        source: 'text'
      });

      const summary = await this.sheetsService.getMonthlySummary();

      await this.connection.sendReply(
        jid,
        `✅ *Gasto registrado!*\n\n` +
        `📝 ${parsed.description}\n` +
        `💰 ${formatCurrency(parsed.amount)}\n` +
        `📅 ${formatDate(new Date())}\n` +
        `📊 Total do mês: ${formatCurrency(summary.totalExpenses)}`,
        message
      );
      return;
    }

    if (text.includes('vence') || text.includes('dia')) {
      await this.handleBillInput(jid, message, text);
      return;
    }

    await this.connection.sendReply(
      jid,
      '❓ Não entendi. Envie:\n\n' +
      '• "Almoço R$50" para registrar gasto\n' +
      '• "Conta de luz R$150 vence dia 15" para registrar conta\n' +
      '• "Ajuda" para ver todos os comandos',
      message
    );
  }

  private async handleBillInput(jid: string, message: proto.IWebMessageInfo, text: string): Promise<void> {
    const parsed = extractAmount(text);
    const dueDate = extractDueDate(text);

    if (parsed && parsed.amount > 0 && dueDate) {
      await this.sheetsService.addBill({
        amount: parsed.amount,
        description: parsed.description,
        dueDate
      });

      await this.connection.sendReply(
        jid,
        `✅ *Conta registrada!*\n\n` +
        `📝 ${parsed.description}\n` +
        `💰 ${formatCurrency(parsed.amount)}\n` +
        `📅 Vencimento: ${formatDate(dueDate)}`,
        message
      );
      return;
    }

    await this.connection.sendReply(
      jid,
      '❓ Formato de conta inválido. Envie:\n' +
      '"Conta de luz R$150 vence dia 15"',
      message
    );
  }

  private async handleShoppingCommand(jid: string, message: proto.IWebMessageInfo, text: string): Promise<void> {
    const listMatch = text.match(/(?:lista|compras|comprar)\s+(.*)/i);
    
    if (listMatch && listMatch[1]) {
      const items = listMatch[1].split(/[,;e]+/).map(i => i.trim()).filter(i => i.length > 0);
      
      for (const item of items) {
        await this.sheetsService.addShoppingItem(item);
      }

      await this.connection.sendReply(
        jid,
        `✅ *Itens adicionados!*\n\n` +
        `🛒 ${items.join('\n• ')}`,
        message
      );
      return;
    }

    const shoppingList = await this.sheetsService.getShoppingList();
    
    if (shoppingList.length === 0) {
      await this.connection.sendReply(jid, '🛒 Lista de compras vazia!', message);
      return;
    }

    let response = `🛒 *Lista de Compras:*\n\n`;
    shoppingList.forEach(item => {
      response += `• ${item.item}${item.quantity > 1 ? ` (x${item.quantity})` : ''}\n`;
    });

    await this.connection.sendReply(jid, response, message);
  }

  private async handleBillPayment(jid: string, message: proto.IWebMessageInfo, text: string): Promise<void> {
    const pendingBills = await this.sheetsService.getPendingBills();
    
    if (pendingBills.length === 0) {
      await this.connection.sendReply(jid, '✅ Nenhuma conta pendente!', message);
      return;
    }

    const billMatch = text.match(/(?:paguei|pago)\s+(.*)/i);
    
    if (billMatch && billMatch[1]) {
      const billName = billMatch[1].trim().toLowerCase();
      const bill = pendingBills.find(b => 
        b.description.toLowerCase().includes(billName)
      );

      if (bill) {
        await this.sheetsService.markBillAsPaid(bill.id);
        await this.connection.sendReply(
          jid,
          `✅ *Conta marcada como paga!*\n\n` +
          `📝 ${bill.description}\n` +
          `💰 ${formatCurrency(bill.amount)}`,
          message
        );
        return;
      }
    }

    let response = `📋 *Contas pendentes:*\n\n`;
    pendingBills.forEach((bill, index) => {
      const status = isOverdue(bill.dueDate) ? '🔴' : isDueSoon(bill.dueDate) ? '🟡' : '🟢';
      response += `${status} ${index + 1}. ${bill.description}: ${formatCurrency(bill.amount)} (vence ${formatDate(bill.dueDate)})\n`;
    });
    response += `\n💡 Envie "paguei [nome da conta]" para marcar como paga`;

    await this.connection.sendReply(jid, response, message);
  }

  private async handleItemPurchased(jid: string, message: proto.IWebMessageInfo, text: string): Promise<void> {
    const shoppingList = await this.sheetsService.getShoppingList();
    
    if (shoppingList.length === 0) {
      await this.connection.sendReply(jid, '🛒 Lista de compras vazia!', message);
      return;
    }

    const itemMatch = text.match(/(?:comprou|comprado)\s+(.*)/i);
    
    if (itemMatch && itemMatch[1]) {
      const itemName = itemMatch[1].trim().toLowerCase();
      const item = shoppingList.find(i => 
        i.item.toLowerCase().includes(itemName)
      );

      if (item) {
        await this.sheetsService.markItemAsPurchased(item.id);
        await this.connection.sendReply(
          jid,
          `✅ *Item marcado como comprado!*\n\n` +
          `🛒 ${item.item}`,
          message
        );
        return;
      }
    }

    let response = `🛒 *Itens pendentes:*\n\n`;
    shoppingList.forEach((item, index) => {
      response += `${index + 1}. ${item.item}${item.quantity > 1 ? ` (x${item.quantity})` : ''}\n`;
    });
    response += `\n💡 Envie "comprou [item]" para marcar como comprado`;

    await this.connection.sendReply(jid, response, message);
  }

  private async clearShoppingList(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    await this.sheetsService.clearShoppingList();
    await this.connection.sendReply(jid, '✅ Lista de compras limpa!', message);
  }

  private async sendHelp(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const helpText = `🤖 *Bot FOS - Comandos Disponíveis*\n\n` +
      `💰 *Gastos:*\n` +
      `• "Almoço R$50" - Registrar gasto\n` +
      `• "Gastei 30 no uber" - Registrar gasto\n\n` +
      `📋 *Contas:*\n` +
      `• "Conta de luz R$150 vence dia 15" - Registrar conta\n` +
      `• "Contas" - Ver contas pendentes\n` +
      `• "paguei [conta]" - Marcar como paga\n\n` +
      `🛒 *Compras:*\n` +
      `• "Comprar leite, pão" - Adicionar à lista\n` +
      `• "Lista" - Ver lista de compras\n` +
      `• "comprou [item]" - Marcar como comprado\n` +
      `• "Limpar lista" - Limpar lista\n\n` +
      `📊 *Consultas:*\n` +
      `• "Resumo" - Resumo do mês\n` +
      `• "Total" - Total gasto\n\n` +
      `🎙️ *Áudio:*\n` +
      `• Envie áudio falando o gasto\n\n` +
      `📸 *Imagem:*\n` +
      `• Envie foto de recibo\n\n` +
      `💡 *Dica:* Use texto para economizar minutos de áudio!`;

    await this.connection.sendReply(jid, helpText, message);
  }

  private async sendMonthlySummary(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const summary = await this.sheetsService.getMonthlySummary();

    let response = `📊 *RESUMO - ${summary.month}*\n\n`;
    response += `💰 *Total gasto:* ${formatCurrency(summary.totalExpenses)}\n\n`;

    if (summary.categories.length > 0) {
      response += `📋 *Por categoria:*\n`;
      summary.categories
        .sort((a, b) => b.total - a.total)
        .forEach(cat => {
          response += `• ${cat.category}: ${formatCurrency(cat.total)}\n`;
        });
    }

    if (summary.pendingBills.length > 0) {
      response += `\n📅 *Contas pendentes:* ${summary.pendingBills.length}\n`;
      const totalPending = summary.pendingBills.reduce((sum, b) => sum + b.amount, 0);
      response += `💸 Total: ${formatCurrency(totalPending)}`;
    }

    await this.connection.sendReply(jid, response, message);
  }

  private async sendPendingBills(jid: string, message: proto.IWebMessageInfo): Promise<void> {
    const pendingBills = await this.sheetsService.getPendingBills();

    if (pendingBills.length === 0) {
      await this.connection.sendReply(jid, '✅ Nenhuma conta pendente!', message);
      return;
    }

    let response = `📋 *Contas Pendentes:*\n\n`;
    pendingBills.forEach((bill, index) => {
      const status = isOverdue(bill.dueDate) ? '🔴 Atrasada' : 
                     isDueSoon(bill.dueDate) ? '🟡 Vence logo' : '🟢 OK';
      response += `${index + 1}. ${bill.description}\n`;
      response += `   💰 ${formatCurrency(bill.amount)}\n`;
      response += `   📅 ${formatDate(bill.dueDate)} - ${status}\n\n`;
    });

    const total = pendingBills.reduce((sum, b) => sum + b.amount, 0);
    response += `💸 *Total:* ${formatCurrency(total)}`;
    response += `\n\n💡 Envie "paguei [conta]" para marcar como paga`;

    await this.connection.sendReply(jid, response, message);
  }

  private async processTranscription(jid: string, message: proto.IWebMessageInfo, transcription: string): Promise<void> {
    const text = transcription.toLowerCase();
    
    if (text.includes('vence') || text.includes('dia')) {
      await this.handleBillInput(jid, message, transcription);
      return;
    }

    await this.handleExpenseInput(jid, message, transcription);
  }

  private isCommand(text: string, commands: string[]): boolean {
    return commands.some(cmd => text.startsWith(cmd));
  }

  private categorizeExpense(description: string): string {
    const categories: Record<string, string[]> = {
      'Alimentação': ['almoço', 'jantar', 'café', 'lanche', 'pizza', 'hambúrguer', 'sushi', 'restaurante', 'delivery', 'ifood', 'rappi'],
      'Transporte': ['uber', '99', 'táxi', 'gasolina', 'combustível', 'ônibus', 'metrô', 'estacionamento', 'pedágio'],
      'Moradia': ['aluguel', 'condomínio', 'luz', 'água', 'gás', 'internet', 'telefone', 'iptu'],
      'Saúde': ['farmácia', 'remédio', 'médico', 'dentista', 'hospital', 'plano', 'academia'],
      'Educação': ['curso', 'livro', 'faculdade', 'escola', 'material'],
      'Lazer': ['cinema', 'teatro', 'show', 'viagem', 'hotel', 'passeio'],
      'Compras': ['supermercado', 'mercado', 'roupa', 'sapato', 'eletrônico', 'celular', 'computador'],
      'Serviços': ['cabelo', 'barba', 'manicure', 'lavanderia', 'mecânico']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => description.toLowerCase().includes(keyword))) {
        return category;
      }
    }

    return 'Outros';
  }
}
