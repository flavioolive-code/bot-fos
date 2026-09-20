import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  WASocket,
  proto,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import * as path from 'path';
import * as fs from 'fs';

export class WhatsAppConnection {
  private sock: WASocket | null = null;
  private authDir: string;
  private messageHandler: ((message: proto.IWebMessageInfo) => void) | null = null;

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

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Escaneie o QR Code abaixo com seu WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n');
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
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        if (message.key.fromMe) continue;
        if (!message.message) continue;

        if (this.messageHandler) {
          this.messageHandler(message);
        }
      }
    });

    return this.sock;
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
