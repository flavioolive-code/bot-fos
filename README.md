# Bot FOS - Financeiro WhatsApp

Bot financeiro pessoal para WhatsApp com controle de gastos, contas a pagar e lista de compras.

## Funcionalidades

### Registro de Gastos
Registre seus gastos rapidamente via texto:
- "Almoço R$50"
- "Gastei 30 no uber"
- "Supermercado 150"

### Contas a Pagar
Controle suas contas com vencimento:
- "Conta de luz R$150 vence dia 15"
- "Internet R$100 vence dia 10"
- Visualize contas pendentes
- Marque contas como pagas

### Lista de Compras
Gerencie sua lista de compras:
- "Comprar leite, pão, ovos"
- "Lista" para ver itens pendentes
- "Comprou leite" para marcar como comprado

### Processamento de Áudio
Envie áudio falando seus gastos e o bot transcreve automaticamente.

### Processamento de Imagens
Envie fotos de recibos e o bot extrai os dados automaticamente.

### Sistema de Alertas
O bot monitora o uso dos serviços gratuitos e avisa quando está próximo do limite.

## Pré-requisitos

- Node.js 18+
- Conta Google Cloud (gratuito)
- WhatsApp no celular

## Instalação

```bash
# Clonar repositório
git clone https://github.com/flavioolive-code/bot-fos.git
cd bot-fos

# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
```

## Configuração

### 1. Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Crie um projeto: "Bot FOS"
3. Habilite as APIs:
   - Google Sheets API
   - Google Speech-to-Text API
   - Google Cloud Vision API
4. Crie uma Service Account
5. Baixe o arquivo de credenciais JSON
6. Renomeie para `google-credentials.json` e coloque na pasta `credentials/`

### 2. Google Sheets

1. Crie uma planilha no Google Sheets
2. Nomeie como "Bot FOS - Finanças"
3. Copie o ID da planilha (da URL)
4. Compartilhe a planilha com o email da Service Account

### 3. Variáveis de Ambiente

Edite o arquivo `.env`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-credentials.json
GOOGLE_SHEETS_ID=sua-planilha-id-aqui
BOT_NAME=Bot FOS
PREFIX=!
```

## Uso

### Iniciar o Bot

```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm run build
npm start
```

### Conectar ao WhatsApp

1. Execute o bot
2. Escaneie o QR Code com seu WhatsApp
3. Envie "Ajuda" para ver os comandos disponíveis

### Comandos Disponíveis

| Comando | Exemplo | Descrição |
|---------|---------|-----------|
| Registrar gasto | "Almoço R$50" | Adiciona gasto |
| Registrar conta | "Luz R$150 vence dia 15" | Adiciona conta |
| Lista de compras | "Comprar leite, pão" | Adiciona itens |
| Resumo | "Resumo" | Resumo mensal |
| Contas | "Contas" | Contas pendentes |
| Lista | "Lista" | Lista de compras |
| Ajuda | "Ajuda" | Lista comandos |

## Estrutura do Projeto

```
bot-fos/
├── src/
│   ├── index.ts              # Ponto de entrada
│   ├── whatsapp/
│   │   ├── connection.ts     # Conexão WhatsApp
│   │   └── handler.ts        # Processador de mensagens
│   ├── services/
│   │   ├── sheets.ts         # Google Sheets
│   │   ├── speech.ts         # Speech-to-Text
│   │   ├── vision.ts         # Vision/OCR
│   │   └── monitor.ts        # Monitoramento
│   ├── models/
│   │   └── types.ts          # Tipos TypeScript
│   └── utils/
│       ├── currency.ts       # Utilitários monetários
│       └── date.ts           # Utilitários de data
├── credentials/              # Credenciais Google
├── .env.example              # Template variáveis
├── package.json              # Dependências
├── tsconfig.json             # Configuração TypeScript
└── README.md                 # Documentação
```

## Limites Gratuitos

| Serviço | Limite | Uso |
|---------|--------|-----|
| Google Sheets | 100 requisições/dia | Armazenamento |
| Google Speech | 60 minutos/mês | Transcrição de áudio |
| Google Vision | 1.000 imagens/mês | OCR de recibos |

O bot monitora automaticamente o uso e avisa quando está próximo do limite.

## Tecnologias

- **Node.js/TypeScript** - Runtime e linguagem
- **Baileys** - Conexão WhatsApp
- **Google Sheets API** - Armazenamento
- **Google Speech-to-Text** - Transcrição de áudio
- **Google Cloud Vision** - OCR de imagens

## Licença

MIT

## Autor

Flavio Oliveira - [GitHub](https://github.com/flavioolive-code)
