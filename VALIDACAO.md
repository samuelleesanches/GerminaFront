# Validação desta entrega

Data: 1 de outubro de 2026. Build: `e11ea4b42e75fad1`.

## Verificações concluídas

| Verificação | Resultado |
| --- | --- |
| TypeScript do projeto | `tsc --noEmit` aprovado |
| TypeScript do Worker e gateway | `tsc -p tsconfig.cloudflare.json` aprovado |
| Build de produção do frontend | `npm run build:cloudflare` aprovado |
| Bundle do Worker | `wrangler deploy --dry-run` aprovado: 757,75 KiB; gzip 130,39 KiB |
| Testes selecionados | 13 arquivos: 117 testes aprovados e 1 ignorado pelo runner |
| ESLint nos novos sistemas | `src/cloudflare`, `src/core/strategy`, painel, configurações e testes Cloudflare: aprovado |
| Oxlint nos arquivos alterados | Aprovado |
| HTML de produção | Bootstrap preenchido, ambiente `prod`, sem placeholders EJS |
| Identificador de build | Frontend e Worker usam `e11ea4b42e75fad1` |
| Manifesto de assets | 2140 referências verificadas no build, incluindo nomes com caracteres codificados em URLs |
| Assets para Pages | 2178 arquivos; maior arquivo com 12,467,232 bytes, abaixo de 25 MiB |
| Configuração de deploy | Nomes, domínio extra, service binding, JSONC e preservação do build conferidos |

Os testes selecionados cobrem determinismo da estratégia, seca, custos e pré-requisitos, conservação de estoques/ouro no comércio, embargo, contratos, snapshots, protocolo binário, identificação de convidados, origem de WebSockets, criação/listagem de salas, controle do anfitrião, kicks persistidos, turnos ordenados e reentrada após reconstrução do objeto. Os testes de interface verificam os controles Lit, emissão das decisões e alterações reais das preferências gráficas. Os testes existentes selecionados verificam também combate, alianças, snapshots completos, GameRunner e reconexão/transporte do cliente.

Comando reproduzível da seleção:

```sh
npx vitest run tests/cloudflare tests/Attack.test.ts tests/AttackLogicGolden.test.ts tests/AllianceRequestExecution.test.ts tests/core/snapshot/CoreSnapshot.test.ts tests/core/snapshot/FullGameSnapshot.test.ts tests/core/snapshot/SnapshotFixtures.test.ts tests/core/GameRunner.test.ts tests/client/TransportReconnect.test.ts tests/client/TransportSendPaths.test.ts
```

Para apenas os testes Cloudflare:

```sh
npm run test:cloudflare
```

## Verificações ainda pendentes

Não foi feito deploy na conta Cloudflare do destinatário. Os comandos de publicação e a documentação foram preparados, mas não foram executados em produção.

O ambiente de execução usado nesta entrega bloqueia a abertura de sockets e servidores locais. O Wrangler dev falhou ao iniciar o runtime local, e o launcher tsx também encontrou um bloqueio de IPC. Assim, **o teste de integração com WebSockets no runtime real da Cloudflare não foi executado aqui**. Os testes de sala usam adaptadores em memória para storage e sockets; o dry-run verifica o bundle e as declarações, sem executar um Durable Object real.

Também não foi feita uma sessão visual em navegador com o renderer WebGL nem uma partida real entre computadores. Os checks de DOM não substituem essa verificação. Latência, cotas de produção, comportamento dos Alarms e persistência na plataforma precisam ser confirmados depois do deploy.

O teste completo está em `scripts/test-cloudflare.ts`. Siga a seção de testes locais do guia, inicie os dois processos e rode:

```sh
npm run test:cloudflare:integration
```

Você também pode direcioná-lo ao site publicado. No PowerShell:

```powershell
$env:TEST_PAGES_URL = "https://seu-projeto.pages.dev"
npm run test:cloudflare:integration
```

No Linux/macOS:

```sh
TEST_PAGES_URL=https://seu-projeto.pages.dev npm run test:cloudflare:integration
```

Use o mesmo `wrangler.backend.jsonc` do deploy, porque o script lê dele o `BUILD_ID`. O teste cria uma sala temporária com dois convidados, inicia a partida, envia ações e reconecta um dos jogadores. A sala é removida depois do período de inatividade previsto no backend. O teste automático pressupõe um ambiente sem Turnstile obrigatório.

Não foi executada a suíte completa do projeto original, incluindo seus testes de servidor Node, matchmaking e desempenho. O relatório se refere somente à seleção acima. O escopo funcional e as abstrações da estratégia estão descritos em `SISTEMAS_IMPLEMENTADOS.md`.
