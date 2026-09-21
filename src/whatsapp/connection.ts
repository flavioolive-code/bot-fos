import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  WASocket,
  proto,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

export class WhatsAppConnection {
  private sock: WASocket | null = null;
  private authDir: string;
  private messageHandler: ((message: proto.IWebMessageInfo) => void) | null = null;
  private qrCount: number = 0;

  constructor() {
    this.authDir = path.join(process.cwd(), 'credentials', 'baileys-auth');
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  setMessageHandler(handler: (message: proto.IWebMessageInfo) => void): void {
    this.messageHandler = handler;
  }

  async connect(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Bot FOS', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await this.generateQRCode(qr);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`Conexão fechada. Status: ${statusCode}. Reconectando: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          this.connect();
        } else {
          console.log('❌ Desconectado do WhatsApp. Faça login novamente.');
          process.exit(1);
        }
      }

      if (connection === 'open') {
        console.log('✅ Bot FOS conectado ao WhatsApp!');
        this.cleanupQRFiles();
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        if (!message.message) continue;
        if (!message.key.fromMe) continue;

        const jid = message.key.remoteJid || '';
        if (jid.endsWith('@g.us')) continue;
        if (jid.includes('@lid')) continue;

        if (this.messageHandler) {
          this.messageHandler(message);
        }
      }
    });

    return this.sock;
  }

  private async generateQRCode(qr: string): Promise<void> {
    this.qrCount++;
    const qrPath = path.join(process.cwd(), `qrcode-${this.qrCount}.html`);
    
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot FOS - QR Code WhatsApp</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
        }
        .qr-container {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            display: inline-block;
        }
        .qr-container img {
            max-width: 100%;
            height: auto;
        }
        .steps {
            text-align: left;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        .steps h3 {
            color: #333;
            margin-bottom: 15px;
        }
        .steps ol {
            padding-left: 20px;
        }
        .steps li {
            margin: 10px 0;
            color: #555;
            line-height: 1.5;
        }
        .steps li strong {
            color: #333;
        }
        .timer {
            color: #e74c3c;
            font-weight: bold;
            margin-top: 20px;
            font-size: 14px;
        }
        .footer {
            margin-top: 30px;
            color: #999;
            font-size: 12px;
        }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
        }
        .refresh-btn:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Bot FOS</h1>
        <p class="subtitle">Conecte seu WhatsApp para começar</p>
        
        <div class="qr-container">
            <img src="${qrDataUrl}" alt="QR Code WhatsApp">
        </div>
        
        <div class="steps">
            <h3>📱 Como conectar:</h3>
            <ol>
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Toque nos <strong>3 pontos</strong> (⋮) no canto superior direito</li>
                <li>Toque em <strong>"Dispositivos conectados"</strong></li>
                <li>Toque em <strong>"Conectar dispositivo"</strong></li>
                <li><strong>Aponte a câmera para o QR Code</strong> acima</li>
            </ol>
        </div>
        
        <p class="timer">⏰ O QR Code expira em aproximadamente 20 segundos</p>
        
        <p class="footer">
            Bot FOS - Financeiro WhatsApp<br>
            Feito com ❤️ por Flavio Oliveira
        </p>
    </div>
</body>
</html>`;

      fs.writeFileSync(qrPath, html);
      
      console.log(`\n📱 QR Code gerado! Abrindo no navegador...`);
      console.log(`📄 Arquivo: ${qrPath}\n`);
      
      exec(`start "" "${qrPath}"`, (error) => {
        if (error) {
          console.log(`💡 Abra manualmente no navegador: ${qrPath}`);
        }
      });

    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
    }
  }

  private cleanupQRFiles(): void {
    try {
      const files = fs.readdirSync(process.cwd());
      for (const file of files) {
        if (file.startsWith('qrcode-') && file.endsWith('.html')) {
          fs.unlinkSync(path.join(process.cwd(), file));
        }
      }
    } catch (error) {
      // Ignorar erros na limpeza
    }
  }

  getSocket(): WASocket | null {
    return this.sock;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp não conectado');
    }

    await this.sock.sendMessage(jid, { text });
  }

  async sendReply(jid: string, text: string, quotedMessage: proto.IWebMessageInfo): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp não conectado');
    }

    await this.sock.sendMessage(jid, { text }, { quoted: quotedMessage });
  }

  async downloadMedia(message: proto.IWebMessageInfo): Promise<Buffer | null> {
    if (!this.sock) {
      throw new Error('WhatsApp não conectado');
    }

    try {
      const msg = message.message;
      if (!msg) return null;

      let mediaMessage: any = null;
      let mediaType: 'image' | 'audio' | 'video' | 'document' = 'image';

      if (msg.audioMessage) {
        mediaMessage = msg.audioMessage;
        mediaType = 'audio';
      } else if (msg.imageMessage) {
        mediaMessage = msg.imageMessage;
        mediaType = 'image';
      } else if (msg.videoMessage) {
        mediaMessage = msg.videoMessage;
        mediaType = 'video';
      } else if (msg.documentMessage) {
        mediaMessage = msg.documentMessage;
        mediaType = 'document';
      }

      if (!mediaMessage) return null;

      const stream = await downloadContentFromMessage(mediaMessage, mediaType);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Erro ao baixar mídia:', error);
      return null;
    }
  }

  getMessageType(message: proto.IWebMessageInfo): string {
    const msg = message.message;
    if (!msg) return 'unknown';

    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.audioMessage) return 'audio';
    if (msg.imageMessage) return 'image';
    if (msg.documentMessage) return 'document';
    if (msg.videoMessage) return 'video';
    if (msg.stickerMessage) return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage) return 'contact';

    return 'unknown';
  }

  getMessageText(message: proto.IWebMessageInfo): string {
    const msg = message.message;
    if (!msg) return '';

    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

    return '';
  }

  getSenderJid(message: proto.IWebMessageInfo): string {
    return message.key.remoteJid || '';
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }
}
