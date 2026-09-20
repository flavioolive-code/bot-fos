import { SheetsService } from './sheets';
import { AlertInfo, UsageRecord } from '../models/types';

export class MonitorService {
  private sheetsService: SheetsService;

  constructor(sheetsService: SheetsService) {
    this.sheetsService = sheetsService;
  }

  async checkUsage(service: 'speech' | 'vision'): Promise<AlertInfo> {
    const usage = await this.sheetsService.getUsage(service);
    const percentage = (usage.used / usage.limit) * 100;

    let level: AlertInfo['level'];
    if (percentage >= 100) {
      level = 'exceeded';
    } else if (percentage >= 90) {
      level = 'critical';
    } else if (percentage >= 75) {
      level = 'warning';
    } else if (percentage >= 50) {
      level = 'attention';
    } else {
      level = 'ok';
    }

    return {
      service,
      used: usage.used,
      limit: usage.limit,
      percentage,
      level
    };
  }

  async recordUsage(service: 'speech' | 'vision', amount: number): Promise<AlertInfo> {
    await this.sheetsService.recordUsage(service, amount);
    return this.checkUsage(service);
  }

  async canUseService(service: 'speech' | 'vision'): Promise<{ allowed: boolean; alert?: string }> {
    const alertInfo = await this.checkUsage(service);

    if (alertInfo.level === 'exceeded') {
      return {
        allowed: false,
        alert: this.formatExceededAlert(alertInfo)
      };
    }

    if (alertInfo.level === 'critical') {
      return {
        allowed: true,
        alert: this.formatCriticalAlert(alertInfo)
      };
    }

    if (alertInfo.level === 'warning') {
      return {
        allowed: true,
        alert: this.formatWarningAlert(alertInfo)
      };
    }

    return { allowed: true };
  }

  formatAlert(alertInfo: AlertInfo): string {
    switch (alertInfo.level) {
      case 'exceeded':
        return this.formatExceededAlert(alertInfo);
      case 'critical':
        return this.formatCriticalAlert(alertInfo);
      case 'warning':
        return this.formatWarningAlert(alertInfo);
      case 'attention':
        return this.formatAttentionAlert(alertInfo);
      default:
        return '';
    }
  }

  private formatExceededAlert(alertInfo: AlertInfo): string {
    const serviceName = this.getServiceName(alertInfo.service);
    return `❌ *LIMITE ATINGIDO: ${serviceName}*\n\n` +
      `📊 Usado: ${alertInfo.used}/${alertInfo.limit}\n` +
      `🔄 Recurso temporariamente desativado\n` +
      `💡 Alternativa: Envie mensagens de texto\n` +
      `📅 Renovação: 01/${this.getNextMonth()}`;
  }

  private formatCriticalAlert(alertInfo: AlertInfo): string {
    const serviceName = this.getServiceName(alertInfo.service);
    return `🛑 *ALERTA CRÍTICO: ${serviceName}*\n\n` +
      `📊 Usado: ${alertInfo.used}/${alertInfo.limit} (${alertInfo.percentage.toFixed(0)}%)\n` +
      `⏰ Restante: ${alertInfo.limit - alertInfo.used}\n` +
      `💡 Sugestão: Use texto ou espere o mês que vem renovar`;
  }

  private formatWarningAlert(alertInfo: AlertInfo): string {
    const serviceName = this.getServiceName(alertInfo.service);
    return `⚠️ *ALERTA: ${serviceName}*\n\n` +
      `📊 Usado: ${alertInfo.used}/${alertInfo.limit} (${alertInfo.percentage.toFixed(0)}%)\n` +
      `💡 Dica: Use mais texto para economizar`;
  }

  private formatAttentionAlert(alertInfo: AlertInfo): string {
    const serviceName = this.getServiceName(alertInfo.service);
    return `⚠️ *Atenção: ${serviceName}*\n\n` +
      `📊 Usado: ${alertInfo.used}/${alertInfo.limit} (${alertInfo.percentage.toFixed(0)}%)`;
  }

  private getServiceName(service: 'speech' | 'vision'): string {
    const names: Record<string, string> = {
      speech: 'Áudio',
      vision: 'Imagens'
    };
    return names[service] || service;
  }

  private getNextMonth(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month = (nextMonth.getMonth() + 1).toString().padStart(2, '0');
    const year = nextMonth.getFullYear();
    return `${month}/${year}`;
  }
}
