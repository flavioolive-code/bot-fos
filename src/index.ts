import * as dotenv from 'dotenv';
dotenv.config();

import * as http from 'http';

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
    console.log('📊 Carregando módulos...');
    
    const { WhatsAppConnection } = await import('./whatsapp/connection');
    const { MessageHandler } = await import('./whatsapp/handler');
    const { SheetsService } = await import('./services/sheets');
    const { MonitorService } = await import('./services/monitor');

    console.log('📊 Conectando ao Google Sheets...');
    const sheetsService = new SheetsService();
    await sheetsService.initialize();

    console.log('📈 Inicializando monitoramento...');
    const monitorService = new MonitorService(sheetsService);

    console.log('📱 Conectando ao WhatsApp...');
    const connection = new WhatsAppConnection();

    const handler = new MessageHandler(
      connection,
      sheetsService,
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
