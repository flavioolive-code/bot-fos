import * as dotenv from 'dotenv';
dotenv.config();

import * as http from 'http';
import { WhatsAppConnection } from './whatsapp/connection';
import { MessageHandler } from './whatsapp/handler';
import { SheetsService } from './services/sheets';
import { SpeechService } from './services/speech';
import { VisionService } from './services/vision';
import { MonitorService } from './services/monitor';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot FOS está rodando!');
});

server.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
});

async function main(): Promise<void> {
  console.log('🤖 Iniciando Bot FOS...\n');

  try {
    console.log('📊 Conectando ao Google Sheets...');
    const sheetsService = new SheetsService();
    await sheetsService.initialize();

    console.log('🎙️ Inicializando serviço de áudio...');
    const speechService = new SpeechService();

    console.log('📸 Inicializando serviço de visão...');
    const visionService = new VisionService();

    console.log('📈 Inicializando monitoramento...');
    const monitorService = new MonitorService(sheetsService);

    console.log('📱 Conectando ao WhatsApp...');
    const connection = new WhatsAppConnection();

    const handler = new MessageHandler(
      connection,
      sheetsService,
      speechService,
      visionService,
      monitorService
    );

    connection.setMessageHandler((message) => handler.handleMessage(message));

    await connection.connect();

    console.log('\n✅ Bot FOS está rodando!');
    console.log('💡 Envie "Ajuda" no WhatsApp para ver os comandos disponíveis\n');

    process.on('SIGINT', async () => {
      console.log('\n🛑 Encerrando Bot FOS...');
      await connection.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Encerrando Bot FOS...');
      await connection.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar Bot FOS:', error);
    process.exit(1);
  }
}

main().catch(console.error);
